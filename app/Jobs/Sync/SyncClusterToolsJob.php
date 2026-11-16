<?php

namespace App\Jobs\Sync;

use App\Enums\ActivityType;
use App\Events\ClusterToolsSynced;
use App\Models\Activity;
use App\Models\CatalogTool;
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

        // The whole body is guarded, not just the CLI call — a failure in
        // the "syncing" update itself (a schema out of date with the code, a
        // locked database) must still end in a visible, recorded error state
        // rather than an uncaught exception that leaves every row stuck
        // forever and the page polling with nothing to show for it.
        try {
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

            $updates = $this->updateStatuses($locator, $cli, $server->context);

            /** @var list<array<string, mixed>> $decoded */
            DB::transaction(function () use ($server, $decoded, $updates): void {
                $seenKeys = [];

                foreach ($decoded as $position => $row) {
                    $tool = (string) ($row['tool'] ?? '');

                    if ($tool === '') {
                        continue;
                    }

                    $host = isset($row['host']) && $row['host'] !== '' ? (string) $row['host'] : null;
                    $seenKeys[] = $tool.'|'.($host ?? '');

                    $existing = ClusterTool::where('server_id', $server->id)
                        ->where('tool', $tool)
                        ->where('host', $host)
                        ->first();
                    $wasNew = $existing === null;

                    $preservedData = [];
                    if ($existing !== null) {
                        $existingData = $existing->data ?? [];
                        foreach (['serverInfo', 'queue', 'wiredTools', 'driveInfo', 'extensions', 'status', 'update'] as $deepKey) {
                            if (array_key_exists($deepKey, $existingData)) {
                                $preservedData[$deepKey] = $existingData[$deepKey];
                            }
                        }
                    }

                    // A failed tool:outdated keeps the last known status rather than clearing it.
                    if ($updates !== null) {
                        $row['update'] = $updates[$tool.'|'.($host ?? '')] ?? null;
                    }

                    CatalogTool::upsertFromPayload($row, $position);

                    $clusterTool = ClusterTool::updateOrCreate(
                        ['server_id' => $server->id, 'tool' => $tool, 'host' => $host],
                        [
                            'instance' => isset($row['instance']) ? (string) $row['instance'] : null,
                            'installed' => (bool) ($row['installed'] ?? false),
                            'multi_instance' => $row['multiInstance'] ?? true,
                            'position' => $position,
                            'data' => [...$preservedData, ...$row],
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
        } catch (\Throwable $e) {
            $this->markError($server->id, $e->getMessage(), $wasAlreadyErrored);
        } finally {
            // Fresh rows or a recorded error: either way the page should reload now.
            ClusterToolsSynced::dispatch($server->name);
        }
    }

    /**
     * Each installed instance's update status from `tool:outdated`, keyed `tool|host`, or null when it couldn't be read
     * (an older CLI without the command, or a timeout).
     *
     * @return ?array<string, array{status: string, installedRevision: ?string, availableRevision: string, images: list<string>}>
     */
    private function updateStatuses(ToolLocator $locator, string $cli, string $context): ?array
    {
        $isolated = $locator->isolate([$cli, 'tool:outdated', "--context={$context}", '--json', '--no-interaction']);

        try {
            $result = Process::env($isolated['environment'])->timeout(120)->run($isolated['command']);
        } catch (ProcessTimedOutException) {
            return null;
        }

        $decoded = json_decode(trim($result->output()), true);

        if (! $result->successful() || ! is_array($decoded) || ! array_is_list($decoded)) {
            return null;
        }

        $statuses = [];

        foreach ($decoded as $row) {
            if (! is_array($row) || ! isset($row['tool'], $row['status'])) {
                continue;
            }

            $statuses[$row['tool'].'|'.($row['host'] ?? '')] = [
                'status' => (string) $row['status'],
                'installedRevision' => isset($row['installedRevision']) ? (string) $row['installedRevision'] : null,
                'availableRevision' => (string) ($row['availableRevision'] ?? ''),
                'images' => array_values(array_map('strval', $row['images'] ?? [])),
                // Each container's exact running image (and this build's pin where known), for people to verify.
                'containers' => array_values(array_map(fn (array $c): array => [
                    'component' => (string) ($c['component'] ?? ''),
                    'container' => (string) ($c['container'] ?? ''),
                    'running' => (string) ($c['running'] ?? ''),
                    'available' => isset($c['available']) ? (string) $c['available'] : null,
                    'primary' => (bool) ($c['primary'] ?? false),
                ], array_filter($row['containers'] ?? [], 'is_array'))),
            ];
        }

        return $statuses;
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
