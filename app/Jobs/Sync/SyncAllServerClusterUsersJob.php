<?php

namespace App\Jobs\Sync;

use App\Models\Server;

/**
 * Ticks SyncServerClusterUsersJob for every ready server with a context on
 * a recurring schedule, so the Servers detail page's `clusterUsers` prop
 * only ever reads `cluster_users_data`. SyncServerClusterUsersJob itself
 * stays on the `default` queue (unqueued, not `sync`) — it makes two
 * sequential 15s-timeout kubectl calls, which can add up to 30s, right at
 * the edge of the fast `sync` worker's own timeout.
 */
class SyncAllServerClusterUsersJob extends SyncJob
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
            ->each(fn (Server $server) => SyncServerClusterUsersJob::dispatch($server->id));
    }
}
