<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\LaraKube\CliInstaller;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class ToolInstallController extends Controller
{
    public function store(string $tool, CliRunner $runner, CliInstaller $installer, ReadinessCheck $readiness, Request $request): RedirectResponse
    {
        $definition = ReadinessCheck::TOOLS[$tool] ?? null;

        abort_if($definition === null || ! $definition['installable'], 404);

        if ($tool === 'larakube') {
            $channel = $request->input('channel', $installer->channel());
            $url = $installer->downloadUrl($channel);

            $run = Run::create([
                'label' => "Install LaraKube CLI ({$channel})",
                'kind' => RunKind::InstallTool,
                'subject' => 'larakube',
                'target_type' => 'tool',
                'target_name' => 'LaraKube CLI',
                'tool' => 'larakube',
                'environment' => 'local',
                'command' => ['cli:install', "--channel={$channel}"],
                'status' => RunStatus::Running,
                'output' => "Downloading LaraKube CLI ({$channel} channel) from {$url}...\n",
            ]);

            $result = $installer->install($channel);
            $readiness->forget('larakube');

            if ($result['success']) {
                $run->update([
                    'status' => RunStatus::Succeeded,
                    'finished_at' => now(),
                    'output' => $run->output."✓ LaraKube CLI installed successfully to {$result['path']}.\n",
                ]);
            } else {
                $run->update([
                    'status' => RunStatus::Failed,
                    'finished_at' => now(),
                    'output' => $run->output."✗ Failed to install LaraKube CLI: {$result['error']}\n",
                ]);
            }

            return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
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
    public function updateTool(string $tool, CliRunner $runner, CliInstaller $installer, ReadinessCheck $readiness, ToolLocator $locator, Request $request): RedirectResponse
    {
        if ($tool === 'larakube') {
            return $this->updateCli($runner, $installer, $readiness, $locator, $request);
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
     * Brings the LaraKube CLI up to date. On Windows `larakube update` runs via the native `larakube.exe` binary
     * (which updates both the Windows `.exe` and the WSL Linux binary in lockstep, or falls back to the in-distro
     * binary when `larakube.exe` is not yet installed); on a Mac or Linux it is the same download that installed it.
     */
    public function updateCli(CliRunner $runner, CliInstaller $installer, ReadinessCheck $readiness, ToolLocator $locator, Request $request): RedirectResponse
    {
        if (! $locator->isWindows()) {
            return $this->store('larakube', $runner, $installer, $readiness, $request);
        }

        $channel = in_array($request->input('channel'), CliInstaller::CHANNELS, true) ? (string) $request->input('channel') : $installer->channel();

        $readiness->forget('larakube');

        $run = $runner->start(
            label: "Update LaraKube CLI ({$channel})",
            arguments: ['update', ...($channel === 'canary' ? ['--canary'] : []), '--yes'],
            kind: RunKind::InstallTool,
            subject: 'larakube',
            targetType: 'tool',
            targetName: 'LaraKube CLI',
            tool: 'larakube',
            environment: 'local',
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }
}
