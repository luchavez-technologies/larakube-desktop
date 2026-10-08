<?php

namespace App\Jobs\Sync;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * A background refresh of CLI-derived state into the database, run on the
 * NativePHP-managed queue worker that is already running on every app
 * launch. ShouldBeUnique means a page visit and the app-boot warm sync
 * dispatching the same job within uniqueFor() seconds is a no-op, not a
 * second CLI shell-out.
 */
abstract class SyncJob implements ShouldBeUnique, ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public function uniqueId(): string
    {
        return static::class.':'.$this->uniqueKey();
    }

    /** Shorter than any table's own fresh-window, so a lock from a crashed attempt can't block a legitimate re-sync. */
    public function uniqueFor(): int
    {
        return 300;
    }

    abstract protected function uniqueKey(): string;
}
