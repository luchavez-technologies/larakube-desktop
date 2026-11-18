<?php

use App\Enums\ActivityType;
use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Enums\ServerDataScope;
use App\Events\LocalWorkloadsSynced;
use App\Events\NotificationCreated;
use App\Events\RunFinished;
use App\Events\RunStarted;
use App\Events\ServerDataSynced;
use App\Events\ServersSynced;
use App\Jobs\Sync\SyncClusterToolsJob;
use App\Jobs\Sync\SyncDriveJob;
use App\Jobs\Sync\SyncLocalClusterJob;
use App\Jobs\Sync\SyncLocalWorkloadsJob;
use App\Jobs\Sync\SyncMailJob;
use App\Jobs\Sync\SyncOpenBaoJob;
use App\Jobs\Sync\SyncPlexJob;
use App\Jobs\Sync\SyncServerBackupJob;
use App\Jobs\Sync\SyncServerClusterUsersJob;
use App\Jobs\Sync\SyncServerDomainsJob;
use App\Jobs\Sync\SyncServerExternalDnsJob;
use App\Jobs\Sync\SyncServersJob;
use App\Jobs\Sync\SyncServerTlsJob;
use App\Jobs\Sync\SyncSsoJob;
use App\Listeners\RecordRunOutput;
use App\Models\Activity;
use App\Models\Project;
use App\Models\Run;
use App\Models\Server;
use App\Services\Elevation;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\LocalCluster;
use App\Services\LaraKube\ProjectWorkloadStatus;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Queue;
use Native\Desktop\Events\ChildProcess\ProcessExited;
use Native\Desktop\Events\ChildProcess\StartupError;
use Native\Desktop\Facades\ChildProcess;

function realtimeUiEventsRun(): Run
{
    return Run::create([
        'label' => 'Update n8n on alpha',
        'kind' => RunKind::UpdateClusterTool,
        'server_name' => 'alpha',
        'command' => ['larakube', 'tool:update'],
    ]);
}

test('starting a run tells the open windows which run, server and project', function () {
    Event::fake([RunStarted::class]);
    ChildProcess::fake();
    $bin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\nexit 0\n");
    chmod("{$bin}/larakube", 0755);
    $project = Project::create(['path' => '/home/user/apps/shop']);

    $run = (new CliRunner(new ToolLocator([$bin]), new Elevation))->start(
        label: 'Deploy shop (production)',
        arguments: ['cloud:deploy', 'production'],
        kind: RunKind::DeployApp,
        projectId: $project->id,
        serverName: 'alpha',
    );

    Event::assertDispatched(RunStarted::class, fn (RunStarted $event): bool => $event->run === $run->id
        && $event->kind === RunKind::DeployApp->value
        && $event->status === RunStatus::Running->value
        && $event->server === 'alpha'
        && $event->project === $project->id);

    File::deleteDirectory($bin);
});

test('a run that exits announces its final, already-saved status', function (int $code, RunStatus $status) {
    Event::fake([RunFinished::class]);
    Queue::fake();
    Process::fake();
    $run = realtimeUiEventsRun();

    (new RecordRunOutput)->handleExit(new ProcessExited($run->alias(), $code));

    Event::assertDispatchedTimes(RunFinished::class, 1);
    Event::assertDispatched(RunFinished::class, fn (RunFinished $event): bool => $event->run === $run->id
        && $event->status === $status->value
        && $run->fresh()->status === $status);
})->with([
    'succeeded' => [0, RunStatus::Succeeded],
    'failed' => [1, RunStatus::Failed],
]);

test('a run that could not start announces its failure', function () {
    Event::fake([RunFinished::class]);
    $run = realtimeUiEventsRun();

    (new RecordRunOutput)->handleStartupError(new StartupError($run->alias(), 'spawn ENOENT'));

    Event::assertDispatched(RunFinished::class, fn (RunFinished $event): bool => $event->run === $run->id
        && $event->status === RunStatus::Failed->value);
});

