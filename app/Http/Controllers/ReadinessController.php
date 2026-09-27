<?php

namespace App\Http\Controllers;

use App\Services\LaraKube\ReadinessCheck;
use Inertia\Inertia;
use Inertia\Response;

class ReadinessController extends Controller
{
    public function show(ReadinessCheck $readiness): Response
    {
        return Inertia::render('readiness', [
            'tools' => Inertia::defer(fn (): array => $readiness->tools()),
            'providers' => Inertia::defer(fn (): ?array => $readiness->providers()),
            'cliInstallCommand' => ReadinessCheck::CLI_INSTALL_COMMAND,
        ]);
    }
}
