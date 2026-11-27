<?php

use App\Jobs\Sync\SyncServerTlsJob;
use App\Models\Server;
use App\Services\LaraKube\ClusterStatus;
use Illuminate\Support\Facades\Cache;

function unreachableSyncServer(string $context): Server
{
    return Server::create(['name' => 'gone-vps', 'provider' => 'cloud', 'kind' => 'discovered', 'context' => $context, 'status' => 'ready']);
}

test('a server that does not answer is skipped instead of holding the queue until its sync times out', function () {
    $server = unreachableSyncServer('larakube-203.0.113.9');
    Cache::put('context-health:larakube-203.0.113.9', false, 60);
    $tls = mock(ClusterStatus::class);
    $tls->shouldNotReceive('tls');
    app()->instance(ClusterStatus::class, $tls);

    dispatch_sync(new SyncServerTlsJob($server->id));

    expect($server->fresh()->tls_sync_status)->not->toBe('syncing');
});

test('a server that answers is synced as usual', function () {
    $server = unreachableSyncServer('larakube-203.0.113.10');
    Cache::put('context-health:larakube-203.0.113.10', true, 60);
    $tls = mock(ClusterStatus::class);
    $tls->shouldReceive('tls')->once()->andReturn(['success' => true, 'hosts' => []]);
    app()->instance(ClusterStatus::class, $tls);

    dispatch_sync(new SyncServerTlsJob($server->id));

    expect($server->fresh()->tls_sync_status)->toBe('fresh');
});

test('a sync that runs out of time fails once rather than being retried', function () {
    expect((new SyncServerTlsJob(1))->failOnTimeout)->toBeTrue();
});
