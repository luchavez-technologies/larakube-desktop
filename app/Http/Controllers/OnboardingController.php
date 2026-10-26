<?php

namespace App\Http\Controllers;

use App\Services\LaraKube\CliInstaller;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\Wsl;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class OnboardingController extends Controller
{
    public function show(ReadinessCheck $readiness, GlobalSettings $settings, CliInstaller $installer, Wsl $wsl): Response
    {
        $current = $settings->get();

        return Inertia::render('onboarding/index', [
            'windows' => $wsl->isWindows(),
            // wsl.exe itself (even a read-only `--status` probe) triggers
            // Windows's own native "WSL is not installed, press any key to
            // install" prompt when the feature isn't present at all —
            // confirmed live (2026-10-26) on a clean VM. Only probe for
            // usage === 'apps' (local k3s development, the one thing that
            // still needs WSL); a "tools"-only user should never see this
            // native prompt just from opening the app.
            'wsl' => Inertia::defer(fn (): ?array => $wsl->isWindows() && $current['usage'] === 'apps' ? $wsl->check() : null),
            'usage' => $current['usage'],
            'intendedProviders' => $current['intendedProviders'],
            'cloudProviders' => GlobalSettings::CLOUD_PROVIDERS,
            'catalog' => $readiness->catalog($current['intendedProviders']),
            'cliInstallCommand' => ReadinessCheck::CLI_INSTALL_COMMAND,
            'cliChannel' => $installer->channel(),
        ]);
    }

    public function setProviders(Request $request, GlobalSettings $settings): RedirectResponse
    {
        $validated = $request->validate([
            'providers' => ['present', 'array'],
            'providers.*' => ['string', 'in:'.implode(',', array_keys(GlobalSettings::CLOUD_PROVIDERS))],
        ]);

        $settings->update(['intendedProviders' => $validated['providers']]);

        return back();
    }

    public function complete(GlobalSettings $settings): RedirectResponse
    {
        $settings->completeOnboarding();

        return redirect()->route('dashboard');
    }

    public function reset(GlobalSettings $settings): RedirectResponse
    {
        $settings->resetOnboarding();

        return redirect()->route('onboarding');
    }
}
