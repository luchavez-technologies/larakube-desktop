<?php

namespace App\Jobs\Sync;

use App\Models\Server;

/**
 * Ticks SyncServerBackupJob for every ready cloud server on a recurring
 * schedule, so Dashboard's backup summary only ever reads
 * `backup_configured`/`backup_last_synced_at` — it never dispatches a sync
 * itself from a page-load request anymore. Each per-server job keeps its
 * own try/catch and retry behavior (see SyncServerBackupJob); this job is
 * just the fan-out and has nothing cluster-specific to fail on.
 */
class SyncAllServerBackupsJob extends SyncJob
{
    /** The dedicated `sync` worker (config/nativephp.php), same reasoning as SyncLocalClusterJob. */
    public function __construct()
    {
        $this->onQueue('sync');
    }

    protected function uniqueKey(): string
    {
        return 'tick';
    }

    public function handle(): void
    {
        Server::query()
            ->where('status', 'ready')
            ->whereNotNull('context')
            ->get(['id'])
            ->each(fn (Server $server) => SyncServerBackupJob::dispatch($server->id));
    }
}
