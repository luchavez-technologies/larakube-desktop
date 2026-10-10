<?php

namespace App\Jobs\Sync;

use App\Enums\ActivityType;
use App\Models\Activity;
use App\Models\Server;
use App\Services\LaraKube\ClusterStatus;

/**
 * Mirrors ClusterStatus::plex() (`plex:show --json` — initialized state,
 * Commons service catalog, and tool/project/custom tenants) into the
 * server's own plex_data column. `plex:show` enumerates every installed
 * Cluster Tool's Commons resources, so on a tool-dense server it is slow —
 * this is what made the Plex Commons page's Commons Services and Cluster
 * Tools sections take a long time to appear on a cold cache.
 */
class SyncPlexJob extends SyncJob
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

        // Captured before the "syncing" update below overwrites it in-memory
        // (Eloquent's update() mutates the model's own attributes, not just
        // the row) — markError() would otherwise always see "syncing" and
        // never recognise a repeat failure.
        $wasAlreadyErrored = $server->plex_sync_status === 'error';

        $server->update(['plex_sync_status' => 'syncing']);

        try {
            $report = $status->plex($server->context);
        } catch (\Throwable $e) {
            $this->markError($server, $e->getMessage(), $wasAlreadyErrored);

            return;
        }

        if ($report === null) {
            $this->markError($server, 'Could not reach the cluster.', $wasAlreadyErrored);

            return;
        }

        $server->update([
            'plex_data' => $report,
            'plex_sync_status' => 'fresh',
            'plex_last_synced_at' => now(),
            'plex_last_sync_error' => null,
        ]);
    }

    private function markError(Server $server, string $message, bool $alreadyErrored): void
    {
        $server->update(['plex_sync_status' => 'error', 'plex_last_sync_error' => $message]);

        if (! $alreadyErrored) {
            Activity::create([
                'server_id' => $server->id,
                'type' => ActivityType::PlexSyncFailed,
                'title' => 'Could not check Plex Commons',
                'description' => $message,
                'occurred_at' => now(),
            ]);
        }
    }
}
