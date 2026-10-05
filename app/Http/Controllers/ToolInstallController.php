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

            return to_route('runs.show', $run);
        }

        $run = $runner->start(
            label: "Install {$definition['label']}",
            arguments: $tool === 'podman' ? ['runtime:install', '--runtime=podman'] : ['setup', "--tools={$tool}"],
            kind: RunKind::InstallTool,
            subject: $tool,
            targetType: 'tool',
            targetName: $definition['label'],
            tool: $tool,
            environment: 'local',
        );

        return to_route('runs.show', $run);
    }

    /**
     * Brings the LaraKube CLI up to date. Inside the Windows distro that is the CLI's own `update` (its user can sudo without a
     * password); on a Mac or Linux it is the same download that installed it, which replaces the file in place.
     */
    public function updateCli(CliRunner $runner, CliInstaller $installer, ReadinessCheck $readiness, ToolLocator $locator, Request $request): RedirectResponse
    {
        if (! $locator->isWindows()) {
            return $this->store('larakube', $runner, $installer, $readiness, $request);
        }

        $channel = in_array($request->input('channel'), CliInstaller::CHANNELS, true) ? (string) $request->input('channel') : $installer->channel();

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

        return to_route('runs.show', $run);
    }
}
