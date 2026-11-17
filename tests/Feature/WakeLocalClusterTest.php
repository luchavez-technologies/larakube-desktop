<?php

use App\Enums\RunKind;
use App\Jobs\Sync\SyncLocalClusterJob;
use App\Models\LocalClusterState;
use App\Services\Elevation;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\LocalCluster;
use App\Services\LaraKube\ToolLocator;
use App\Services\Wsl;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Queue;
use Native\Desktop\Facades\ChildProcess;

const WAKE_LISTING = "  NAME             STATE     VERSION\n* larakube-ubuntu  Stopped   2\n";

test('keeping LaraKube Linux awake holds a sleep process in the distro as a Desktop child process', function () {
    $fake = ChildProcess::fake();
    Process::fake(['*wsl.exe*' => Process::result(output: WAKE_LISTING)]);

    $wsl = new Wsl(windows: true, featureEnabled: true);

    expect($wsl->keepAwake())->toBeTrue()
        ->and($wsl->isWaking())->toBeTrue();
    $fake->assertStarted(fn (array|string $cmd, string $alias, mixed ...$rest): bool => $alias === Wsl::KEEP_AWAKE_ALIAS
        && $cmd === ['wsl.exe', '-d', 'larakube-ubuntu', '--user', 'larakube', '--exec', 'sleep', 'infinity']);
});

test('there is nothing to keep awake off Windows or without the distro', function () {
    $fake = ChildProcess::fake();
    Process::fake(['*wsl.exe*' => Process::result(output: "  NAME     STATE     VERSION\n  Ubuntu   Stopped   2\n")]);

    expect((new Wsl(windows: false, featureEnabled: true))->keepAwake())->toBeFalse()
        ->and((new Wsl(windows: true, featureEnabled: true))->keepAwake())->toBeFalse();
    expect($fake->starts)->toBe([]);
});

test('the Wake up button wakes the distro, shows it starting, and re-syncs the local cluster', function () {
    ChildProcess::fake();
    Queue::fake();
    Process::fake(['*wsl.exe*' => Process::result(output: WAKE_LISTING)]);
    app()->instance(Wsl::class, new Wsl(windows: true, featureEnabled: true));
    LocalClusterState::current()->update(['status' => LocalCluster::ASLEEP_STATUS, 'tone' => 'muted']);

    $this->post(route('local-cluster.wake'))->assertRedirect()->assertSessionHas('success');

    expect(LocalClusterState::current()->status)->toBe(LocalCluster::STARTING_STATUS);
    Queue::assertPushed(SyncLocalClusterJob::class);
});

test('the Wake up button reports an error when there is no distro to wake', function () {
    ChildProcess::fake();
    app()->instance(Wsl::class, new Wsl(windows: false, featureEnabled: false));

    $this->post(route('local-cluster.wake'))->assertRedirect()->assertSessionHasErrors('wake');
});

test('a local up from Desktop keeps the distro awake, so the app does not idle out with it', function () {
    $bin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\nexit 0\n");
    chmod("{$bin}/larakube", 0755);

    $fake = ChildProcess::fake();
    Process::fake(['*wsl.exe*' => Process::result(output: WAKE_LISTING)]);
    app()->instance(Wsl::class, new Wsl(windows: true, featureEnabled: true));

    $runner = new CliRunner(new ToolLocator([$bin]), new Elevation);
    $runner->start(label: 'Start my-app', arguments: ['start'], kind: RunKind::StartProject, environment: 'local');
    $runner->start(label: 'Deploy my-app', arguments: ['cloud:deploy', 'production'], kind: RunKind::DeployApp, environment: 'production');

    $wakes = array_filter($fake->starts, fn (array $start): bool => $start['alias'] === Wsl::KEEP_AWAKE_ALIAS);
    expect($wakes)->toHaveCount(1);

    File::deleteDirectory($bin);
});
