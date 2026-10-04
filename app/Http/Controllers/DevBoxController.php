<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Http\Requests\StoreServerRequest;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\StackCatalog;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Experimental. Dev boxes: servers used as development machines, made by `devbox:create`.
 * Restarting and destroying one is the same as for any server the CLI made.
 */
class DevBoxController extends Controller
{
    public function __construct(private GlobalSettings $settings) {}

    public function index(StackCatalog $catalog): Response
    {
        $this->ensureEnabled();

        return Inertia::render('devboxes/index', [
            'devBoxes' => Inertia::defer(fn (): ?array => $catalog->devBoxes()),
        ]);
    }

    public function create(ReadinessCheck $readiness): Response
    {
        $this->ensureEnabled();

        return Inertia::render('servers/create', [
            'kind' => 'dev-box',
            'providers' => Inertia::defer(fn (): ?array => $readiness->providers()),
            'project' => null,
        ]);
    }

    public function store(StoreServerRequest $request, CliRunner $runner): RedirectResponse
    {
        $this->ensureEnabled();

        $provider = $request->string('provider')->toString();
        $stackName = $request->string('stack_name')->toString();

        $run = $runner->start(
            label: "Create dev box {$stackName}",
            arguments: [
                'devbox:create',
                "--provider={$provider}",
                "--stack-name={$stackName}",
                '--region='.$request->string('region'),
                '--size='.$request->string('size'),
                '--channel='.$this->settings->get()['cliChannel'],
                '--json',
            ],
            secretEnvironment: $request->secretEnvironment(),
            kind: RunKind::CreateDevBox,
            subject: $stackName,
            meta: ['server' => $stackName, 'role' => 'dev'],
            targetType: 'server',
            targetName: $stackName,
            serverName: $stackName,
        );

        return to_route('runs.show', $run);
    }

    private function ensureEnabled(): void
    {
        abort_unless($this->settings->experimental(), 404);
    }
}
