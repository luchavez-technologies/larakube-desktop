<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Local cluster state or local project workload counts were just re-synced
 * (or the sync attempt ended). Pushed to open windows and the tray so local
 * status badges reload without aggressive background polling.
 */
class LocalWorkloadsSynced
{
    use Dispatchable;

    /** @return list<Channel> */
    public function broadcastOn(): array
    {
        return [new Channel('nativephp')];
    }
}