test('every server sync announces its scope, even when it has nothing to read', function (string $job, ServerDataScope $scope) {
    Event::fake([ServerDataSynced::class]);
    Process::fake();
    // No context: every job returns early, which must still tell the page to re-read.
    $server = Server::create(['name' => 'alpha', 'provider' => 'do', 'kind' => 'vps', 'status' => 'ready']);

    $job::dispatchSync($server->id);

    Event::assertDispatchedTimes(ServerDataSynced::class, 1);
    Event::assertDispatched(ServerDataSynced::class, fn (ServerDataSynced $event): bool => $event->server === 'alpha'
        && $event->scope === $scope->value);
})->with([
    'tools' => [SyncClusterToolsJob::class, ServerDataScope::Tools],
    'mail' => [SyncMailJob::class, ServerDataScope::Mail],
    'drive' => [SyncDriveJob::class, ServerDataScope::Drive],
    'openbao' => [SyncOpenBaoJob::class, ServerDataScope::OpenBao],
    'sso' => [SyncSsoJob::class, ServerDataScope::Sso],
    'plex' => [SyncPlexJob::class, ServerDataScope::Plex],
    'backups' => [SyncServerBackupJob::class, ServerDataScope::Backups],
    'domains' => [SyncServerDomainsJob::class, ServerDataScope::Domains],
    'external-dns' => [SyncServerExternalDnsJob::class, ServerDataScope::ExternalDns],
    'tls' => [SyncServerTlsJob::class, ServerDataScope::Tls],
    'cluster-users' => [SyncServerClusterUsersJob::class, ServerDataScope::ClusterUsers],
]);

test('a sync for a server that no longer exists announces nothing', function () {
    Event::fake([ServerDataSynced::class]);

    SyncMailJob::dispatchSync(999_999);

    Event::assertNotDispatched(ServerDataSynced::class);
});

test('the backup sync still runs on the dedicated sync queue', function () {
    expect((new SyncServerBackupJob(1))->queue)->toBe('sync');
});

test('the UI events reach windows through NativePHP without going through Laravel broadcasting', function (object $event) {
    // NativePHP's EventWatcher forwards anything whose broadcastOn() includes `nativephp`.
    expect(array_map('strval', $event->broadcastOn()))->toContain('nativephp')
        ->and($event)->not->toBeInstanceOf(ShouldBroadcast::class);
})->with([
    'ServerDataSynced' => fn () => new ServerDataSynced('alpha', ServerDataScope::Tools),
    'RunStarted' => fn () => new RunStarted(realtimeUiEventsRun()),
    'RunFinished' => fn () => new RunFinished(realtimeUiEventsRun()),
    'LocalWorkloadsSynced' => fn () => new LocalWorkloadsSynced,
    'ServersSynced' => fn () => new ServersSynced,
    'NotificationCreated' => fn () => new NotificationCreated(1),
]);

test('local sync jobs announce LocalWorkloadsSynced when they finish', function () {
    Event::fake([LocalWorkloadsSynced::class]);

    $cluster = mock(LocalCluster::class);
    $cluster->shouldReceive('detect')->andReturn([
        'engine' => 'k3s',
        'context' => 'k3s-larakube',
        'status' => 'Running',
        'tone' => 'success',
    ]);
    app()->instance(LocalCluster::class, $cluster);

    $workloads = mock(ProjectWorkloadStatus::class);
    $workloads->shouldReceive('fetchLocalWorkloadStatuses')->andReturn([]);
    app()->instance(ProjectWorkloadStatus::class, $workloads);

    SyncLocalClusterJob::dispatchSync();
    SyncLocalWorkloadsJob::dispatchSync();

    Event::assertDispatchedTimes(LocalWorkloadsSynced::class, 2);
});

test('server sync and server create or destroy runs announce ServersSynced', function () {
    Event::fake([ServersSynced::class]);
    Process::fake();

    $stacks = mock(StackCatalog::class);
    $stacks->shouldReceive('everything')->andReturn([]);
    app()->instance(StackCatalog::class, $stacks);

    SyncServersJob::dispatchSync();

    Queue::fake();

    $createRun = Run::create([
        'label' => 'Create alpha',
        'kind' => RunKind::CreateServer,
        'server_name' => 'alpha',
        'command' => ['larakube', 'cloud:create'],
    ]);
    (new RecordRunOutput)->handleExit(new ProcessExited($createRun->alias(), 0));

    $destroyRun = Run::create([
        'label' => 'Destroy alpha',
        'kind' => RunKind::DestroyServer,
        'server_name' => 'alpha',
        'command' => ['larakube', 'cloud:destroy'],
    ]);
    (new RecordRunOutput)->handleExit(new ProcessExited($destroyRun->alias(), 0));

    Event::assertDispatchedTimes(ServersSynced::class, 3);
});

test('creating an Activity row announces NotificationCreated', function () {
    Event::fake([NotificationCreated::class]);
    $server = Server::create(['name' => 'alpha', 'provider' => 'do', 'kind' => 'vps', 'status' => 'ready']);

    $activity = Activity::create([
        'server_id' => $server->id,
        'type' => ActivityType::ServerFirstSynced,
        'title' => 'First synced alpha',
        'occurred_at' => now(),
    ]);

    Event::assertDispatchedTimes(NotificationCreated::class, 1);
    Event::assertDispatched(NotificationCreated::class, fn (NotificationCreated $event): bool => $event->activity === $activity->id);
});
