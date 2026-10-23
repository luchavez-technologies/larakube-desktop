<?php

namespace App\Jobs\Sync;

use App\Models\Server;

/**
 * Ticks SyncServerExternalDnsJob for every ready server with a context on a
 * recurring schedule, so the Servers detail page's `dns` prop only ever
 * reads `externaldns_data`. SyncServerExternalDnsJob itself stays on the
 * `default` queue (unqueued, not `sync`) — `external-dns:list`/`dns:list`
 * can take up to 60s, too slow for the fast `sync` worker's 30s timeout.
 */
class SyncAllServerExternalDnsJob extends SyncJob
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
            ->each(fn (Server $server) => SyncServerExternalDnsJob::dispatch($server->id));
    }
}
