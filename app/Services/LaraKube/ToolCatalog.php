<?php

namespace App\Services\LaraKube;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Process;

/**
 * Cluster Tools and their install state on one server, from
 * `larakube tool:list --json --context=…`. That call makes a couple of kubectl
 * round trips per tool (tens of seconds against a remote server), so the last
 * verified list is kept per context and only re-checked once it is older than
 * FRESH_SECONDS, or when an install, a removal or Refresh marks it stale. A
 * stale list is still shown while the new check runs.
 */
class ToolCatalog
{
    public const FRESH_SECONDS = 1800;

    /** How long the registry-only list, used before any verified list exists, is kept. */
    private const REGISTERED_TTL_SECONDS = 600;

    public function __construct(private ToolLocator $locator) {}

    /**
     * @return list<array<string, mixed>>|null
     */
    public function forContext(string $context): ?array
    {
        $last = $this->lastVerified($context);

        if ($last !== null && $this->isFresh($last)) {
            return $last['tools'];
        }

        $tools = $this->load($context, registryOnly: false);

        if ($tools !== null) {
            Cache::forever($this->key($context), ['tools' => $tools, 'checkedAt' => now()->getTimestamp()]);
        }

        return $tools;
    }

    /**
     * The last verified list, however old, and when it was checked (null
     * once marked stale).
     *
     * @return array{tools: list<array<string, mixed>>, checkedAt: int|null}|null
     */
    public function lastVerified(string $context): ?array
    {
        $cached = Cache::get($this->key($context));

        if (! is_array($cached) || ! is_array($cached['tools'] ?? null) || ! array_is_list($cached['tools'])) {
            return null;
        }

        /** @var list<array<string, mixed>> $tools */
        $tools = $cached['tools'];

        return ['tools' => $tools, 'checkedAt' => is_int($cached['checkedAt'] ?? null) ? $cached['checkedAt'] : null];
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
     * draw the page while forContext() verifies against the live cluster.
     * Unverified: a tool installed outside the registry shows as available.
     *
     * @return list<array<string, mixed>>|null
     */
    public function registered(string $context): ?array
    {
        $key = $this->key($context).':registered';
        $cached = Cache::get($key);

        if (is_array($cached) && array_is_list($cached)) {
            /** @var list<array<string, mixed>> $cached */
            return $cached;
        }

        $tools = $this->load($context, registryOnly: true);

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
     * Only what is already cached, never a slow lookup.
     *
     * @return list<array<string, mixed>>|null
     */
    public function cached(string $context): ?array
    {
        return $this->lastVerified($context)['tools'] ?? null;
    }

    /** Marks the verified list stale so the next view re-checks, keeping it to show meanwhile. */
    public function forget(string $context): void
    {
        $last = $this->lastVerified($context);

        if ($last !== null) {
            Cache::forever($this->key($context), ['tools' => $last['tools'], 'checkedAt' => null]);
        }

        Cache::forget($this->key($context).':registered');
    }

    /**
     * @return list<array<string, mixed>>|null
     */
    private function load(string $context, bool $registryOnly): ?array
    {
        $cli = $this->locator->find('larakube');

        if ($cli === null) {
            return null;
        }

        // Longer than PHP's default 30s request limit: a remote cluster alone takes about that long.
        set_time_limit(240);

        $isolated = $this->locator->isolate([$cli, 'tool:list', "--context={$context}", ...($registryOnly ? ['--registry-only'] : []), '--json', '--no-interaction']);
        $result = Process::env($isolated['environment'])->timeout(180)->run($isolated['command']);
        $decoded = json_decode(trim($result->output()), true);

        if (! $result->successful() || ! is_array($decoded) || ! array_is_list($decoded)) {
            return null;
        }

        /** @var list<array<string, mixed>> $decoded */
        return $decoded;
    }

    private function key(string $context): string
    {
        return 'cluster-tools:'.$context;
    }
}
