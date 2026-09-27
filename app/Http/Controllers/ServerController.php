<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Http\Requests\DestroyServerRequest;
use App\Http\Requests\StoreServerRequest;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\StackCatalog;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class ServerController extends Controller
{
    public function index(StackCatalog $catalog): Response
    {
        return Inertia::render('servers/index', [
            'servers' => Inertia::defer(fn (): ?array => $catalog->all()),
        ]);
    }

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
            kind: RunKind::CreateServer,
            subject: $stackName,
        );

        return to_route('runs.show', $run);
    }

    public function show(string $server, StackCatalog $catalog): Response
    {
        $stack = $catalog->find($server);

        abort_if($stack === null, 404);

        return Inertia::render('servers/show', [
            'server' => $stack,
        ]);
    }

    public function destroy(DestroyServerRequest $request, string $server, StackCatalog $catalog, CliRunner $runner): RedirectResponse
    {
        abort_if($catalog->find($server) === null, 404);

        $run = $runner->start(
            label: "Destroy server {$server}",
            arguments: ['cloud:destroy', $server, '--force'],
            kind: RunKind::DestroyServer,
            subject: $server,
        );

        return to_route('runs.show', $run);
    }
}
