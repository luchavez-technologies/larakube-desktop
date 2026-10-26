<?php

namespace App\Http\Controllers;

use App\Services\LaraKube\CliInstaller;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\LocalCluster;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\TerminalIntegration;
use App\Services\Wsl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ReadinessController extends Controller
{
    public function show(ReadinessCheck $readiness, CliInstaller $installer, GlobalSettings $settings, LocalCluster $localCluster, Wsl $wsl, TerminalIntegration $terminal): Response
    {
        $usage = $settings->get()['usage'];

        return Inertia::render('readiness', [
            'windows' => $wsl->isWindows(),
            // wsl.exe itself (even a read-only `--status` probe) triggers
            // Windows's own native "WSL is not installed, press any key to
            // install" prompt when the feature isn't present at all —
            // confirmed live (2026-10-26) on a clean VM. Only probe for
            // usage === 'apps' (local k3s development, the one thing that
            // still needs WSL); a "tools"-only user should never see this
            // native prompt just from opening Setup.
            'wsl' => Inertia::defer(fn (): ?array => $wsl->isWindows() && $usage === 'apps' ? $wsl->check() : null),
            'catalog' => $readiness->catalog(),
            'providers' => Inertia::defer(fn (): ?array => $readiness->providers(statusOnly: true)),
            'cliInstallCommand' => ReadinessCheck::CLI_INSTALL_COMMAND,
            'cliChannel' => $installer->channel(),
            'usage' => $usage,
            'localCluster' => Inertia::defer(fn (): array => $localCluster->detect()),
            'cliDownloadUrl' => $installer->downloadUrl(),
            'terminalConfigured' => $terminal->isConfigured(),
            'shellProfile' => basename($terminal->profilePath()),
        ]);
    }

    public function setUsage(Request $request, GlobalSettings $settings): RedirectResponse
    {
        $validated = $request->validate([
            'usage' => ['required', 'string', 'in:'.implode(',', GlobalSettings::USAGES)],
        ]);

        // Picking "tools" means no app repos, so Projects/Dev Boxes default to
        // hidden — a person can still turn them back on from Settings afterward.
        $settings->update(['usage' => $validated['usage'], 'hideProjects' => $validated['usage'] === 'tools']);

        return back();
    }

    /** One tool's state as JSON, so the Setup page can fill each row in as its own check finishes. */
    public function toolStatus(string $tool, Request $request, ReadinessCheck $readiness): JsonResponse
    {
        abort_unless(array_key_exists($tool, ReadinessCheck::TOOLS), 404);

        return response()->json($readiness->status($tool, $request->boolean('fresh')));
    }

    public function setChannel(Request $request, CliInstaller $installer): RedirectResponse
    {
        $validated = $request->validate([
            'channel' => ['required', 'string', 'in:canary,stable'],
        ]);

        $installer->setChannel($validated['channel']);

        return back()->with('success', "CLI release channel switched to {$validated['channel']}.");
    }

    public function installTerminal(TerminalIntegration $terminal): RedirectResponse
    {
        $result = $terminal->install();

        return back()->with('success', $result['message']);
    }
}
