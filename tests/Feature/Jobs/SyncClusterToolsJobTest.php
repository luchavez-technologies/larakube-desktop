<?php

use App\Enums\ActivityType;
use App\Jobs\Sync\SyncClusterToolsJob;
use App\Models\Activity;
use App\Models\ClusterTool;
use App\Models\Server;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;

function syncClusterToolsFakeCli(): string
{
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);
    File::put("{$directory}/larakube", "#!/bin/sh\n");
    chmod("{$directory}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$directory]));

    return $directory;
}

test('repeated failures record exactly one activity, not one per attempt', function () {
    $bin = syncClusterToolsFakeCli();
    $server = Server::create(['name' => 'alpha', 'provider' => 'do', 'kind' => 'vps', 'context' => 'larakube-alpha', 'status' => 'ready']);
    // At least one previously-discovered tool, so sync_status='error' has a
    // row to actually live on — a server with zero ever-discovered tools has
    // nowhere to persist "erroring" at all (a separate, pre-existing gap).
    ClusterTool::create(['server_id' => $server->id, 'tool' => 'n8n', 'installed' => true, 'sync_status' => 'fresh', 'data' => []]);

    Process::fake(['*tool:list*' => Process::result(output: '', exitCode: 1)]);

    SyncClusterToolsJob::dispatchSync($server->id);
    SyncClusterToolsJob::dispatchSync($server->id);
    SyncClusterToolsJob::dispatchSync($server->id);

    expect(Activity::where('server_id', $server->id)->where('type', ActivityType::ToolSyncFailed)->count())->toBe(1);

    File::deleteDirectory($bin);
});

test('each installed tool carries its update status from tool:outdated', function () {
    $bin = syncClusterToolsFakeCli();
    $server = Server::create(['name' => 'alpha', 'provider' => 'do', 'kind' => 'vps', 'context' => 'larakube-alpha', 'status' => 'ready']);

    Process::fake([
        '*tool:list*' => Process::result(output: json_encode([
            ['tool' => 'n8n', 'host' => 'flow.example.com', 'installed' => true],
            ['tool' => 'outline', 'host' => 'notes.example.com', 'installed' => true],
        ])),
        '*tool:outdated*' => Process::result(output: json_encode([
            ['tool' => 'n8n', 'host' => 'flow.example.com', 'status' => 'outdated', 'installedRevision' => 'aaaaaaaaaaaa', 'availableRevision' => 'bbbbbbbbbbbb', 'images' => ['docker.n8n.io/n8nio/n8n:2.39.8']],
            ['tool' => 'outline', 'host' => 'notes.example.com', 'status' => 'current', 'installedRevision' => 'cccccccccccc', 'availableRevision' => 'cccccccccccc', 'images' => []],
        ])),
    ]);

    SyncClusterToolsJob::dispatchSync($server->id);

    $n8n = ClusterTool::where('tool', 'n8n')->sole()->toToolArray();

    expect($n8n['update']['status'])->toBe('outdated')
        ->and($n8n['update']['availableRevision'])->toBe('bbbbbbbbbbbb')
        ->and($n8n['update']['images'])->toBe(['docker.n8n.io/n8nio/n8n:2.39.8'])
        ->and(ClusterTool::where('tool', 'outline')->sole()->toToolArray()['update']['status'])->toBe('current');

    File::deleteDirectory($bin);
});

test('a failed tool:outdated keeps the last known update status instead of clearing it', function () {
    $bin = syncClusterToolsFakeCli();
    $server = Server::create(['name' => 'alpha', 'provider' => 'do', 'kind' => 'vps', 'context' => 'larakube-alpha', 'status' => 'ready']);
    ClusterTool::create([
        'server_id' => $server->id, 'tool' => 'n8n', 'host' => 'flow.example.com', 'installed' => true, 'sync_status' => 'fresh',
        'data' => ['update' => ['status' => 'outdated', 'installedRevision' => 'a', 'availableRevision' => 'b', 'images' => []]],
    ]);

    Process::fake([
        '*tool:list*' => Process::result(output: json_encode([['tool' => 'n8n', 'host' => 'flow.example.com', 'installed' => true]])),
        // An older CLI without the command.
        '*tool:outdated*' => Process::result(output: '', errorOutput: 'Command "tool:outdated" is not defined.', exitCode: 1),
    ]);

    SyncClusterToolsJob::dispatchSync($server->id);

    expect(ClusterTool::where('tool', 'n8n')->sole()->toToolArray()['update']['status'])->toBe('outdated');

    File::deleteDirectory($bin);
});
