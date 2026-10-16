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
     * 'update' on purpose, not a distinct 'cli-update' — the notification bell
     * (notification-bell.tsx) special-cases the literal string 'update' for
     * both its icon and its click target (Settings). A CLI sync is the same
     * "something got updated, go check Settings" shape as a Desktop update,
     * so it gets the same type rather than silently falling through to the
     * generic icon and a dead click (no run_id to navigate to otherwise).
     *
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'update',
            'title' => 'LaraKube CLI synced',
            'channel' => $this->channel,
            'message' => "Updated to the latest {$this->channel} build to match this Desktop version.",
        ];
    }
}
