<?php

namespace App\Jobs\Sync;

use App\Models\Server;

/**
 * Ticks SyncServerTlsJob for every ready server with a context on a
 * recurring schedule, so the Servers detail page's `tls` prop only ever
 * reads `tls_data`. SyncServerTlsJob itself stays on the `default` queue
 * (unqueued, not `sync`) — `tls:show` can take up to 120s, too slow for
 * the fast `sync` worker's 30s timeout.
 */
class SyncAllServerTlsJob extends SyncJob
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
            ->each(fn (Server $server) => SyncServerTlsJob::dispatch($server->id));
    }
}
