<?php

use App\Enums\RunKind;
use App\Models\Run;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Inertia\Testing\AssertableInertia;
use Native\Desktop\Facades\ChildProcess;

function serversFakeCli(): string
{
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);
    File::put("{$directory}/larakube", "#!/bin/sh\n");
    chmod("{$directory}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$directory]));

    return $directory;
}

/**
 * @return array<int, array<string, mixed>>
 */
function serversStacks(): array
{
    return [
        ['name' => 'workshop-demo', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'asia-east1', 'ip' => '203.0.113.21', 'context' => 'larakube-203.0.113.21', 'account' => null, 'projectId' => 'demo', 'status' => 'ready'],
        ['name' => 'cancel-test', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'asia-northeast1', 'ip' => null, 'context' => null, 'account' => null, 'projectId' => null, 'status' => 'unfinished'],
    ];
}

function serversFakeStacks(): void
{
    Process::fake(['*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => serversStacks()]))]);
}

test('the servers list is read from cloud:stacks --json', function () {
    $bin = serversFakeCli();
    serversFakeStacks();

    $this->get(route('servers.index'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('servers/index')
            ->loadDeferredProps(fn (AssertableInertia $reload) => $reload
                ->has('servers', 2)
                ->where('servers.0.name', 'workshop-demo')
                ->where('servers.1.status', 'unfinished')));

    File::deleteDirectory($bin);
});

test('a CLI without cloud:stacks --json gives a null list instead of an error page', function () {
    $bin = serversFakeCli();
    Process::fake(['*cloud:stacks*' => Process::result(errorOutput: 'The "--json" option does not exist.', exitCode: 1)]);

    $this->get(route('servers.index'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->loadDeferredProps(fn (AssertableInertia $reload) => $reload->where('servers', null)));

    File::deleteDirectory($bin);
});

test('a server page shows that server, and an unknown one is a 404', function () {
    $bin = serversFakeCli();
    serversFakeStacks();

    $this->get(route('servers.show', 'workshop-demo'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('servers/show')
            ->where('server.ip', '203.0.113.21'));

    $this->get(route('servers.show', 'nope'))->assertNotFound();

    File::deleteDirectory($bin);
});

test('destroying needs the exact name typed and then runs cloud:destroy --force', function () {
    $bin = serversFakeCli();
    serversFakeStacks();
    $fake = ChildProcess::fake();

    $this->delete(route('servers.destroy', 'cancel-test'), ['confirm' => 'cancel-tes'])->assertSessionHasErrors('confirm');
    expect(Run::count())->toBe(0);

    $this->delete(route('servers.destroy', 'cancel-test'), ['confirm' => 'cancel-test'])
        ->assertRedirect(route('runs.show', Run::sole()));

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::DestroyServer)
        ->and($run->subject)->toBe('cancel-test');

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === ["{$bin}/larakube", 'cloud:destroy', 'cancel-test', '--force', '--no-interaction']);

    File::deleteDirectory($bin);
});

test('destroying a server the CLI does not know is a 404 and runs nothing', function () {
    $bin = serversFakeCli();
    serversFakeStacks();
    $fake = ChildProcess::fake();

    $this->delete(route('servers.destroy', 'ghost'), ['confirm' => 'ghost'])->assertNotFound();

    expect($fake->starts)->toBe([]);

    File::deleteDirectory($bin);
});

test('activity lists runs newest first', function () {
    Run::create(['label' => 'Create server one', 'kind' => RunKind::CreateServer, 'subject' => 'one', 'command' => ['larakube']]);
    Run::create(['label' => 'Destroy server one', 'kind' => RunKind::DestroyServer, 'subject' => 'one', 'command' => ['larakube']]);

    $this->get(route('runs.index'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('runs/index')
            ->where('runs.0.label', 'Destroy server one')
            ->where('runs.0.kind', 'destroy-server')
            ->where('runs.1.label', 'Create server one'));
});
