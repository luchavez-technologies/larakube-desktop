<?php

namespace App\Services\LaraKube;

use App\Models\CloudProvider;
use App\Models\CloudRegion;
use App\Models\CloudSize;
use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Process;

/**
 * Inspects the tools the desktop flows depend on. Presence and versions only;
 * installing is delegated to `larakube setup --tools=`, which owns the
 * per-platform install logic.
 */
class ReadinessCheck
{
    /**
     * @var array<string, array{label: string, purpose: string, required: bool, versionArgs: list<string>, installable: bool, localOnly?: bool}>
     */
    public const TOOLS = [
        'larakube' => ['label' => 'LaraKube CLI', 'purpose' => 'Runs every action in this app.', 'required' => true, 'versionArgs' => ['--version'], 'installable' => true],
        'kubectl' => ['label' => 'kubectl', 'purpose' => 'Talks to your Kubernetes clusters.', 'required' => true, 'versionArgs' => ['version', '--client'], 'installable' => true],
        'k9s' => ['label' => 'k9s', 'purpose' => 'Terminal UI for browsing and managing Kubernetes clusters — optional, but what "Open in Terminal" uses on a server page.', 'required' => false, 'versionArgs' => ['version', '--short'], 'installable' => true],
        'tofu' => ['label' => 'OpenTofu', 'purpose' => 'Provisions new cloud servers.', 'required' => true, 'versionArgs' => ['version'], 'installable' => true],
        'aws' => ['label' => 'AWS CLI', 'purpose' => 'Needed for Amazon Web Services servers.', 'required' => false, 'versionArgs' => ['--version'], 'installable' => true],
        'gcloud' => ['label' => 'Google Cloud CLI', 'purpose' => 'Needed for Google Cloud servers.', 'required' => false, 'versionArgs' => ['--version'], 'installable' => true],
        'gh' => ['label' => 'GitHub CLI', 'purpose' => 'Manages GitHub Actions CI and GHCR image registry secrets.', 'required' => false, 'versionArgs' => ['--version'], 'installable' => true, 'localOnly' => true],
        'tea' => ['label' => 'Tea CLI', 'purpose' => 'Manages Forgejo and Gitea git forge repository secrets.', 'required' => false, 'versionArgs' => ['--version'], 'installable' => true, 'localOnly' => true],
        'git' => ['label' => 'Git', 'purpose' => 'Needed to deploy Laravel apps.', 'required' => false, 'versionArgs' => ['--version'], 'installable' => false, 'localOnly' => true],
        'docker' => ['label' => 'Docker', 'purpose' => 'Builds your apps to deploy them. OrbStack or Docker Desktop provide it; Podman works too.', 'required' => false, 'versionArgs' => ['--version'], 'installable' => false, 'localOnly' => true],
        'podman' => ['label' => 'Podman', 'purpose' => 'Builds your apps to deploy them, instead of Docker.', 'required' => false, 'versionArgs' => ['--version'], 'installable' => true, 'localOnly' => true],
        'dnsmasq' => ['label' => 'dnsmasq', 'purpose' => 'Wildcard local-domain DNS so project hosts resolve automatically, without a sudo prompt on every `up`.', 'required' => false, 'versionArgs' => ['--version'], 'installable' => true, 'localOnly' => true],
    ];

    public const CLI_INSTALL_COMMAND = 'curl -fsSL https://docs.larakube.app/install.sh | bash -s -- --canary';

    /** Which cloud provider (GlobalSettings::CLOUD_PROVIDERS key) each provider-specific CLI tool is for. DO/Hetzner need no CLI binary — just the API token fields already on Setup/Settings. */
    private const PROVIDER_TOOLS = ['aws' => 'aws', 'gcloud' => 'gcp'];

    public function __construct(private ToolLocator $locator) {}

