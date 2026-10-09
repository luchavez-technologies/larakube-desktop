<?php

namespace App\Services\LaraKube;

use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Support\Facades\Cache;
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
        'tofu' => ['label' => 'OpenTofu', 'purpose' => 'Provisions new cloud servers.', 'required' => true, 'versionArgs' => ['version'], 'installable' => true],
        'aws' => ['label' => 'AWS CLI', 'purpose' => 'Needed for Amazon Web Services servers.', 'required' => false, 'versionArgs' => ['--version'], 'installable' => true],
        'gcloud' => ['label' => 'Google Cloud CLI', 'purpose' => 'Needed for Google Cloud servers.', 'required' => false, 'versionArgs' => ['--version'], 'installable' => true],
        'git' => ['label' => 'Git', 'purpose' => 'Needed to deploy Laravel apps.', 'required' => false, 'versionArgs' => ['--version'], 'installable' => false, 'localOnly' => true],
        'docker' => ['label' => 'Docker', 'purpose' => 'Builds your apps to deploy them. OrbStack or Docker Desktop provide it; Podman works too.', 'required' => false, 'versionArgs' => ['--version'], 'installable' => false, 'localOnly' => true],
        'podman' => ['label' => 'Podman', 'purpose' => 'Builds your apps to deploy them, instead of Docker.', 'required' => false, 'versionArgs' => ['--version'], 'installable' => true, 'localOnly' => true],
    ];

    public const CLI_INSTALL_COMMAND = 'curl -fsSL https://cli.larakube.app/install.sh | bash -s -- --canary';

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
                'installable' => $tool['installable'] && ($slug !== 'podman' || PHP_OS_FAMILY === 'Linux'),
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
    public function providers(): ?array
    {
        $cli = $this->locator->find('larakube');

        if ($cli === null) {
            return null;
        }

        $isolated = $this->locator->isolate([$cli, 'cloud:providers', '--json', '--no-interaction']);

        try {
            $result = Process::env($isolated['environment'])
                ->timeout(60)
                ->run($isolated['command']);
        } catch (ProcessTimedOutException) {
            return null;
        }

        $decoded = json_decode($this->lastLine($result->output()), true);

        if (! $result->successful() || ! is_array($decoded) || ! is_array($decoded['providers'] ?? null)) {
            return null;
        }

        return array_values($decoded['providers']);
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

        return $firstLine !== '' ? $firstLine : null;
    }

    private function lastLine(string $output): string
    {
        $lines = preg_split('/\R/', trim($output)) ?: [];

        return (string) end($lines);
    }
}
