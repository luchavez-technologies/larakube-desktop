<?php

namespace App\Http\Controllers;

use App\Services\LaraKube\CliInstaller;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\Tools\CliToolRegistry;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class ToolInstallController extends Controller
{
    public function store(
        string $tool,
        CliRunner $runner,
        CliInstaller $installer,
        ReadinessCheck $readiness,
        CliToolRegistry $registry,
        Request $request,
    ): RedirectResponse {
        return $this->dispatch($tool, $runner, $installer, $readiness, $registry, $request, 'Install');
    }

    /**
     * Updates or reinstalls an installed command-line tool via its dedicated
     * CliToolContract service class.
     */
    public function updateTool(
        string $tool,
        CliRunner $runner,
        CliInstaller $installer,
        ReadinessCheck $readiness,
        CliToolRegistry $registry,
        Request $request,
    ): RedirectResponse {
        $defaultVerb = $tool === 'larakube' ? 'Install' : 'Update';

        return $this->dispatch($tool, $runner, $installer, $readiness, $registry, $request, $defaultVerb);
    }

    /**
     * Brings the LaraKube CLI up to date using the same direct download/replace
     * installer used for initial installation on all platforms (including Windows,
     * where self-updating via `larakube.exe update` cannot recover if the binary
     * is broken or locked).
     */
    public function updateCli(
        CliRunner $runner,
        CliInstaller $installer,
        ReadinessCheck $readiness,
        CliToolRegistry $registry,
        Request $request,
    ): RedirectResponse {
        return $this->dispatch('larakube', $runner, $installer, $readiness, $registry, $request, 'Install');
    }

    private function dispatch(
        string $tool,
        CliRunner $runner,
        CliInstaller $installer,
        ReadinessCheck $readiness,
        CliToolRegistry $registry,
        Request $request,
        string $defaultVerb,
    ): RedirectResponse {
        $toolService = $registry->find($tool);

        abort_if($toolService === null || ! $toolService->canInstall(), 404);

        $channel = (string) $request->input('channel', $installer->channel());
        $verb = $request->boolean('reinstall') ? 'Reinstall' : $defaultVerb;
        $run = $toolService->dispatchInstall($runner, $installer, $readiness, $channel, $verb);

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }
}
