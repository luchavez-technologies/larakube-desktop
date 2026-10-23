<?php

namespace App\Jobs\Sync;

use App\Models\Server;
use App\Services\LaraKube\ClusterStatus;
use Throwable;

/**
 * Queries ClusterStatus::backup() for a server in the background and mirrors
 * both the configured status (Dashboard's summary) and the full report
 * (backup_data — destination, schedule, backup history; what the Servers
 * detail page's backup card needs) into the servers table. This prevents
 * live cluster network queries from locking the single-worker web server on
 * page visits.
 */
class SyncServerBackupJob extends SyncJob
{
    public const FRESH_SECONDS = 1800;

    /** The dedicated `sync` worker (config/nativephp.php) — ClusterStatus::backup() is already bounded to 15s, so it belongs with the other fast scheduled syncs, not behind a slow per-server CLI job on `default`. */
    public function __construct(public int $serverId)
    {
        $this->onQueue('sync');
    }

    protected function uniqueKey(): string
    {
        return (string) $this->serverId;
    }

    public function handle(ClusterStatus $status): void
    {
        $server = Server::find($this->serverId);

        if ($server === null || $server->context === null || $server->status !== 'ready') {
            return;
        }

        if (Server::isStackLocal([
            'name' => $server->name,
            'provider' => $server->provider,
            'kind' => $server->kind,
            'ip' => $server->ip,
            'context' => $server->context,
            'account' => $server->account,
            'projectId' => $server->cloud_project_id,
            'status' => $server->status,
        ])) {
            return;
        }

        try {
            $server->update(['backup_sync_status' => 'syncing']);

            $result = $status->backup($server->context);

            $configured = is_array($result) && ($result['configured'] ?? false) === true;

            $server->update([
                'backup_configured' => $configured,
                'backup_data' => $result,
                'backup_sync_status' => 'fresh',
                'backup_last_synced_at' => now(),
                'backup_last_sync_error' => null,
            ]);
        } catch (Throwable $e) {
            $server->update([
                'backup_sync_status' => 'error',
                'backup_last_sync_error' => $e->getMessage(),
            ]);
        }
    }
}
