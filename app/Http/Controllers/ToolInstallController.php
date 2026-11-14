<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\LaraKube\CliInstaller;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ReadinessCheck;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class ToolInstallController extends Controller
{
    public function store(string $tool, CliRunner $runner, CliInstaller $installer, ReadinessCheck $readiness, Request $request): RedirectResponse
    {
        $definition = ReadinessCheck::TOOLS[$tool] ?? null;

        abort_if($definition === null || ! $definition['installable'], 404);

        if ($tool === 'larakube' || $tool === 'larakube-wsl') {
            return $this->installCliBinary($tool, $installer, $readiness, $request, 'Install');
        }

        $run = $runner->start(
            label: "Install {$definition['label']}",
            arguments: $this->installArguments($tool),
            kind: RunKind::InstallTool,
            subject: $tool,
            targetType: 'tool',
            targetName: $definition['label'],
            tool: $tool,
            environment: 'local',
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /**
     * Brings an already-installed command-line tool up to date — `setup
     * --tools={tool} --update`, the same CLI flag every other install here
     * goes through, just asking it to upgrade rather than only install when
     * missing.
     */
    public function updateTool(string $tool, CliRunner $runner, CliInstaller $installer, ReadinessCheck $readiness, Request $request): RedirectResponse
    {
        if ($tool === 'larakube') {
            return $this->updateCli($runner, $installer, $readiness, $request);
        }

        if ($tool === 'larakube-wsl') {
            return $this->installCliBinary('larakube-wsl', $installer, $readiness, $request, 'Update');
        }

        $definition = ReadinessCheck::TOOLS[$tool] ?? null;

        abort_if($definition === null || ! $definition['installable'], 404);

        $run = $runner->start(
            label: "Update {$definition['label']}",
            // dnsmasq's install (`trust`) is already idempotent — re-running
            // the exact same command is the update, same as every other
            // `larakube trust` call.
            arguments: $tool === 'dnsmasq' ? $this->installArguments($tool) : ($tool === 'podman' ? ['runtime:install', '--runtime=podman', '--update'] : ['setup', "--tools={$tool}", '--update']),
            kind: RunKind::InstallTool,
            subject: $tool,
            targetType: 'tool',
            targetName: $definition['label'],
            tool: $tool,
            environment: 'local',
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /**
     * @return list<string>
     */
    private function installArguments(string $tool): array
    {
        return match ($tool) {
            'podman' => ['runtime:install', '--runtime=podman'],
            // dnsmasq has no standalone `setup --tools=dnsmasq` flag — `trust`
            // is the CLI's existing, idempotent "generate the local CA, trust
            // it, and set up dnsmasq for wildcard DNS" command (see
            // InteractsWithTrust::setupDnsmasq()).
            'dnsmasq' => ['trust'],
            default => ['setup', "--tools={$tool}"],
        };
    }

    /**
     * Brings the LaraKube CLI up to date using the same direct download/replace
     * installer used for initial installation on all platforms (including Windows,
     * where self-updating via `larakube.exe update` cannot recover if the binary
     * is broken or locked).
     */
    public function updateCli(CliRunner $runner, CliInstaller $installer, ReadinessCheck $readiness, Request $request): RedirectResponse
    {
        return $this->installCliBinary('larakube', $installer, $readiness, $request, 'Install');
    }

    private function installCliBinary(
        string $tool,
        CliInstaller $installer,
        ReadinessCheck $readiness,
        Request $request,
        string $verb = 'Install',
    ): RedirectResponse {
        $isWsl = $tool === 'larakube-wsl';
        $name = $isWsl ? 'LaraKube CLI (WSL)' : 'LaraKube CLI';
        $channel = (string) $request->input('channel', $installer->channel());
        $url = $isWsl ? $installer->linuxCacheDownloadUrl($channel) : $installer->downloadUrl($channel);
        $command = $isWsl ? ['cli:install', '--wsl', "--channel={$channel}"] : ['cli:install', "--channel={$channel}"];

        $run = Run::create([
            'label' => "{$verb} {$name} ({$channel})",
            'kind' => RunKind::InstallTool,
            'subject' => $tool,
            'target_type' => 'tool',
            'target_name' => $name,
            'tool' => $tool,
            'environment' => $isWsl ? 'wsl' : 'local',
            'command' => $command,
            'status' => RunStatus::Running,
            'output' => "Downloading {$name} ({$channel} channel) from {$url}...\n",
        ]);

        $result = $isWsl ? $installer->installWsl($channel) : $installer->install($channel);
        $readiness->forget($tool);

        if ($result['success']) {
            $run->update([
                'status' => RunStatus::Succeeded,
                'finished_at' => now(),
                'output' => $run->output."✓ {$name} installed successfully to {$result['path']}.\n",
            ]);
        } else {
            $run->update([
                'status' => RunStatus::Failed,
                'finished_at' => now(),
                'output' => $run->output."✗ Failed to install {$name}: {$result['error']}\n",
            ]);
        }

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }
}
