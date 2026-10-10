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
