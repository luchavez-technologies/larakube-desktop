<?php

namespace App\Jobs\Sync;

use App\Models\Server;
use App\Services\LaraKube\ClusterStatus;
use Throwable;

/**
 * Queries ClusterStatus::dns() for a server in the background and mirrors
 * the report into the servers table. This prevents live cluster network
 * queries from locking the single-worker web server on page visits.
 */
class SyncServerExternalDnsJob extends SyncJob
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
            $server->update(['externaldns_sync_status' => 'syncing']);

            $result = $status->dns($server->context);

            $server->update([
                'externaldns_data' => $result,
                'externaldns_sync_status' => 'fresh',
                'externaldns_last_synced_at' => now(),
                'externaldns_last_sync_error' => null,
            ]);
        } catch (Throwable $e) {
            $server->update([
                'externaldns_sync_status' => 'error',
                'externaldns_last_sync_error' => $e->getMessage(),
            ]);
        }
    }
}
