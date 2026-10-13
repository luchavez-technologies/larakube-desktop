<?php

namespace App\Notifications;

use App\Models\Run;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class RunFinishedNotification extends Notification
{
    use Queueable;

    public function __construct(public Run $run) {}

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
        $seconds = $this->run->created_at && $this->run->finished_at
            ? (int) $this->run->created_at->diffInSeconds($this->run->finished_at, true)
            : 0;

        $duration = $seconds >= 60 ? intdiv($seconds, 60).'m '.($seconds % 60).'s' : "{$seconds}s";
        $reason = is_string($this->run->result['error'] ?? null) ? $this->run->result['error'] : null;

        return [
            'type' => 'run',
            'run_id' => $this->run->id,
            'title' => $this->run->label,
            'status' => $this->run->status->value,
            'kind' => $this->run->kind?->value,
            'duration' => $duration,
            'error' => $reason,
            'created_at' => $this->run->created_at?->toIso8601String(),
            'finished_at' => $this->run->finished_at?->toIso8601String(),
        ];
    }
}
