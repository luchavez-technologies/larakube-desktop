<?php

use App\Enums\ActivityType;
use App\Jobs\Sync\SyncPlexJob;
use App\Models\Activity;
use App\Models\Server;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;

function syncPlexFakeCli(): string
{
    // ClusterStatus caches plex() per context for 10 minutes; every test here
    // reuses the same "larakube-alpha" context, so a prior test's cached
    // result would otherwise silently mask this one's fake.
    Cache::flush();

    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);
    File::put("{$directory}/larakube", "#!/bin/sh\n");
    chmod("{$directory}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$directory]));

    return $directory;
}

function fakePlexReport(): array
{
    return [
        'initialized' => true,
        'context' => 'larakube-alpha',
        'services' => ['postgres' => true],
        'serviceCatalog' => ['database' => ['active' => 'postgres', 'options' => []]],
        'tenants' => ['tool' => [], 'project' => [], 'custom' => []],
    ];
}

test('syncing a Plex Commons report persists it and marks the server fresh', function () {
    $bin = syncPlexFakeCli();
    $server = Server::create(['name' => 'alpha', 'provider' => 'do', 'kind' => 'vps', 'context' => 'larakube-alpha', 'status' => 'ready']);

    Process::fake(['*plex:show*' => Process::result(output: json_encode(fakePlexReport()))]);

    SyncPlexJob::dispatchSync($server->id);

    $server->refresh();
    expect($server->plex_sync_status)->toBe('fresh')
        ->and($server->plex_last_synced_at)->not->toBeNull()
        ->and($server->plex_last_sync_error)->toBeNull()
        ->and($server->plex_data)->toMatchArray(fakePlexReport());

    File::deleteDirectory($bin);
});

test('an unreachable cluster marks the report errored but keeps the last known data', function () {
    $bin = syncPlexFakeCli();
    $server = Server::create([
        'name' => 'alpha', 'provider' => 'do', 'kind' => 'vps', 'context' => 'larakube-alpha', 'status' => 'ready',
        'plex_data' => fakePlexReport(), 'plex_sync_status' => 'fresh', 'plex_last_synced_at' => now()->subHour(),
    ]);

    Process::fake(['*plex:show*' => Process::result(output: '', exitCode: 1)]);

    SyncPlexJob::dispatchSync($server->id);

    $server->refresh();
    expect($server->plex_sync_status)->toBe('error')
        ->and($server->plex_last_sync_error)->not->toBeNull()
        ->and($server->plex_data)->toMatchArray(fakePlexReport());

    expect(Activity::where('server_id', $server->id)->where('type', ActivityType::PlexSyncFailed)->count())->toBe(1);

    File::deleteDirectory($bin);
});

test('repeated failures record exactly one activity, not one per attempt', function () {
    $bin = syncPlexFakeCli();
    $server = Server::create(['name' => 'alpha', 'provider' => 'do', 'kind' => 'vps', 'context' => 'larakube-alpha', 'status' => 'ready']);

    Process::fake(['*plex:show*' => Process::result(output: '', exitCode: 1)]);

    SyncPlexJob::dispatchSync($server->id);
    SyncPlexJob::dispatchSync($server->id);
    SyncPlexJob::dispatchSync($server->id);

    expect(Activity::where('server_id', $server->id)->where('type', ActivityType::PlexSyncFailed)->count())->toBe(1);

    File::deleteDirectory($bin);
});

test('re-syncing does not record an activity when nothing failed', function () {
    $bin = syncPlexFakeCli();
    $server = Server::create(['name' => 'alpha', 'provider' => 'do', 'kind' => 'vps', 'context' => 'larakube-alpha', 'status' => 'ready']);

    Process::fake(['*plex:show*' => Process::result(output: json_encode(fakePlexReport()))]);

    SyncPlexJob::dispatchSync($server->id);
    SyncPlexJob::dispatchSync($server->id);

    expect(Activity::where('type', ActivityType::PlexSyncFailed)->count())->toBe(0);

    File::deleteDirectory($bin);
});

test('a missing server row is a no-op', function () {
    syncPlexFakeCli();
    Process::fake(['*' => Process::result(output: '')]);

    SyncPlexJob::dispatchSync(999999);

    expect(Activity::count())->toBe(0);
});
