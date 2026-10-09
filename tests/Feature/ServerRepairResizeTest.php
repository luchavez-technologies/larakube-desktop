<?php

use App\Enums\RunKind;
use App\Models\Run;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Native\Desktop\Facades\ChildProcess;

function repairResizeCli(): string
{
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);
    File::put("{$directory}/larakube", "#!/bin/sh\n");
    chmod("{$directory}/larakube", 0755);

    app()->instance(ToolLocator::class, new ToolLocator([$directory]));

    return $directory;
}

function repairResizeStacks(): void
{
    Process::fake(['*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
        ['name' => 'workshop-demo', 'provider' => 'do', 'kind' => 'vps', 'region' => 'sgp1', 'ip' => '203.0.113.21', 'context' => 'larakube-203.0.113.21', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ['name' => 'gke-cluster', 'provider' => 'gcp', 'kind' => 'managed', 'region' => 'us-central1', 'ip' => null, 'context' => 'gke_ctx', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ['name' => 'half-done', 'provider' => 'do', 'kind' => 'vps', 'region' => 'sgp1', 'ip' => '203.0.113.40', 'context' => null, 'account' => null, 'projectId' => null, 'status' => 'incomplete'],
    ]]))]);
}

test('repairing a server starts cloud:repair for that server, without needing it to answer first', function () {
    $bin = repairResizeCli();
    repairResizeStacks();
    $fake = ChildProcess::fake();

    $this->post(route('servers.repair', 'workshop-demo'))->assertRedirect(route('runs.show', Run::sole()));

    expect(Run::sole()->kind)->toBe(RunKind::RepairServer)
        ->and(Run::sole()->meta['context'] ?? null)->toBe('larakube-203.0.113.21');

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === ["{$bin}/larakube", 'cloud:repair', '--stack=workshop-demo', '--force', '--no-interaction']);

    File::deleteDirectory($bin);
});

test('only a server LaraKube made with cloud:create/cloud:init can be repaired', function (string $server) {
    $bin = repairResizeCli();
    repairResizeStacks();
    ChildProcess::fake();

    $this->post(route('servers.repair', $server))->assertNotFound();
    expect(Run::count())->toBe(0);

    File::deleteDirectory($bin);
})->with(['a managed cluster' => 'gke-cluster', 'an unknown one' => 'nope']);

test('resizing a server starts cloud:scale with the chosen size', function () {
    $bin = repairResizeCli();
    repairResizeStacks();
    $fake = ChildProcess::fake();

    $this->post(route('servers.resize', 'workshop-demo'), ['size' => 's-2vcpu-4gb'])
        ->assertRedirect(route('runs.show', Run::sole()));

    expect(Run::sole()->kind)->toBe(RunKind::ResizeServer)
        ->and(Run::sole()->meta['size'] ?? null)->toBe('s-2vcpu-4gb');

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === ["{$bin}/larakube", 'cloud:scale', 'workshop-demo', '--size=s-2vcpu-4gb', '--force', '--no-interaction']);

    File::deleteDirectory($bin);
});

test('resizing requires a size', function () {
    $bin = repairResizeCli();
    repairResizeStacks();
    ChildProcess::fake();

    $this->post(route('servers.resize', 'workshop-demo'), [])->assertSessionHasErrors('size');
    expect(Run::count())->toBe(0);

    File::deleteDirectory($bin);
});

test('only a ready server LaraKube made can be resized', function (string $server) {
    $bin = repairResizeCli();
    repairResizeStacks();
    ChildProcess::fake();

    $this->post(route('servers.resize', $server), ['size' => 's-2vcpu-4gb'])->assertNotFound();
    expect(Run::count())->toBe(0);

    File::deleteDirectory($bin);
})->with(['a managed cluster' => 'gke-cluster', 'an unfinished server' => 'half-done', 'an unknown one' => 'nope']);