    /**
     * Every tool the page lists, without checking this computer, so the page can
     * draw its rows at once and fill each in as its check finishes.
     *
     * @param  ?list<string>  $intendedProviders  When given and non-empty, provider-specific tools (aws/gcloud) whose provider isn't in this list are left out entirely. Null or empty means "show everything" — used by the regular Setup page and by onboarding before a provider choice is made.
     * @return list<array{slug: string, label: string, purpose: string, required: bool, installable: bool, localOnly: bool}>
     */
    public function catalog(?array $intendedProviders = null): array
    {
        $catalog = [];

        foreach (self::TOOLS as $slug => $tool) {
            if (! empty($intendedProviders) && array_key_exists($slug, self::PROVIDER_TOOLS) && ! in_array(self::PROVIDER_TOOLS[$slug], $intendedProviders, true)) {
                continue;
            }

            $catalog[] = [
                'slug' => $slug,
                'label' => $tool['label'],
                'purpose' => $tool['purpose'],
                'required' => $tool['required'],
                'localOnly' => $tool['localOnly'] ?? false,
                // Podman installs through apt, so only Linux (and WSL) can offer it.
                'installable' => $tool['installable']
                    && ($slug !== 'podman' || PHP_OS_FAMILY === 'Linux')
                    // dnsmasq wildcards local DNS via the host's own resolver — Windows
                    // has no such mechanism (it resolves via the Windows hosts file
                    // instead, see InteractsWithHosts::ensureWindowsHostsAreSet() in the
                    // CLI), so `larakube trust` is a no-op for it there.
                    && ($slug !== 'dnsmasq' || PHP_OS_FAMILY !== 'Windows'),
            ];
        }

        return $catalog;
    }

    /**
     * One tool's state on this computer. Remembered for a few minutes, because
     * running `--version` on every tool is what made the Setup page slow.
     *
     * @return array{installed: bool, path: ?string, version: ?string, diagnostic: ?string}
     */
    public function status(string $slug, bool $fresh = false): array
    {
        $key = "readiness.tool.{$slug}";

        if ($fresh) {
            Cache::forget($key);
        }

        return Cache::remember($key, now()->addMinutes(5), function () use ($slug): array {
            $path = $this->locator->find($slug);

            return [
                'installed' => $path !== null,
                'path' => $path,
                'version' => $path !== null ? $this->version($path, self::TOOLS[$slug]['versionArgs']) : null,
                'diagnostic' => $path === null ? $this->locator->lastFailure() : null,
            ];
        });
    }

    /** Forget what is remembered about one tool, or all of them, after something installed. */
    public function forget(?string $slug = null): void
    {
        if ($slug === null) {
            Cache::forget('readiness.providers');
            Cache::forget('readiness.providers.status');
            Cache::forget('readiness.providers.full');
        }

        foreach ($slug !== null ? [$slug] : array_keys(self::TOOLS) as $tool) {
            Cache::forget("readiness.tool.{$tool}");
        }
    }

    /**
     * @return list<array{slug: string, label: string, purpose: string, required: bool, installable: bool, localOnly: bool, installed: bool, path: ?string, version: ?string}>
     */
    public function tools(): array
    {
        return array_map(fn (array $entry): array => $entry + $this->status($entry['slug']), $this->catalog());
    }

    /**
     * Providers, regions, sizes, and credential status straight from the CLI,
     * or null when the CLI is missing or predates `cloud:providers`.
     *
     * @return list<array<string, mixed>>|null
     */
    public function providers(bool $fresh = false, bool $statusOnly = false): ?array
    {
        $cli = $this->locator->find('larakube');

        if ($cli === null) {
            return null;
        }

        $key = 'readiness.providers.'.($statusOnly ? 'status' : 'full');

        if ($fresh) {
            Cache::forget($key);
        }

        $cached = Cache::get($key);
        if ($cached !== null) {
            return $cached;
        }

        $commandArgs = [$cli, 'cloud:providers'];
        if ($statusOnly) {
            $commandArgs[] = '--status-only';
        }
        $commandArgs[] = '--json';
        $commandArgs[] = '--no-interaction';

        $isolated = $this->locator->isolate($commandArgs);

        try {
            $result = Process::env($isolated['environment'])
                ->timeout(60)
                ->run($isolated['command']);
        } catch (ProcessTimedOutException) {
            return null;
        }

        // Graceful fallback for older CLIs that don't recognize --status-only
        if ($statusOnly && ! $result->successful() && str_contains($result->errorOutput().$result->output(), '--status-only')) {
            return $this->providers($fresh, statusOnly: false);
        }

        $decoded = json_decode($this->lastLine($result->output()), true);

        if (! $result->successful() || ! is_array($decoded) || ! is_array($decoded['providers'] ?? null)) {
            return null;
        }

        $providers = array_values($decoded['providers']);
        Cache::put($key, $providers, now()->addMinutes(5));

        $this->syncCredentialsToDatabase($providers);

        return $providers;
    }

