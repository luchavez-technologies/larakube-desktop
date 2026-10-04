<?php

use App\Enums\RunKind;
use App\Models\Run;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Inertia\Testing\AssertableInertia;
use Native\Desktop\Facades\ChildProcess;

function devBoxesCli(): string
{
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);
    File::put("{$directory}/larakube", "#!/bin/sh\n");
    chmod("{$directory}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$directory]));

    return $directory;
}

function devBoxesExperimental(bool $on): void
{
    $settings = mock(GlobalSettings::class);
    $settings->shouldReceive('hideProjects')->andReturnFalse();
    $settings->shouldReceive('experimental')->andReturn($on);
    $settings->shouldReceive('get')->andReturn(['cliChannel' => 'canary']);
    app()->instance(GlobalSettings::class, $settings);
}

function devBoxesStacks(): void
{
    Process::fake(['*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
        ['name' => 'workshop-demo', 'provider' => 'do', 'kind' => 'vps', 'region' => 'sgp1', 'ip' => '203.0.113.21', 'context' => 'larakube-203.0.113.21', 'role' => 'deploy', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ['name' => 'my-dev-box', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'us-central1', 'ip' => '203.0.113.50', 'context' => null, 'role' => 'dev', 'account' => null, 'projectId' => null, 'status' => 'ready'],
    ]]))]);
}

test('dev boxes stay off until experimental features are switched on, and the page says how to turn them on', function () {
    devBoxesExperimental(false);

    $this->get(route('devboxes.index'))->assertOk()->assertInertia(fn (AssertableInertia $page) => $page
        ->component('devboxes/index')
        ->where('disabled', true)
        ->missing('devBoxes'));
    $this->get(route('devboxes.create'))->assertRedirect(route('devboxes.index'));
    $this->post(route('devboxes.store'), ['provider' => 'do', 'stack_name' => 'my-dev', 'region' => 'sgp1', 'size' => 's-4vcpu-8gb'])->assertNotFound();
});

test('the dev boxes page lists only dev boxes, and the servers list leaves them out', function () {
    $bin = devBoxesCli();
    devBoxesExperimental(true);
    devBoxesStacks();

    $this->get(route('devboxes.index'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('devboxes/index')
            ->loadDeferredProps(fn (AssertableInertia $page) => $page
                ->has('devBoxes', 1)
                ->where('devBoxes.0.name', 'my-dev-box')
            )
        );

    $this->get(route('servers.index'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->loadDeferredProps(fn (AssertableInertia $page) => $page
                ->has('servers', 1)
                ->where('servers.0.name', 'workshop-demo')
            )
        );

    File::deleteDirectory($bin);
});

test('creating a dev box starts devbox:create with the form, the CLI channel, and the token by environment only', function () {
    $bin = devBoxesCli();
    devBoxesExperimental(true);
    devBoxesStacks();
    $fake = ChildProcess::fake();

    $this->post(route('devboxes.store'), ['provider' => 'hetzner', 'stack_name' => 'my-dev', 'region' => 'fsn1', 'size' => 'cx32', 'api_token' => 'secret-token'])
        ->assertRedirect(route('runs.show', Run::sole()));

    expect(Run::sole()->kind)->toBe(RunKind::CreateDevBox)
        ->and(Run::sole()->command)->not->toContain('secret-token');

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        "{$bin}/larakube", 'devbox:create', '--provider=hetzner', '--stack-name=my-dev', '--region=fsn1', '--size=cx32', '--channel=canary', '--json', '--no-interaction',
    ]);

    File::deleteDirectory($bin);
});

test('the create page offers the dev box size, not the server size, and has no Cloudflare step to submit', function () {
    devBoxesExperimental(true);

    $this->get(route('devboxes.create'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('servers/create')
            ->where('kind', 'dev-box')
        );
});

test('a dev box has no server page, but it can be destroyed, and the run says it was a dev box', function () {
    $bin = devBoxesCli();
    devBoxesStacks();
    ChildProcess::fake();

    $this->get(route('servers.show', 'my-dev-box'))->assertNotFound();

    $this->delete(route('servers.destroy', 'my-dev-box'), ['confirm' => 'my-dev-box'])->assertRedirect();

    expect(Run::sole()->kind)->toBe(RunKind::DestroyServer)
        ->and(Run::sole()->meta)->toMatchArray(['role' => 'dev']);

    File::deleteDirectory($bin);
});
