<?php

use App\Enums\RunKind;
use App\Models\Run;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Native\Desktop\Facades\ChildProcess;

function quickActionsCli(bool $withKubectl = false): string
{
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);

    foreach (['larakube', ...($withKubectl ? ['kubectl'] : [])] as $name) {
        File::put("{$directory}/{$name}", "#!/bin/sh\n");
        chmod("{$directory}/{$name}", 0755);
    }

    app()->instance(ToolLocator::class, new ToolLocator([$directory]));

    return $directory;
}

function quickActionsStacks(): void
{
    Process::fake(['*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
        ['name' => 'workshop-demo', 'provider' => 'do', 'kind' => 'vps', 'region' => 'sgp1', 'ip' => '203.0.113.21', 'context' => 'larakube-203.0.113.21', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ['name' => 'gke-cluster', 'provider' => 'gcp', 'kind' => 'managed', 'region' => 'us-central1', 'ip' => null, 'context' => 'gke_ctx', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ['name' => 'half-done', 'provider' => 'do', 'kind' => 'vps', 'region' => 'sgp1', 'ip' => '203.0.113.40', 'context' => null, 'account' => null, 'projectId' => null, 'status' => 'incomplete'],
    ]]))]);
}

test('restarting a server starts cloud:restart for that server, with the confirmation the dialog already gave', function () {
    $bin = quickActionsCli();
    quickActionsStacks();
    $fake = ChildProcess::fake();

    $this->post(route('servers.restart', 'workshop-demo'))->assertRedirect(route('runs.show', Run::sole()));

    expect(Run::sole()->kind)->toBe(RunKind::RestartServer)
        ->and(Run::sole()->label)->toBe('Restart server workshop-demo');

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === ["{$bin}/larakube", 'cloud:restart', '--stack=workshop-demo', '--force', '--no-interaction']);

    File::deleteDirectory($bin);
});

test('restarting a server via Inertia returns back to stay on the server page', function () {
    $bin = quickActionsCli();
    quickActionsStacks();
    ChildProcess::fake();

    $this->from(route('servers.show', 'workshop-demo'))
        ->withHeader('X-Inertia', 'true')
        ->post(route('servers.restart', 'workshop-demo'))
        ->assertRedirect(route('servers.show', 'workshop-demo'));

    expect(Run::sole()->kind)->toBe(RunKind::RestartServer);

    File::deleteDirectory($bin);
});

test('only a ready server LaraKube made can be restarted', function (string $server) {
    $bin = quickActionsCli();
    quickActionsStacks();
    ChildProcess::fake();

    $this->post(route('servers.restart', $server))->assertNotFound();

    expect(Run::count())->toBe(0);

    File::deleteDirectory($bin);
})->with(['a managed cluster' => 'gke-cluster', 'an unfinished server' => 'half-done', 'an unknown one' => 'nope']);

test('the list can ask which contexts still answer, and only the stale ones come back false', function () {
    $bin = quickActionsCli(withKubectl: true);
    Cache::flush();
    Process::fake([
        '*--context=alive*' => Process::result(output: 'ok'),
        '*--context=gone*' => Process::result(output: '', exitCode: 1),
    ]);

    $this->getJson(route('servers.health', ['contexts' => ['alive', 'gone', '--bad-flag']]))
        ->assertOk()
        ->assertExactJson(['alive' => true, 'gone' => false]);

    File::deleteDirectory($bin);
});