    /**
     * Discovers live instance types and regions for a single provider in the background,
     * updates the local SQLite tables, and returns the Inertia-formatted provider array.
     *
     * @return array<string, mixed>|null
     */
    public function providerCatalog(string $providerSlug): ?array
    {
        $cli = $this->locator->find('larakube');

        if ($cli === null) {
            $provider = CloudProvider::with(['regions', 'sizes'])->where('slug', $providerSlug)->first();

            return $provider?->toInertiaProvider();
        }

        $commandArgs = [$cli, 'cloud:providers', "--provider={$providerSlug}", '--json', '--no-interaction'];
        $isolated = $this->locator->isolate($commandArgs);

        try {
            $result = Process::env($isolated['environment'])
                ->timeout(90)
                ->run($isolated['command']);
        } catch (ProcessTimedOutException) {
            $provider = CloudProvider::with(['regions', 'sizes'])->where('slug', $providerSlug)->first();

            return $provider?->toInertiaProvider();
        }

        $decoded = json_decode($this->lastLine($result->output()), true);

        if (! $result->successful() || ! is_array($decoded) || ! is_array($decoded['providers'] ?? null)) {
            $provider = CloudProvider::with(['regions', 'sizes'])->where('slug', $providerSlug)->first();

            return $provider?->toInertiaProvider();
        }

        /** @var array<string, mixed>|null $pData */
        $pData = collect($decoded['providers'])->first(fn (mixed $item): bool => is_array($item) && ($item['slug'] ?? null) === $providerSlug);

        if (! is_array($pData)) {
            $provider = CloudProvider::with(['regions', 'sizes'])->where('slug', $providerSlug)->first();

            return $provider?->toInertiaProvider();
        }

        DB::transaction(function () use ($pData, $providerSlug): void {
            $credentials = is_array($pData['credentials'] ?? null) ? $pData['credentials'] : [];
            $pricing = is_array($pData['pricing'] ?? null) ? $pData['pricing'] : [];

            $provider = CloudProvider::updateOrCreate(['slug' => $providerSlug], [
                'label' => (string) ($pData['label'] ?? $providerSlug),
                'default_region' => (string) ($pData['defaultRegion'] ?? ''),
                'default_vps_size' => (string) ($pData['defaultVpsSize'] ?? ''),
                'default_managed_size' => is_string($pData['defaultManagedSize'] ?? null) ? $pData['defaultManagedSize'] : null,
                'managed_provider' => is_string($pData['managedProvider'] ?? null) ? $pData['managedProvider'] : null,
                'ha_option' => is_string($pData['haOption'] ?? null) ? $pData['haOption'] : null,
                'ha_cost' => is_string($pData['haCost'] ?? null) ? $pData['haCost'] : null,
                'pricing_url' => is_string($pricing['officialPricingUrl'] ?? null) ? $pricing['officialPricingUrl'] : null,
                'credentials_ready' => (bool) ($credentials['ready'] ?? false),
                'credentials_hint' => is_string($credentials['hint'] ?? null) ? $credentials['hint'] : null,
                'active_account' => is_string($pData['activeAccount'] ?? null) ? $pData['activeAccount'] : null,
                'accounts' => is_array($pData['accounts'] ?? null) ? $pData['accounts'] : null,
                'source' => (string) ($pricing['source'] ?? 'live'),
                'last_synced_at' => now(),
            ]);

            if (is_array($pData['regions'] ?? null)) {
                foreach ($pData['regions'] as $reg) {
                    if (! is_array($reg)) {
                        continue;
                    }
                    $val = (string) ($reg['value'] ?? $reg['slug'] ?? '');
                    $lbl = (string) ($reg['label'] ?? $val);
                    if ($val !== '') {
                        CloudRegion::updateOrCreate(
                            ['cloud_provider_id' => $provider->id, 'slug' => $val],
                            ['label' => $lbl, 'is_recommended' => str_contains($lbl, 'Recommended')]
                        );
                    }
                }
            }

            if (is_array($pData['vpsSizes'] ?? null)) {
                foreach ($pData['vpsSizes'] as $s) {
                    if (! is_array($s)) {
                        continue;
                    }
                    $val = (string) ($s['value'] ?? $s['slug'] ?? '');
                    $lbl = (string) ($s['label'] ?? $val);
                    if ($val !== '') {
                        $parsed = $this->parseSizeLabel($lbl);
                        CloudSize::updateOrCreate(
                            ['cloud_provider_id' => $provider->id, 'slug' => $val, 'target_kind' => 'vps'],
                            [
                                'label' => $lbl,
                                'vcpu' => $parsed['vcpu'],
                                'memory_mb' => $parsed['memory_mb'],
                                'monthly_price' => $parsed['monthly_price'],
                                'currency' => $parsed['currency'],
                                'is_recommended' => $parsed['is_recommended'],
                            ]
                        );
                    }
                }
            }

            if (is_array($pData['managedSizes'] ?? null)) {
                foreach ($pData['managedSizes'] as $s) {
                    if (! is_array($s)) {
                        continue;
                    }
                    $val = (string) ($s['value'] ?? $s['slug'] ?? '');
                    $lbl = (string) ($s['label'] ?? $val);
                    if ($val !== '') {
                        $parsed = $this->parseSizeLabel($lbl);
                        CloudSize::updateOrCreate(
                            ['cloud_provider_id' => $provider->id, 'slug' => $val, 'target_kind' => 'managed'],
                            [
                                'label' => $lbl,
                                'vcpu' => $parsed['vcpu'],
                                'memory_mb' => $parsed['memory_mb'],
                                'monthly_price' => $parsed['monthly_price'],
                                'currency' => $parsed['currency'],
                                'is_recommended' => $parsed['is_recommended'],
                            ]
                        );
                    }
                }
            }
        });

        Cache::forget('readiness.providers.status');
        Cache::forget('readiness.providers.full');

        $provider = CloudProvider::with(['regions', 'sizes'])->where('slug', $providerSlug)->first();

        return $provider?->toInertiaProvider();
    }

