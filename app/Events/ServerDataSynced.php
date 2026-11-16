<?php

namespace App\Events;

use App\Enums\ServerDataScope;
use Illuminate\Broadcasting\Channel;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * One server's synced data (the slice named by `scope`) was just re-synced,
 * or the sync recorded an error. Pushed to every window through NativePHP so
 * pages reload the matching props the moment fresh data exists.
 *
 * Deliberately NOT ShouldBroadcast(Now): NativePHP's EventWatcher forwards any
 * event whose broadcastOn() includes `nativephp`, so implementing the contract
 * would only also send it through Laravel's broadcaster (the `log` driver
 * here) on every sync. See docs/decisions/0021-push-data-changes-to-the-ui.md.
 */
class ServerDataSynced
{
    use Dispatchable;

    public readonly string $scope;

    public function __construct(public readonly string $server, ServerDataScope $scope)
    {
        $this->scope = $scope->value;
    }

    /** @return list<Channel> */
    public function broadcastOn(): array
    {
        return [new Channel('nativephp')];
    }
}
