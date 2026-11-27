<?php

namespace App\Jobs\Sync;

use Illuminate\Bus\Queueable;
use Illuminate\Bus\UniqueLock;
use Illuminate\Contracts\Cache\Repository as Cache;
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

    /** The queue explicit refreshes run on, with its own worker, so they never wait behind routine syncs. */
    public const INTERACTIVE_QUEUE = 'interactive';

    /**
     * Run this sync now-ish, for something the person asked for (a Refresh button, a Run that just
     * changed this data): on the interactive queue, and past any routine copy of the same sync still
     * waiting on the default queue, whose uniqueness lock would otherwise swallow this one.
     */
    public static function dispatchInteractive(self $job): void
    {
        (new UniqueLock(app(Cache::class)))->release($job);

        dispatch($job->onQueue(self::INTERACTIVE_QUEUE));
    }

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
