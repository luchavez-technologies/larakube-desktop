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
            'wsl' => Inertia::defer(fn (): ?array => $wsl->isWindows() ? $wsl->check() : null),
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
