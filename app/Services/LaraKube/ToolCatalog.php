<?php

namespace App\Services\LaraKube;

use App\Jobs\Sync\SyncCatalogToolsJob;
use App\Jobs\Sync\SyncClusterToolsJob;
use App\Models\CatalogTool;
use App\Models\ClusterTool;
use App\Models\Server;
use Illuminate\Pagination\LengthAwarePaginator;
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
     * Whether a re-sync for this server is pending or in flight — 'stale'
     * the instant Refresh is clicked (before the queued job has even
     * started), 'syncing' once it has — so the Refresh button can show a
     * visible syncing state and disable itself instead of inviting repeat
     * clicks while the user waits. Deliberately broader than the private
     * isSyncing() above, which only means "syncing", and must stay that way:
     * it also gates whether forContext() dispatches a new job at all, and
     * 'stale' there has to still be eligible to dispatch one.
     */
    public function contextIsSyncing(string $context): bool
    {
        $server = Server::firstWhere('context', $context);

        return $server !== null && $server->clusterTools()->whereIn('sync_status', ['stale', 'syncing'])->exists();
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

    public function registeredKey(string $context): string
    {
        return 'cluster-tools:'.$context.':registered';
    }

    public function ensureCatalogSeeded(): void
    {
        if (! CatalogTool::exists()) {
            SyncCatalogToolsJob::dispatch();
        }
    }

    /**
     * Resolve one tool's full catalog definition (initFields, commonsCapabilities, etc.),
     * preferring live server context state if present and falling back to `catalog_tools`.
     *
     * @return array<string, mixed>|null
     */
    public function findDefinition(string $toolSlug, ?string $context = null): ?array
    {
        if ($context !== null && $context !== '') {
            $serverRow = $this->find($context, $toolSlug);
            if ($serverRow !== null) {
                return $serverRow;
            }
        }

        $catalog = CatalogTool::firstWhere('slug', $toolSlug);
        if ($catalog !== null) {
            return $catalog->toToolRow();
        }

        if ($context !== null && $context !== '') {
            foreach ($this->registered($context) ?? [] as $row) {
                if (($row['tool'] ?? null) === $toolSlug) {
                    return $row;
                }
            }
        }

        return null;
    }

    /**
     * Server-side paginated catalog query (ADR 0013) backed by `catalog_tools`
     * with seamless fallback for test suites seeding `cluster_tools` directly.
     *
     * @param  array{q?: ?string, category?: ?string, source?: ?string, scope?: ?string, installed_only?: ?bool}  $filters
     * @return array{data: list<array<string, mixed>>, meta: array{current_page: int, last_page: int, per_page: int, total: int}}
     */
    public function paginatedCatalog(string $context = '', array $filters = [], int $page = 1, int $perPage = 18): array
    {
        $page = max(1, $page);
        $perPage = min(50, max(1, $perPage));
        $q = trim((string) ($filters['q'] ?? ''));
        $category = trim((string) ($filters['category'] ?? ''));
        $source = trim((string) ($filters['source'] ?? ''));
        $scope = trim((string) ($filters['scope'] ?? 'all'));
        $installedOnly = (bool) ($filters['installed_only'] ?? false) || $scope === 'installed';

        $this->ensureCatalogSeeded();

        $installedBySlug = $this->installedMapForContext($context);
        $installedSlugs = array_keys($installedBySlug);

        if (CatalogTool::exists()) {
            $query = CatalogTool::query()
                ->search($q)
                ->category($category)
                ->source($source);

            if ($installedOnly) {
                $query->whereIn('slug', $installedSlugs !== [] ? $installedSlugs : ['__none__']);
            } elseif ($scope === 'explore' && $installedSlugs !== []) {
                $query->whereNotIn('slug', $installedSlugs);
            }

            /** @var LengthAwarePaginator<int, CatalogTool> $paginator */
            $paginator = $query
                ->orderByRaw("CASE WHEN source = 'official' THEN 0 ELSE 1 END")
                ->orderBy('position')
                ->orderBy('name')
                ->paginate($perPage, ['*'], 'page', $page);

            $data = array_values(array_map(function (CatalogTool $entry) use ($installedBySlug): array {
                $row = $entry->toToolRow();
                if (isset($installedBySlug[$entry->slug])) {
                    $installedRow = $installedBySlug[$entry->slug][0];

                    return [
                        ...$row,
                        ...$installedRow,
                        'source' => $row['source'],
                        'commonsCapabilities' => $installedRow['commonsCapabilities'] ?? $row['commonsCapabilities'],
                        'initFields' => ($installedRow['initFields'] ?? []) !== [] ? $installedRow['initFields'] : $row['initFields'],
                    ];
                }

                return $row;
            }, $paginator->items()));

            return [
                'data' => $data,
                'meta' => [
                    'current_page' => $paginator->currentPage(),
                    'last_page' => $paginator->lastPage(),
                    'per_page' => $paginator->perPage(),
                    'total' => $paginator->total(),
                    'has_more' => $paginator->hasMorePages(),
                ],
            ];
        }

        // Legacy fallback when tests seed ClusterTool models directly without CatalogTool rows
        $rows = $context !== '' ? ($this->cached($context) ?? $this->forContext($context) ?? $this->registered($context) ?? []) : [];

        $filtered = array_values(array_filter($rows, function (array $row) use ($q, $category, $source, $scope, $installedOnly): bool {
            $installed = ! empty($row['installed']);
            if ($installedOnly && ! $installed) {
                return false;
            }
            if ($scope === 'explore' && $installed) {
                return false;
            }
            if ($source !== '' && $source !== 'all' && ($row['source'] ?? 'official') !== $source) {
                return false;
            }
            if ($category !== '' && $category !== 'all' && ! in_array($category, (array) ($row['categories'] ?? []), true)) {
                return false;
            }
            if ($q !== '') {
                $haystack = strtolower(implode(' ', [
                    (string) ($row['tool'] ?? ''),
                    (string) ($row['name'] ?? ''),
                    (string) ($row['brand'] ?? ''),
                    (string) ($row['tagline'] ?? ''),
                ]));
                if (! str_contains($haystack, strtolower($q))) {
                    return false;
                }
            }

            return true;
        }));

        $total = count($filtered);
        $lastPage = max(1, (int) ceil($total / $perPage));
        $pageData = array_slice($filtered, ($page - 1) * $perPage, $perPage);

        return [
            'data' => $pageData,
            'meta' => [
                'current_page' => $page,
                'last_page' => $lastPage,
                'per_page' => $perPage,
                'total' => $total,
                'has_more' => $page < $lastPage,
            ],
        ];
    }

    /**
     * Facet counts (categories & sources) for the Apps Store filter pills.
     *
     * @return array{all: int, official: int, community: int, categories: array<string, int>}
     */
    public function facetCounts(): array
    {
        if (! CatalogTool::exists()) {
            return ['all' => 0, 'official' => 0, 'community' => 0, 'categories' => []];
        }

        $categories = [];
        $official = 0;
        $community = 0;

        foreach (CatalogTool::query()->get(['source', 'categories']) as $item) {
            if ($item->source === 'community') {
                $community++;
            } else {
                $official++;
            }
            foreach ($item->categories ?? [] as $cat) {
                $categories[$cat] = ($categories[$cat] ?? 0) + 1;
            }
        }

        return [
            'all' => $official + $community,
            'official' => $official,
            'community' => $community,
            'categories' => $categories,
        ];
    }

    /**
     * @return array<string, list<array<string, mixed>>>
     */
    private function installedMapForContext(string $context): array
    {
        if ($context === '') {
            return [];
        }

        $rows = $this->cached($context) ?? $this->forContext($context) ?? [];
        $map = [];
        foreach ($rows as $row) {
            if (! empty($row['installed']) && isset($row['tool'])) {
                $map[(string) $row['tool']][] = $row;
            }
        }

        return $map;
    }
}
