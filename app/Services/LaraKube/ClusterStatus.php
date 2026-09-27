<?php

namespace App\Services\LaraKube;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Process;

/**
 * What a server already has for DNS and certificates, asked of the server
 * itself (`dns:list`, `tls:show`) rather than inferred from this app's own
 * history, since either may have been set up from Terminal. Both calls reach
 * out to the cluster and Cloudflare, so answers are cached per context.
 */
class ClusterStatus
{
    public const TTL_SECONDS = 600;

    public function __construct(private ToolLocator $locator) {}

    /**
     * ExternalDNS instances on the server, one per Cloudflare token, each with
     * the zones it manages: [{group, zones, ready}]. Empty when DNS isn't
     * connected; null when unknown.
     *
     * @return array<mixed>|null
     */
    public function dns(string $context): ?array
    {
        return $this->remember("dns:{$context}", function () use ($context): ?array {
            $rows = $this->json(['dns:list', 'production', "--context={$context}", '--json'], 60, wholeOutput: true);

            if ($rows === null || ! array_is_list($rows)) {
                return null;
            }

            $groups = [];
            foreach ($rows as $row) {
                $slug = (string) ($row['slug'] ?? '');
                $groups[$slug] ??= ['group' => $slug, 'zones' => [], 'ready' => true];
                $groups[$slug]['zones'][] = (string) ($row['zone'] ?? '');
                $groups[$slug]['ready'] = $groups[$slug]['ready'] && (bool) ($row['ready'] ?? false);
            }

            return array_values($groups);
        });
    }

    /**
     * How Let's Encrypt certificates are issued there, from `tls:show --json`.
     *
     * @return array<mixed>|null
     */
    public function tls(string $context): ?array
    {
        return $this->remember("tls:{$context}", function () use ($context): ?array {
            $report = $this->json(['tls:show', 'production', "--context={$context}", '--json'], 120);

            return is_array($report) && ($report['success'] ?? false) === true ? $report : null;
        });
    }

    public function forgetDns(string $context): void
    {
        Cache::forget("cluster-status:dns:{$context}");
    }

    public function forgetTls(string $context): void
    {
        Cache::forget("cluster-status:tls:{$context}");
    }

    /**
     * Caches answers only, never a failed lookup.
     *
     * @param  callable(): (array<mixed>|null)  $resolve
     * @return array<mixed>|null
     */
    private function remember(string $key, callable $resolve): ?array
    {
        $key = "cluster-status:{$key}";
        $cached = Cache::get($key);

        if (is_array($cached)) {
            return $cached;
        }

        $value = $resolve();

        if ($value !== null) {
            Cache::put($key, $value, self::TTL_SECONDS);
        }

        return $value;
    }

    /**
     * @param  list<string>  $arguments
     * @return array<mixed>|null
     */
    private function json(array $arguments, int $timeout, bool $wholeOutput = false): ?array
    {
        $cli = $this->locator->find('larakube');

        if ($cli === null) {
            return null;
        }

        set_time_limit($timeout + 30);

        $isolated = $this->locator->isolate([$cli, ...$arguments, '--no-interaction']);
        $result = Process::env($isolated['environment'])->timeout($timeout)->run($isolated['command']);

        if (! $result->successful()) {
            return null;
        }

        $output = trim($result->output());

        if (! $wholeOutput) {
            $lines = preg_split('/\R/', $output) ?: [];
            $output = (string) end($lines);
        }

        $decoded = json_decode($output, true);

        return is_array($decoded) ? $decoded : null;
    }
}
