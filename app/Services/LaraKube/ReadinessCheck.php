<?php

namespace App\Services\LaraKube;

use Illuminate\Support\Facades\Process;

/**
 * Inspects the tools the desktop flows depend on. Presence and versions only;
 * installing is delegated to `larakube setup --tools=`, which owns the
 * per-platform install logic.
 */
class ReadinessCheck
{
    /**
     * @var array<string, array{label: string, purpose: string, required: bool, versionArgs: list<string>, installable: bool}>
     */
    public const TOOLS = [
        'larakube' => ['label' => 'LaraKube CLI', 'purpose' => 'Runs every action in this app.', 'required' => true, 'versionArgs' => ['--version'], 'installable' => true],
        'kubectl' => ['label' => 'kubectl', 'purpose' => 'Talks to your Kubernetes clusters.', 'required' => true, 'versionArgs' => ['version', '--client'], 'installable' => true],
        'tofu' => ['label' => 'OpenTofu', 'purpose' => 'Provisions new cloud servers.', 'required' => true, 'versionArgs' => ['version'], 'installable' => true],
        'aws' => ['label' => 'AWS CLI', 'purpose' => 'Needed for Amazon Web Services servers.', 'required' => false, 'versionArgs' => ['--version'], 'installable' => true],
        'gcloud' => ['label' => 'Google Cloud CLI', 'purpose' => 'Needed for Google Cloud servers.', 'required' => false, 'versionArgs' => ['--version'], 'installable' => true],
        'git' => ['label' => 'Git', 'purpose' => 'Needed to deploy Laravel apps.', 'required' => false, 'versionArgs' => ['--version'], 'installable' => false],
        'docker' => ['label' => 'Docker', 'purpose' => 'Builds your apps to deploy them. OrbStack or Docker Desktop provide it; Podman works too.', 'required' => false, 'versionArgs' => ['--version'], 'installable' => false],
        'podman' => ['label' => 'Podman', 'purpose' => 'Builds your apps to deploy them, instead of Docker.', 'required' => false, 'versionArgs' => ['--version'], 'installable' => true],
    ];

    public const CLI_INSTALL_COMMAND = 'curl -fsSL https://cli.larakube.app/install.sh | bash -s -- --canary';

    public function __construct(private ToolLocator $locator) {}

    /**
     * @return list<array{slug: string, label: string, purpose: string, required: bool, installable: bool, installed: bool, path: ?string, version: ?string}>
     */
    public function tools(): array
    {
        $tools = [];

        foreach (self::TOOLS as $slug => $tool) {
            $path = $this->locator->find($slug);

            $tools[] = [
                'slug' => $slug,
                'label' => $tool['label'],
                'purpose' => $tool['purpose'],
                'required' => $tool['required'],
                // Podman installs through apt, so only Linux (and WSL) can offer it.
                'installable' => $tool['installable'] && ($slug !== 'podman' || PHP_OS_FAMILY === 'Linux'),
                'installed' => $path !== null,
                'path' => $path,
                'version' => $path !== null ? $this->version($path, $tool['versionArgs']) : null,
            ];
        }

        return $tools;
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

        $result = Process::env($isolated['environment'])
            ->timeout(60)
            ->run($isolated['command']);

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
