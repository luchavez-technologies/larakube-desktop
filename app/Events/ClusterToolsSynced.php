<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * A server's cluster_tools rows were just re-synced (or the sync recorded an
 * error). Pushed to every window through NativePHP so the Apps page reloads
 * its props the moment fresh data exists, instead of guessing with timers.
 *
 * Deliberately NOT ShouldBroadcast(Now): NativePHP's EventWatcher forwards any
 * event whose broadcastOn() includes `nativephp`, so implementing the contract
 * would only also send it through Laravel's broadcaster (the `log` driver
 * here) on every sync. See docs/decisions/0021-push-data-changes-to-the-ui.md.
 */
class ClusterToolsSynced
{
    use Dispatchable;

    public function __construct(public readonly string $server) {}

    /** @return list<Channel> */
    public function broadcastOn(): array
    {
        return [new Channel('nativephp')];
    }
}
