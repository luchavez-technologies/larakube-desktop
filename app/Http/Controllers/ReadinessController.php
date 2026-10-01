<?php

namespace App\Http\Controllers;

use App\Services\LaraKube\CliInstaller;
use App\Services\LaraKube\ReadinessCheck;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ReadinessController extends Controller
{
    public function show(ReadinessCheck $readiness, CliInstaller $installer): Response
    {
        return Inertia::render('readiness', [
            'tools' => Inertia::defer(fn (): array => $readiness->tools()),
            'providers' => Inertia::defer(fn (): ?array => $readiness->providers()),
            'cliInstallCommand' => ReadinessCheck::CLI_INSTALL_COMMAND,
            'cliChannel' => $installer->channel(),
            'cliDownloadUrl' => $installer->downloadUrl(),
        ]);
    }

    public function setChannel(Request $request, CliInstaller $installer): RedirectResponse
    {
        $validated = $request->validate([
            'channel' => ['required', 'string', 'in:canary,stable'],
        ]);

        $installer->setChannel($validated['channel']);

        return back()->with('success', "CLI release channel switched to {$validated['channel']}.");
    }
}
