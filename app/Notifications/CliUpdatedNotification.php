<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class CliUpdatedNotification extends Notification
{
    use Queueable;

    public function __construct(public string $channel) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'cli-update',
            'title' => 'LaraKube CLI synced',
            'channel' => $this->channel,
            'message' => "Updated to the latest {$this->channel} build to match this Desktop version.",
        ];
    }
}
