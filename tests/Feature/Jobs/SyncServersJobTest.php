<?php

use App\Enums\ActivityType;
use App\Jobs\Sync\SyncServersJob;
use App\Models\Activity;
use App\Models\Server;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;

function syncServersFakeCli(): string
{
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);
    File::put("{$directory}/larakube", "#!/bin/sh\n");
    chmod("{$directory}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$directory]));

    return $directory;
}

test('syncing servers upserts rows by name and records a first-synced activity', function () {
    $bin = syncServersFakeCli();
    Process::fake(['*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
        ['name' => 'alpha', 'provider' => 'do', 'kind' => 'vps', 'region' => 'ams3', 'ip' => '203.0.113.1', 'context' => 'larakube-alpha', 'account' => null, 'projectId' => null, 'status' => 'ready'],
    ]]))]);

    SyncServersJob::dispatchSync();

    $server = Server::sole();
    expect($server->name)->toBe('alpha')
        ->and($server->context)->toBe('larakube-alpha')
        ->and($server->sync_status)->toBe('fresh')
        ->and($server->last_synced_at)->not->toBeNull()
        ->and(Activity::where('type', ActivityType::ServerFirstSynced)->where('server_id', $server->id)->exists())->toBeTrue();

    File::deleteDirectory($bin);
});

test('a server missing from a fresh listing is marked missing, not deleted', function () {
    $bin = syncServersFakeCli();
    $server = Server::create(['name' => 'gone', 'provider' => 'do', 'kind' => 'vps', 'context' => 'larakube-gone', 'status' => 'ready']);

    Process::fake(['*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => []]))]);

    SyncServersJob::dispatchSync();

    expect($server->fresh()->status)->toBe('missing');

    File::deleteDirectory($bin);
});

test('re-syncing an already-known server does not record a second first-synced activity', function () {
    $bin = syncServersFakeCli();
    Process::fake(['*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
        ['name' => 'alpha', 'provider' => 'do', 'kind' => 'vps', 'region' => 'ams3', 'ip' => '203.0.113.1', 'context' => 'larakube-alpha', 'account' => null, 'projectId' => null, 'status' => 'ready'],
    ]]))]);

    SyncServersJob::dispatchSync();
    SyncServersJob::dispatchSync();

    expect(Activity::where('type', ActivityType::ServerFirstSynced)->count())->toBe(1);

    File::deleteDirectory($bin);
});
