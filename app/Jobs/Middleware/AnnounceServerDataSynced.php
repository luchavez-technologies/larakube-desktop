<?php

namespace App\Jobs\Middleware;

use App\Events\ServerDataSynced;
use App\Jobs\Sync\ServerSyncJob;
use App\Models\Server;
use Closure;

/**
 * Announces ServerDataSynced once a server sync attempt ends, whether it
 * wrote fresh rows, recorded an error or returned early: the page should
 * re-read the database either way.
 */
class AnnounceServerDataSynced
{
    public function handle(ServerSyncJob $job, Closure $next): void
    {
        try {
            $next($job);
        } finally {
            $name = Server::whereKey($job->serverId)->value('name');

            if (is_string($name)) {
                ServerDataSynced::dispatch($name, $job->scope());
            }
        }
    }
}
