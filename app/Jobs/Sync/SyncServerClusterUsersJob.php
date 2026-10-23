<?php

namespace App\Jobs\Sync;

use App\Models\Server;
use App\Services\LaraKube\ClusterStatus;
use Throwable;

/**
 * Queries ClusterStatus::clusterUsers() for a server in the background and
 * mirrors the report into the servers table. This prevents live cluster
 * network queries from locking the single-worker web server on page
 * visits.
 */
class SyncServerClusterUsersJob extends SyncJob
{
    public const FRESH_SECONDS = 1800;

    public function __construct(public int $serverId) {}

    protected function uniqueKey(): string
    {
        return (string) $this->serverId;
    }

    public function handle(ClusterStatus $status): void
    {
        $server = Server::find($this->serverId);

        if ($server === null || $server->context === null) {
            return;
        }

        try {
            $server->update(['cluster_users_sync_status' => 'syncing']);

            $result = $status->clusterUsers($server->context);

            $server->update([
                'cluster_users_data' => $result,
                'cluster_users_sync_status' => 'fresh',
                'cluster_users_last_synced_at' => now(),
                'cluster_users_last_sync_error' => null,
            ]);
        } catch (Throwable $e) {
            $server->update([
                'cluster_users_sync_status' => 'error',
                'cluster_users_last_sync_error' => $e->getMessage(),
            ]);
        }
    }
}
