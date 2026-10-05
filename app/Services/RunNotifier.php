<?php

namespace App\Services;

use App\Enums\RunStatus;
use App\Models\Run;
use Native\Desktop\Facades\Notification;
use Throwable;

/**
 * Tells the user when something they started has finished, for the things that take long enough that they have looked away:
 * a run of half a minute or more, or an update that is ready. Clicking the notification opens the run or Settings.
 */
class RunNotifier
{
    public const MIN_SECONDS = 30;

    public function runFinished(Run $run): void
    {
        if ($run->status === RunStatus::Cancelled || $run->finished_at === null || $run->created_at === null) {
            return;
        }

        $seconds = (int) $run->created_at->diffInSeconds($run->finished_at, true);

        if ($seconds < self::MIN_SECONDS) {
            return;
        }

        $failed = $run->status === RunStatus::Failed;
        $reason = is_string($run->result['error'] ?? null) ? $run->result['error'] : null;

        $this->show(
            $failed ? "{$run->label} failed" : "{$run->label} finished",
            $failed ? ($reason ?? 'Click to see why.') : 'Finished in '.$this->duration($seconds).'. Click to open.',
            "run:{$run->id}",
        );
    }

    public function updateReady(string $version): void
    {
        $this->show('LaraKube Desktop update ready', "Version {$version} is downloaded. Click to restart and finish updating.", 'update');
    }

    private function show(string $title, string $message, string $reference): void
    {
        try {
            Notification::title($title)->message($message)->reference($reference)->show();
        } catch (Throwable) {
            // A notification must never turn a finished run into an error.
        }
    }

    private function duration(int $seconds): string
    {
        return $seconds >= 60 ? intdiv($seconds, 60).'m '.($seconds % 60).'s' : "{$seconds}s";
    }
}
