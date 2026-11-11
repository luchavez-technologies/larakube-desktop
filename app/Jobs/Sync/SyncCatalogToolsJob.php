<?php

namespace App\Jobs\Sync;

use App\Models\CatalogTool;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Process;

/**
 * Syncs the global Cluster Tool & Community Marketplace catalog into `catalog_tools`.
 *
 * Uses `larakube tool:catalog --json` in paginated batches (with `--updated-since`
 * for incremental delta pulls once seeded), falling back gracefully to
 * `larakube tool:list --registry-only --json` for older CLI binaries or offline setups.
 */
class SyncCatalogToolsJob extends SyncJob
{
    public const FRESH_SECONDS = 3600;

    private const CACHE_SYNCED_KEY = 'catalog_tools.last_synced_at';

    private const PER_PAGE = 100;

    public function __construct(public bool $fullRefresh = false) {}

    protected function uniqueKey(): string
    {
        return 'global';
    }

    public function handle(ToolLocator $locator): void
    {
        $cli = $locator->find('larakube');

        if ($cli === null) {
            return;
        }

        $since = null;
        if (! $this->fullRefresh && CatalogTool::exists()) {
            $since = CatalogTool::max('remote_updated_at');
        }

        if ($this->syncFromPaginatedCatalog($locator, $cli, is_string($since) ? $since : null)) {
            Cache::put(self::CACHE_SYNCED_KEY, now()->getTimestamp(), self::FRESH_SECONDS);

            return;
        }

        // Graceful fallback for CLI versions predating `tool:catalog`
        $this->syncFromLegacyRegistry($locator, $cli);
    }

    private function syncFromPaginatedCatalog(ToolLocator $locator, string $cli, ?string $updatedSince): bool
    {
        $page = 1;
        $lastPage = 1;
        $position = 0;

        do {
            $args = [$cli, 'tool:catalog', "--page={$page}", '--per-page='.self::PER_PAGE, '--json', '--no-interaction'];
            if ($updatedSince !== null && $updatedSince !== '') {
                $args[] = "--updated-since={$updatedSince}";
            }

            $isolated = $locator->isolate($args);

            try {
                $result = Process::env($isolated['environment'])->timeout(30)->run($isolated['command']);
            } catch (ProcessTimedOutException) {
                return false;
            }

            if (! $result->successful()) {
                return false;
            }

            $decoded = json_decode(trim($result->output()), true);
            if (! is_array($decoded) || ! is_array($decoded['data'] ?? null)) {
                return false;
            }

            /** @var list<array<string, mixed>> $items */
            $items = array_values(array_filter($decoded['data'], 'is_array'));
            $meta = is_array($decoded['meta'] ?? null) ? $decoded['meta'] : [];
            $lastPage = max(1, (int) ($meta['last_page'] ?? $meta['lastPage'] ?? 1));

            DB::transaction(function () use ($items, &$position): void {
                foreach ($items as $item) {
                    CatalogTool::upsertFromPayload($item, $position++);
                }
            });

            $page++;
        } while ($page <= $lastPage);

        return true;
    }

    private function syncFromLegacyRegistry(ToolLocator $locator, string $cli): void
    {
        $isolated = $locator->isolate([$cli, 'tool:list', '--registry-only', '--json', '--no-interaction']);

        try {
            $result = Process::env($isolated['environment'])->timeout(30)->run($isolated['command']);
        } catch (ProcessTimedOutException) {
            return;
        }

        if (! $result->successful()) {
            return;
        }

        $decoded = json_decode(trim($result->output()), true);
        if (! is_array($decoded)) {
            return;
        }

        $rawItems = array_is_list($decoded)
            ? $decoded
            : (is_array($decoded['tools'] ?? null) ? $decoded['tools'] : null);

        if (! is_array($rawItems)) {
            return;
        }

        /** @var list<array<string, mixed>> $items */
        $items = array_values(array_filter($rawItems, 'is_array'));

        DB::transaction(function () use ($items): void {
            foreach ($items as $position => $item) {
                CatalogTool::upsertFromPayload($item, $position);
            }
        });

        Cache::put(self::CACHE_SYNCED_KEY, now()->getTimestamp(), self::FRESH_SECONDS);
    }
}
