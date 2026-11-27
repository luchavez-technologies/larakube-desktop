<?php

namespace App\Jobs\Middleware;

use App\Jobs\Sync\ServerSyncJob;
use App\Models\Server;
use App\Services\LaraKube\ContextHealth;
use Closure;

/**
 * Skips a server sync when the server doesn't answer: a quick probe (a few seconds, remembered for a
 * minute) instead of a CLI call that hangs until its timeout, three times over, holding up every other
 * sync on the queue. The server's page shows it as unreachable either way.
 */
class SkipUnreachableServer
{
    public function handle(ServerSyncJob $job, Closure $next): void
    {
        $context = Server::whereKey($job->serverId)->value('context');

        if (is_string($context) && $context !== '' && (app(ContextHealth::class)->check([$context])[$context] ?? true) === false) {
            return;
        }

        $next($job);
    }
}
