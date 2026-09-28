<?php

namespace App\Services\LaraKube;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Process;

/**
 * Cluster Tools and their install state on one server, from
 * `larakube tool:list --json --context=…`. That call makes a couple of kubectl
 * round trips per tool (tens of seconds against a remote server), so results
 * are cached per context and dropped whenever an install or removal finishes.
 */
class ToolCatalog
{
    public const TTL_SECONDS = 600;

    public function __construct(private ToolLocator $locator) {}

    /**
     * @return list<array<string, mixed>>|null
     */
    public function forContext(string $context): ?array
    {
        return $this->remember($this->key($context), fn (): ?array => $this->load($context, registryOnly: false));
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
        return $this->remember($this->key($context).':registered', fn (): ?array => $this->load($context, registryOnly: true));
    }

    /**
     * @param  callable(): (list<array<string, mixed>>|null)  $load
     * @return list<array<string, mixed>>|null
     */
    private function remember(string $key, callable $load): ?array
    {
        $cached = Cache::get($key);

        if (is_array($cached) && array_is_list($cached)) {
            /** @var list<array<string, mixed>> $cached */
            return $cached;
        }

        $tools = $load();

        if ($tools !== null) {
            Cache::put($key, $tools, self::TTL_SECONDS);
        }

        return $tools;
    }

    /**
     * One tool row. A tool can run several instances on a server (one per
     * host); $instance picks one, and '' is the default instance.
     *
     * @return array<string, mixed>|null
     */
    public function find(string $context, string $tool, string $instance = ''): ?array
    {
        foreach ($this->forContext($context) ?? [] as $row) {
            if (($row['tool'] ?? null) === $tool && ($row['instance'] ?? '') === $instance) {
                return $row;
            }
        }

        return null;
    }

    /**
     * Only what is already cached, never a slow lookup.
     *
     * @return list<array<string, mixed>>|null
     */
    public function cached(string $context): ?array
    {
        $cached = Cache::get($this->key($context));

        if (! is_array($cached) || ! array_is_list($cached)) {
            return null;
        }

        /** @var list<array<string, mixed>> $cached */
        return $cached;
    }

    public function forget(string $context): void
    {
        Cache::forget($this->key($context));
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
