<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * An Activity row was created. Pushed to open windows so the notification bell
 * updates its unread badge immediately.
 */
class NotificationCreated
{
    use Dispatchable;

    public function __construct(public readonly int $activity) {}

    /** @return list<Channel> */
    public function broadcastOn(): array
    {
        return [new Channel('nativephp')];
    }
}