    /**
     * @param  list<array<string, mixed>>  $providers
     */
    private function syncCredentialsToDatabase(array $providers): void
    {
        foreach ($providers as $pData) {
            $slug = $pData['slug'] ?? null;
            if (! is_string($slug)) {
                continue;
            }

            $provider = CloudProvider::where('slug', $slug)->first();
            if ($provider) {
                $credentials = is_array($pData['credentials'] ?? null) ? $pData['credentials'] : [];
                $provider->update([
                    'credentials_ready' => (bool) ($credentials['ready'] ?? false),
                    'credentials_hint' => is_string($credentials['hint'] ?? null) ? $credentials['hint'] : null,
                    'active_account' => is_string($pData['activeAccount'] ?? null) ? $pData['activeAccount'] : null,
                    'accounts' => is_array($pData['accounts'] ?? null) ? $pData['accounts'] : null,
                ]);
            }
        }
    }

    /**
     * @return array{vcpu: int, memory_mb: int, monthly_price: ?float, currency: string, is_recommended: bool}
     */
    private function parseSizeLabel(string $label): array
    {
        $vcpu = 2;
        if (preg_match('/(\d+)\s*vCPU/i', $label, $m)) {
            $vcpu = (int) $m[1];
        }

        $memoryMb = 2048;
        if (preg_match('/([\d\.]+)\s*(GB|MB)\s*RAM/i', $label, $m)) {
            $val = (float) $m[1];
            $unit = strtoupper($m[2]);
            $memoryMb = $unit === 'GB' ? (int) ($val * 1024) : (int) $val;
        }

        $monthlyPrice = null;
        if (preg_match('/~?[\$€£]([\d\.]+)\s*\/mo/i', $label, $m)) {
            $monthlyPrice = (float) $m[1];
        }

        $currency = 'USD';
        if (str_contains($label, '€')) {
            $currency = 'EUR';
        } elseif (str_contains($label, '£')) {
            $currency = 'GBP';
        }

        $isRecommended = str_contains($label, 'Recommended');

        return [
            'vcpu' => $vcpu,
            'memory_mb' => $memoryMb,
            'monthly_price' => $monthlyPrice,
            'currency' => $currency,
            'is_recommended' => $isRecommended,
        ];
    }

    /**
     * @param  list<string>  $arguments
     */
    private function version(string $path, array $arguments): ?string
    {
        $isolated = $this->locator->isolate([$path, ...$arguments]);

        $result = Process::env($isolated['environment'])
            ->timeout(20)
            ->run($isolated['command']);

        if (! $result->successful()) {
            return null;
        }

        $firstLine = trim(strtok(trim($result->output()) ?: trim($result->errorOutput()), "\n") ?: '');
        // k9s --short's columns are padded with runs of spaces ("Version              0.50.18") —
        // collapsing is a no-op for every other tool's single-spaced first line.
        $firstLine = (string) preg_replace('/\s+/', ' ', $firstLine);

        return $firstLine !== '' ? $firstLine : null;
    }

    private function lastLine(string $output): string
    {
        $lines = preg_split('/\R/', trim($output)) ?: [];

        return (string) end($lines);
    }
}
