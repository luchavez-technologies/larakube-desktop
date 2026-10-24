<?php

use App\Jobs\Sync\SyncLocalWorkloadsJob;
use App\Models\LocalClusterState;
use App\Services\LaraKube\ProjectWorkloadStatus;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Queue;

function projectWorkloadStatusFakeCli(): string
{
    $bin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/kubectl", "#!/bin/sh\n");
    chmod("{$bin}/kubectl", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    return $bin;
}

test('localWorkloadStatuses reads workloads_data from the database once synced, never calling kubectl live', function () {
    $bin = projectWorkloadStatusFakeCli();
    Process::fake(['*deployments,statefulsets*' => Process::result(output: json_encode(['items' => [
        ['metadata' => ['namespace' => 'shop-local'], 'spec' => ['replicas' => 1], 'status' => ['readyReplicas' => 1]],
    ]]))]);

    LocalClusterState::current()->update([
        'workloads_data' => ['shop-local' => ['replicas' => 2, 'readyReplicas' => 2, 'deploymentsCount' => 1]],
        'workloads_sync_status' => 'fresh',
        'workloads_last_synced_at' => now(),
    ]);

    $result = app(ProjectWorkloadStatus::class)->localWorkloadStatuses(app(ToolLocator::class));

    expect($result)->toBe(['shop-local' => ['replicas' => 2, 'readyReplicas' => 2, 'deploymentsCount' => 1]]);

    Process::assertNotRan(fn ($process): bool => str_contains(implode(' ', (array) $process->command), 'deployments,statefulsets'));

    File::deleteDirectory($bin);
});

test('localWorkloadStatuses falls back to a live kubectl check and queues a sync when never synced', function () {
    $bin = projectWorkloadStatusFakeCli();
    Queue::fake();
    Process::fake(['*deployments,statefulsets*' => Process::result(output: json_encode(['items' => [
        ['metadata' => ['namespace' => 'shop-local'], 'spec' => ['replicas' => 1], 'status' => ['readyReplicas' => 1]],
    ]]))]);

    $result = app(ProjectWorkloadStatus::class)->localWorkloadStatuses(app(ToolLocator::class));

    expect($result)->toBe(['shop-local' => ['replicas' => 1, 'readyReplicas' => 1, 'deploymentsCount' => 1]]);

    Queue::assertPushed(SyncLocalWorkloadsJob::class);

    File::deleteDirectory($bin);
});

test('SyncLocalWorkloadsJob writes a fresh workload snapshot into local_cluster_state', function () {
    $bin = projectWorkloadStatusFakeCli();
    Process::fake(['*deployments,statefulsets*' => Process::result(output: json_encode(['items' => [
        ['metadata' => ['namespace' => 'shop-local'], 'spec' => ['replicas' => 2], 'status' => ['readyReplicas' => 2]],
        ['metadata' => ['namespace' => 'other-ns'], 'spec' => ['replicas' => 3], 'status' => ['readyReplicas' => 0]],
    ]]))]);

    (new SyncLocalWorkloadsJob)->handle(app(ProjectWorkloadStatus::class), app(ToolLocator::class));

    $state = LocalClusterState::current();
    expect($state->workloads_data)->toBe(['shop-local' => ['replicas' => 2, 'readyReplicas' => 2, 'deploymentsCount' => 1]])
        ->and($state->workloads_sync_status)->toBe('fresh')
        ->and($state->workloads_last_synced_at)->not->toBeNull()
        ->and($state->workloads_last_sync_error)->toBeNull();

    File::deleteDirectory($bin);
});

test('SyncLocalWorkloadsJob keeps the last known replica counts and records the error on failure', function () {
    LocalClusterState::current()->update([
        'workloads_data' => ['shop-local' => ['replicas' => 1, 'readyReplicas' => 1, 'deploymentsCount' => 1]],
        'workloads_sync_status' => 'fresh',
        'workloads_last_synced_at' => now()->subMinute(),
    ]);

    $status = mock(ProjectWorkloadStatus::class);
    $status->shouldReceive('fetchLocalWorkloadStatuses')->once()->andThrow(new RuntimeException('kubectl timed out'));

    (new SyncLocalWorkloadsJob)->handle($status, app(ToolLocator::class));

    $state = LocalClusterState::current();
    expect($state->workloads_data)->toBe(['shop-local' => ['replicas' => 1, 'readyReplicas' => 1, 'deploymentsCount' => 1]])
        ->and($state->workloads_sync_status)->toBe('error')
        ->and($state->workloads_last_sync_error)->toBe('kubectl timed out');
});
