<?php

namespace App\Jobs\Sync;

use App\Models\LocalClusterState;
use App\Services\LaraKube\ProjectWorkloadStatus;
use App\Services\LaraKube\ToolLocator;
use Throwable;

/**
 * Keeps `local_cluster_state.workloads_data` current so the Projects
 * list/show pages never shell out to `kubectl get deployments,statefulsets
 * -A` on page load — the exact call ProjectWorkloadStatus::
 * localWorkloadStatuses() used to make synchronously on every navigation.
 *
 * A failed fetch keeps the last known replica counts rather than
 * overwriting them, so a transient kubectl hiccup doesn't flash every
 * project to "Down" — only workloads_sync_status/workloads_last_sync_error
 * change.
 */
class SyncLocalWorkloadsJob extends SyncJob
{
    /** ProjectWorkloadStatus::fetchLocalWorkloadStatuses() already times out its own subprocess call within a couple seconds; this is the outer guard. */
    public int $timeout = 10;

    /** The dedicated `sync` worker (config/nativephp.php), not `default` — a slow per-server CLI job must never delay this one's every-15-seconds tick. */
    public function __construct()
    {
        $this->onQueue('sync');
    }

    protected function uniqueKey(): string
    {
        return 'singleton';
    }

    /**
     * @return array<int, int>
     */
    public function backoff(): array
    {
        return [5, 15, 30];
    }

    public function handle(ProjectWorkloadStatus $status, ToolLocator $locator): void
    {
        $state = LocalClusterState::current();
        $state->update(['workloads_sync_status' => 'syncing']);

        try {
            $workloads = $status->fetchLocalWorkloadStatuses($locator);

            $state->update([
                'workloads_data' => $workloads,
                'workloads_sync_status' => 'fresh',
                'workloads_last_synced_at' => now(),
                'workloads_last_sync_error' => null,
            ]);
        } catch (Throwable $e) {
            $state->update([
                'workloads_sync_status' => 'error',
                'workloads_last_sync_error' => $e->getMessage(),
            ]);
        }
    }
}
