<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class UpdateReadyNotification extends Notification
{
    use Queueable;

    public function __construct(public string $version) {}

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
            'type' => 'update',
            'title' => 'LaraKube Desktop update ready',
            'version' => $this->version,
            'message' => "Version {$this->version} is downloaded. Click to restart and finish updating.",
        ];
    }
}
