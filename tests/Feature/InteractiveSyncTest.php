<?php

use App\Jobs\Sync\SyncJob;
use App\Jobs\Sync\SyncPlexJob;
use App\Models\Server;
use App\Services\LaraKube\PlexCatalog;
use Illuminate\Bus\UniqueLock;
use Illuminate\Contracts\Cache\Repository as Cache;
use Illuminate\Support\Facades\Queue;

function interactiveSyncServer(): Server
{
    return Server::create(['name' => 'hello-cloud', 'provider' => 'gcp', 'kind' => 'vps', 'context' => 'larakube-35.236.161.146', 'status' => 'ready']);
}

test('a Refresh puts its sync on the interactive queue, not behind routine syncs', function () {
    Queue::fake();
    $server = interactiveSyncServer();

    app(PlexCatalog::class)->forget('larakube-35.236.161.146');

    Queue::assertPushedOn(SyncJob::INTERACTIVE_QUEUE, SyncPlexJob::class, fn (SyncPlexJob $job): bool => $job->serverId === $server->id);
});

test('a Refresh is not swallowed by a routine copy of the same sync already waiting', function () {
    Queue::fake();
    $server = interactiveSyncServer();
    // The routine sync took the uniqueness lock when it was queued.
    expect((new UniqueLock(app(Cache::class)))->acquire(new SyncPlexJob($server->id)))->toBeTrue();
    SyncPlexJob::dispatch($server->id);
    Queue::assertNothingPushed();

    SyncJob::dispatchInteractive(new SyncPlexJob($server->id));

    Queue::assertPushedOn(SyncJob::INTERACTIVE_QUEUE, SyncPlexJob::class);
});

test('the queue hands a job to a second attempt only after the slowest worker would have stopped it', function () {
    $slowest = collect(config('nativephp.queue_workers'))->max('timeout');

    expect(config('queue.connections.database.retry_after'))->toBeGreaterThan($slowest)
        ->and(config('nativephp.queue_workers'))->toHaveKey('interactive');
});
