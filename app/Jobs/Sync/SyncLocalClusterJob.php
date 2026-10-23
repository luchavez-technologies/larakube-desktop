<?php

namespace App\Jobs\Sync;

use App\Models\LocalClusterState;
use App\Services\LaraKube\LocalCluster;
use Throwable;

/**
 * Keeps `local_cluster_state` current so Dashboard/Projects never shell out
 * to kubectl on page load. This prevents live cluster network queries from
 * locking the single-worker web server on page visits, same as the other
 * Sync*Job classes.
 *
 * A failed detection keeps the last known engine/context/status/tone rather
 * than overwriting it, so a transient kubectl hiccup doesn't flash the
 * Dashboard to "Unknown" — only the sync_status/last_sync_error change.
 */
class SyncLocalClusterJob extends SyncJob
{
    /** LocalCluster::detect() already times out its own subprocess calls within a few seconds; this is the outer guard against an unexpected hang. */
    public int $timeout = 15;

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

    public function handle(LocalCluster $localCluster): void
    {
        $state = LocalClusterState::current();
        $state->update(['sync_status' => 'syncing']);

        try {
            $result = $localCluster->detect(fresh: true);

            $state->update([
                'engine' => $result['engine'],
                'context' => $result['context'],
                'status' => $result['status'],
                'tone' => $result['tone'],
                'sync_status' => 'fresh',
                'last_synced_at' => now(),
                'last_sync_error' => null,
            ]);
        } catch (Throwable $e) {
            $state->update([
                'sync_status' => 'error',
                'last_sync_error' => $e->getMessage(),
            ]);
        }
    }
}
