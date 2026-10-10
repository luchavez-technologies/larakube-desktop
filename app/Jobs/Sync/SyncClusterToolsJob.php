<?php

namespace App\Jobs\Sync;

use App\Enums\ActivityType;
use App\Models\Activity;
use App\Models\ClusterTool;
use App\Models\Server;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Process;

/**
 * Mirrors `larakube tool:list --json --context=…` for one server into the
 * cluster_tools table. Replaces ToolCatalog's Cache-backed verified list.
 */
class SyncClusterToolsJob extends SyncJob
{
    public const FRESH_SECONDS = 1800;

    public function __construct(public int $serverId) {}

    protected function uniqueKey(): string
    {
        return (string) $this->serverId;
    }

    public function handle(ToolLocator $locator): void
    {
        $server = Server::find($this->serverId);

        if ($server === null || $server->context === null) {
            return;
        }

        // Captured before the "syncing" update below overwrites every row's
        // status — markError()'s own exists() check would otherwise always
        // see "syncing" and never recognise a repeat failure.
        $wasAlreadyErrored = ClusterTool::where('server_id', $server->id)->where('sync_status', 'error')->exists();

        ClusterTool::where('server_id', $server->id)->update(['sync_status' => 'syncing']);

        $cli = $locator->find('larakube');

        if ($cli === null) {
            $this->markError($server->id, 'The LaraKube CLI is not installed.', $wasAlreadyErrored);

            return;
        }

        $isolated = $locator->isolate([$cli, 'tool:list', "--context={$server->context}", '--json', '--no-interaction']);

        try {
            $result = Process::env($isolated['environment'])->timeout(180)->run($isolated['command']);
        } catch (ProcessTimedOutException) {
            $this->markError($server->id, 'Timed out waiting for the cluster.', $wasAlreadyErrored);

            return;
        }

        $decoded = json_decode(trim($result->output()), true);

        if (! $result->successful() || ! is_array($decoded) || ! array_is_list($decoded)) {
            $this->markError($server->id, 'tool:list did not return a valid list.', $wasAlreadyErrored);

            return;
        }

        /** @var list<array<string, mixed>> $decoded */
        DB::transaction(function () use ($server, $decoded): void {
            $seenKeys = [];

            foreach ($decoded as $position => $row) {
                $tool = (string) ($row['tool'] ?? '');

                if ($tool === '') {
                    continue;
                }

                $host = isset($row['host']) && $row['host'] !== '' ? (string) $row['host'] : null;
                $seenKeys[] = $tool.'|'.($host ?? '');

                $wasNew = ! ClusterTool::where('server_id', $server->id)->where('tool', $tool)->where('host', $host)->exists();

                $clusterTool = ClusterTool::updateOrCreate(
                    ['server_id' => $server->id, 'tool' => $tool, 'host' => $host],
                    [
                        'instance' => isset($row['instance']) ? (string) $row['instance'] : null,
                        'installed' => (bool) ($row['installed'] ?? false),
                        'multi_instance' => $row['multiInstance'] ?? true,
                        'position' => $position,
                        'data' => $row,
                        'sync_status' => 'fresh',
                        'last_synced_at' => now(),
                        'last_sync_error' => null,
                    ],
                );

                if ($wasNew) {
                    Activity::create([
                        'server_id' => $server->id,
                        'cluster_tool_id' => $clusterTool->id,
                        'type' => ActivityType::ToolFirstSynced,
                        'title' => "Found {$tool} on {$server->name}",
                        'occurred_at' => now(),
                    ]);
                }
            }

            // A tool the CLI no longer reports was removed outside a tracked Run (or the registry changed) — drop its row.
            ClusterTool::where('server_id', $server->id)
                ->get()
                ->reject(fn (ClusterTool $row): bool => in_array($row->tool.'|'.($row->host ?? ''), $seenKeys, true))
                ->each(fn (ClusterTool $row) => $row->delete());
        });
    }

    private function markError(int $serverId, string $message, bool $alreadyErrored): void
    {
        ClusterTool::where('server_id', $serverId)->update(['sync_status' => 'error', 'last_sync_error' => $message]);

        if (! $alreadyErrored) {
            Activity::create([
                'server_id' => $serverId,
                'type' => ActivityType::ToolSyncFailed,
                'title' => 'Could not check installed tools',
                'description' => $message,
                'occurred_at' => now(),
            ]);
        }
    }
}
