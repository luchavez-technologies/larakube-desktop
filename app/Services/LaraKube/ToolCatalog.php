<?php

namespace App\Services\LaraKube;

use App\Jobs\Sync\SyncClusterToolsJob;
use App\Models\ClusterTool;
use App\Models\Server;
use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Process;

/**
 * Cluster Tools and their install state on one server, mirrored into the
 * cluster_tools table by SyncClusterToolsJob from
 * `larakube tool:list --json --context=…`. Reads here are always instant
 * database reads; a stale or missing list triggers a background re-sync
 * rather than blocking on the CLI, and the last verified list (or, on a
 * first-ever visit, the registry) is returned meanwhile.
 */
class ToolCatalog
{
    public const FRESH_SECONDS = SyncClusterToolsJob::FRESH_SECONDS;

    /** How long the registry-only list, used before any verified list exists, is kept. */
    private const REGISTERED_TTL_SECONDS = 600;

    public function __construct(private ToolLocator $locator) {}

    /**
     * @return list<array<string, mixed>>|null
     */
    public function forContext(string $context): ?array
    {
        $server = Server::firstWhere('context', $context);

        if ($server === null) {
            return null;
        }

        $last = $this->lastVerifiedForServer($server);

        // A sync already in flight (by this call or a concurrent one) is left alone —
        // treating "syncing" the same as "stale" would cascade duplicate re-verifications.
        if (($last === null || ! $this->isFresh($last)) && ! $this->isSyncing($server)) {
            SyncClusterToolsJob::dispatch($server->id);
            // Re-read: under the sync queue driver (tests, and briefly during a cold app boot) the
            // dispatch above already ran and wrote fresh rows, so this picks them up immediately
            // instead of returning the pre-dispatch snapshot; under a real async worker it's a no-op re-read.
            $last = $this->lastVerifiedForServer($server);
        }

        return $last['tools'] ?? null;
    }

    /**
     * The last verified list, however old, and when it was checked (null
     * once marked stale).
     *
     * @return array{tools: list<array<string, mixed>>, checkedAt: int|null}|null
     */
    public function lastVerified(string $context): ?array
    {
        $server = Server::firstWhere('context', $context);

        return $server === null ? null : $this->lastVerifiedForServer($server);
    }

    /**
     * @param  array{tools: list<array<string, mixed>>, checkedAt: int|null}  $last
     */
    public function isFresh(array $last): bool
    {
        return $last['checkedAt'] !== null && now()->getTimestamp() - $last['checkedAt'] < self::FRESH_SECONDS;
    }

    /**
     * The same rows from the tool registry alone (about a second): enough to
     * draw the page while the background sync verifies against the live cluster.
     * Unverified: a tool installed outside the registry shows as available.
     *
     * @return list<array<string, mixed>>|null
     */
    public function registered(string $context): ?array
    {
        $key = $this->registeredKey($context);
        $cached = Cache::get($key);

        if (is_array($cached) && array_is_list($cached)) {
            /** @var list<array<string, mixed>> $cached */
            return $cached;
        }

        $tools = $this->load($context);

        if ($tools !== null) {
            Cache::put($key, $tools, self::REGISTERED_TTL_SECONDS);
        }

        return $tools;
    }

    /**
     * One tool row. Tools are identified by their host (the instance identity).
     * $domainOrHost matches either the entry's host or its internal slug fallback.
     * Empty string returns the default/fallback row.
     *
     * @return array<string, mixed>|null
     */
    public function find(string $context, string $tool, string $domainOrHost = ''): ?array
    {
        $fallback = null;
        $rows = $this->cached($context) ?? $this->forContext($context) ?? $this->registered($context) ?? [];

        foreach ($rows as $row) {
            if (($row['tool'] ?? null) === $tool) {
                if ($domainOrHost !== '') {
                    if (($row['host'] ?? '') === $domainOrHost || ($row['instance'] ?? '') === $domainOrHost) {
                        return $row;
                    }
                }
                $fallback ??= $row;
            }
        }

        return $domainOrHost === '' ? $fallback : null;
    }

    /**
     * Only what is already synced, never triggers a new sync.
     *
     * @return list<array<string, mixed>>|null
     */
    public function cached(string $context): ?array
    {
        return $this->lastVerified($context)['tools'] ?? null;
    }

    /** Marks the verified list stale and dispatches an immediate re-sync — for the explicit "Refresh" action. */
    public function forget(string $context): void
    {
        $server = Server::firstWhere('context', $context);

        if ($server !== null) {
            ClusterTool::where('server_id', $server->id)->update(['sync_status' => 'stale']);
            SyncClusterToolsJob::dispatch($server->id);
        }

        Cache::forget($this->registeredKey($context));
    }

    /**
     * @return array{tools: list<array<string, mixed>>, checkedAt: int|null}|null
     */
    private function lastVerifiedForServer(Server $server): ?array
    {
        $rows = $server->clusterTools()->orderBy('position')->get();

        if ($rows->isEmpty()) {
            return null;
        }

        // "syncing" still has valid last-known data (it's mid re-verification, not invalidated),
        // so it counts here the same as "fresh" — only "stale"/"error" rows withhold checkedAt.
        $allFresh = $rows->every(fn (ClusterTool $row): bool => in_array($row->sync_status, ['fresh', 'syncing'], true) && $row->last_synced_at !== null);
        $checkedAt = $allFresh ? $rows->min('last_synced_at')?->getTimestamp() : null;

        return [
            'tools' => array_values($rows->map(fn (ClusterTool $row): array => $row->toToolArray())->all()),
            'checkedAt' => $checkedAt,
        ];
    }

    private function isSyncing(Server $server): bool
    {
        return $server->clusterTools()->where('sync_status', 'syncing')->exists();
    }

    /**
     * The registry-only list (about a second): no kubectl round trips, just what the CLI ships.
     *
     * @return list<array<string, mixed>>|null
     */
    private function load(string $context): ?array
    {
        $cli = $this->locator->find('larakube');

        if ($cli === null) {
            return null;
        }

        $isolated = $this->locator->isolate([$cli, 'tool:list', "--context={$context}", '--registry-only', '--json', '--no-interaction']);
        try {
            $result = Process::env($isolated['environment'])->timeout(15)->run($isolated['command']);
        } catch (ProcessTimedOutException) {
            return null;
        }

        $decoded = json_decode(trim($result->output()), true);

        if (! $result->successful() || ! is_array($decoded) || ! array_is_list($decoded)) {
            return null;
        }

        /** @var list<array<string, mixed>> $decoded */
        return $decoded;
    }

    private function registeredKey(string $context): string
    {
        return 'cluster-tools:'.$context.':registered';
    }
}
