<?php

namespace App\Jobs\Sync;

use App\Models\Server;

/**
 * Ticks SyncPlexJob for every ready cloud server on a recurring schedule, so
 * the Servers detail page's `plex` prop only ever reads `plex_data` — it
 * never calls ClusterStatus::plex() live from a page-load request. Each
 * per-server job keeps its own try/catch and retry behavior (see
 * SyncPlexJob); this job is just the fan-out and has nothing
 * cluster-specific to fail on. SyncPlexJob itself stays on the `default`
 * queue (unqueued, not `sync`) — `plex:show` can take up to 60s on a
 * tool-dense server, too slow for the fast `sync` worker's 30s timeout.
 */
class SyncAllServerPlexJob extends SyncJob
{
    /** The dedicated `sync` worker — this fan-out itself is a cheap DB query + dispatch loop, no CLI calls of its own. */
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
            ->each(fn (Server $server) => SyncPlexJob::dispatch($server->id));
    }
}
