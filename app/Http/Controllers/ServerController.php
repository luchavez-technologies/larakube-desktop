<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreServerRequest;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ReadinessCheck;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class ServerController extends Controller
{
    public function create(ReadinessCheck $readiness): Response
    {
        return Inertia::render('servers/create', [
            'providers' => Inertia::defer(fn (): ?array => $readiness->providers()),
        ]);
    }

    public function store(StoreServerRequest $request, CliRunner $runner): RedirectResponse
    {
        $provider = $request->string('provider')->toString();
        $stackName = $request->string('stack_name')->toString();

        $run = $runner->start(
            label: "Create server {$stackName}",
            arguments: [
                'cloud:create',
                "--provider={$provider}",
                '--vps',
                "--stack-name={$stackName}",
                '--region='.$request->string('region'),
                '--size='.$request->string('size'),
                '--json',
            ],
            secretEnvironment: $request->secretEnvironment(),
        );

        return to_route('runs.show', $run);
    }
}
