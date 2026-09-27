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
        $cached = Cache::get($this->key($context));

        if (is_array($cached) && array_is_list($cached)) {
            /** @var list<array<string, mixed>> $cached */
            return $cached;
        }

        $tools = $this->load($context);

        if ($tools !== null) {
            Cache::put($this->key($context), $tools, self::TTL_SECONDS);
        }

        return $tools;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function find(string $context, string $tool): ?array
    {
        foreach ($this->forContext($context) ?? [] as $row) {
            if (($row['tool'] ?? null) === $tool) {
                return $row;
            }
        }

        return null;
    }

    public function forget(string $context): void
    {
        Cache::forget($this->key($context));
    }

    /**
     * @return list<array<string, mixed>>|null
     */
    private function load(string $context): ?array
    {
        $cli = $this->locator->find('larakube');

        if ($cli === null) {
            return null;
        }

        // Longer than PHP's default 30s request limit: a remote cluster alone takes about that long.
        set_time_limit(240);

        $isolated = $this->locator->isolate([$cli, 'tool:list', "--context={$context}", '--json', '--no-interaction']);
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
