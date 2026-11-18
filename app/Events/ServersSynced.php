<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * The fleet server list changed (sync finished, or a server create/destroy
 * run finished). Pushed to open windows so server lists and switchers reload
 * immediately.
 */
class ServersSynced
{
    use Dispatchable;

    /** @return list<Channel> */
    public function broadcastOn(): array
    {
        return [new Channel('nativephp')];
    }
}
