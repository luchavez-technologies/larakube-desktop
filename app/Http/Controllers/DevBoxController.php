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

    /** With the feature off the page says so and points to Settings, instead of failing. */
    public function index(StackCatalog $catalog): Response
    {
        if (! $this->settings->experimental()) {
            return Inertia::render('devboxes/index', ['disabled' => true]);
        }

        return Inertia::render('devboxes/index', [
            'disabled' => false,
            'devBoxes' => Inertia::defer(fn (): ?array => $catalog->devBoxes()),
        ]);
    }

    public function create(ReadinessCheck $readiness): Response|RedirectResponse
    {
        if (! $this->settings->experimental()) {
            return to_route('devboxes.index');
        }

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
