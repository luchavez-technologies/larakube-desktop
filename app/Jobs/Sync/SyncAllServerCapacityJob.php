<?php

namespace App\Jobs\Sync;

use App\Models\Server;

/**
 * Ticks SyncServerCapacityJob for every ready cloud server on a recurring
 * schedule so Servers detail pages and the Apps catalog can show cached
 * capacity/fit immediately.
 */
class SyncAllServerCapacityJob extends SyncJob
{
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
            ->each(fn (Server $server) => SyncServerCapacityJob::dispatch($server->id));
    }
}
