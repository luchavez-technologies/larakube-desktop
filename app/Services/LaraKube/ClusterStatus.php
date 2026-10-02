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
            $rows = $this->json(['external-dns:list', 'production', "--context={$context}", '--json'], 60, wholeOutput: true)
                ?? $this->json(['dns:list', 'production', "--context={$context}", '--json'], 60, wholeOutput: true);

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

    /**
     * Whether the server is backed up, where to, on what schedule, and the
     * latest backup, from `backup:status --json`. Never holds a key or the passphrase.
     *
     * @return array<mixed>|null
     */
    public function backup(string $context): ?array
    {
        return $this->remember("backup:{$context}", function () use ($context): ?array {
            $report = $this->json(['backup:status', 'production', "--context={$context}", '--json'], 180);

            return is_array($report) && ($report['success'] ?? false) === true ? $report : null;
        });
    }

    public function forgetBackup(string $context): void
    {
        Cache::forget("cluster-status:backup:{$context}");
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
     * All known base domains on this server:
     * - Cloudflare zones from ExternalDNS
     * - Cloudflare zones from TLS / Let's Encrypt
     * - Base domains extracted from live Ingresses
     *
     * @return list<array{domain: string, externalDns: bool, tls: bool, inUse: bool}>
     */
    public function domains(string $context): array
    {
        return $this->remember("domains:{$context}", function () use ($context): array {
            $domains = [];

            // 1. ExternalDNS zones
            $dns = $this->dns($context);
            if (is_array($dns)) {
                foreach ($dns as $group) {
                    foreach ($group['zones'] ?? [] as $zone) {
                        $zone = strtolower(trim((string) $zone));
                        if ($zone !== '') {
                            $domains[$zone] ??= [
                                'domain' => $zone,
                                'externalDns' => true,
                                'tls' => false,
                                'inUse' => false,
                            ];
                            $domains[$zone]['externalDns'] = true;
                        }
                    }
                }
            }

            // 2. TLS zones
            $tls = $this->tls($context);
            if (is_array($tls) && isset($tls['zones']) && is_array($tls['zones'])) {
                foreach ($tls['zones'] as $zone) {
                    $zone = strtolower(trim((string) $zone));
                    if ($zone !== '') {
                        $domains[$zone] ??= [
                            'domain' => $zone,
                            'externalDns' => false,
                            'tls' => true,
                            'inUse' => false,
                        ];
                        $domains[$zone]['tls'] = true;
                    }
                }
            }

            // 3. Live Ingress hosts on the cluster
            $cli = $this->locator->find('kubectl');
            if ($cli !== null) {
                $isolated = $this->locator->isolate([$cli, "--context={$context}", 'get', 'ingress', '-A', '-o', 'jsonpath={.items[*].spec.rules[*].host}']);
                $result = Process::env($isolated['environment'])->timeout(15)->run($isolated['command']);
                if ($result->successful() && trim($result->output()) !== '') {
                    $hosts = preg_split('/\s+/', trim($result->output())) ?: [];
                    foreach ($hosts as $host) {
                        $parts = explode('.', strtolower(trim($host)));
                        if (count($parts) >= 2) {
                            $base = count($parts) >= 3 ? implode('.', array_slice($parts, 1)) : implode('.', $parts);
                            $domains[$base] ??= [
                                'domain' => $base,
                                'externalDns' => false,
                                'tls' => false,
                                'inUse' => true,
                            ];
                            $domains[$base]['inUse'] = true;
                        }
                    }
                }
            }

            return array_values($domains);
        }) ?? [];
    }

    public function forgetDomains(string $context): void
    {
        Cache::forget("cluster-status:domains:{$context}");
    }

    /**
     * Check if a domain's A record (or wildcard) points to the target server IP.
     *
     * @return array{matches: bool, resolvedIp: ?string, serverIp: string, isWildcard: bool}
     */
    public function checkDns(string $domain, string $serverIp): array
    {
        $domain = strtolower(trim($domain));
        $resolved = @gethostbyname($domain);
        $wildcardProbe = 'probe-'.substr(md5($domain), 0, 8).".{$domain}";
        $wildcardResolved = @gethostbyname($wildcardProbe);

        $isMatch = ($resolved === $serverIp) || ($wildcardResolved === $serverIp);
        $isWildcard = ($wildcardResolved === $serverIp);

        $activeIp = $isWildcard ? $wildcardResolved : ($resolved !== $domain ? $resolved : null);

        return [
            'matches' => $isMatch,
            'resolvedIp' => $activeIp,
            'serverIp' => $serverIp,
            'isWildcard' => $isWildcard,
        ];
    }

    /**
     * @return array{initialized: bool, services: array<string, mixed>, tenants: array<string, mixed>}|null
     */
    public function plex(string $context): ?array
    {
        return $this->remember("plex:{$context}", function () use ($context): ?array {
            $cli = $this->locator->find('kubectl');

            if ($cli === null) {
                return null;
            }

            $isolated = $this->locator->isolate([$cli, "--context={$context}", 'get', 'configmap', 'plex-commons', '-n', 'larakube-plex', '-o', 'jsonpath={.data.commons\\.json}']);
            $result = Process::env($isolated['environment'])->timeout(15)->run($isolated['command']);

            if (! $result->successful() || trim($result->output()) === '') {
                return [
                    'initialized' => false,
                    'services' => [],
                    'tenants' => [],
                ];
            }

            $spec = json_decode(trim($result->output()), true);

            $regIsolated = $this->locator->isolate([$cli, "--context={$context}", 'get', 'configmap', 'plex-registry', '-n', 'larakube-plex', '-o', 'jsonpath={.data.registry\\.json}']);
            $regResult = Process::env($regIsolated['environment'])->timeout(15)->run($regIsolated['command']);
            $registry = json_decode(trim($regResult->output()), true);

            return [
                'initialized' => true,
                'services' => is_array($spec) && isset($spec['services']) && is_array($spec['services']) ? $spec['services'] : [],
                'tenants' => is_array($registry) && isset($registry['tenants']) && is_array($registry['tenants']) ? $registry['tenants'] : [],
            ];
        });
    }

    /**
     * @return list<array{name: string, person: string, namespace: string, createdAt: ?string}>|null
     */
    public function clusterUsers(string $context): ?array
    {
        return $this->remember("users:{$context}", function () use ($context): ?array {
            $cli = $this->locator->find('kubectl');

            if ($cli === null) {
                return null;
            }

            $isolated = $this->locator->isolate([$cli, "--context={$context}", 'get', 'sa', '-A', '-l', 'larakube.dev/access-user', '-o', 'json']);
            $result = Process::env($isolated['environment'])->timeout(15)->run($isolated['command']);

            if (! $result->successful()) {
                return [];
            }

            $items = json_decode($result->output(), true)['items'] ?? [];
            $users = [];

            if (is_array($items)) {
                foreach ($items as $sa) {
                    $name = $sa['metadata']['name'] ?? '';
                    $person = $sa['metadata']['annotations']['larakube.dev/person'] ?? $name;
                    $ns = $sa['metadata']['namespace'] ?? '';
                    $createdAt = $sa['metadata']['creationTimestamp'] ?? null;

                    $users[] = [
                        'name' => (string) $name,
                        'person' => (string) $person,
                        'namespace' => (string) $ns,
                        'createdAt' => is_string($createdAt) ? $createdAt : null,
                    ];
                }
            }

            return $users;
        });
    }

    public function forgetPlex(string $context): void
    {
        Cache::forget("cluster-status:plex:{$context}");
    }

    public function forgetClusterUsers(string $context): void
    {
        Cache::forget("cluster-status:users:{$context}");
    }

    /**
     * Caches answers only, never a failed lookup.
     *
     * @template T of array<mixed>
     *
     * @param  callable(): (T|null)  $resolve
     * @return T|null
     */
    private function remember(string $key, callable $resolve): ?array
    {
        $key = "cluster-status:{$key}";
        $cached = Cache::get($key);

        if (is_array($cached)) {
            /** @var T $cached */
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
        } else {
            $startArr = strpos($output, '[');
            $startObj = strpos($output, '{');
            if ($startArr !== false && ($startObj === false || $startArr < $startObj)) {
                $endArr = strrpos($output, ']');
                if ($endArr !== false && $endArr >= $startArr) {
                    $output = substr($output, $startArr, $endArr - $startArr + 1);
                }
            } elseif ($startObj !== false) {
                $endObj = strrpos($output, '}');
                if ($endObj !== false && $endObj >= $startObj) {
                    $output = substr($output, $startObj, $endObj - $startObj + 1);
                }
            }
        }

        $decoded = json_decode($output, true);

        return is_array($decoded) ? $decoded : null;
    }
}
