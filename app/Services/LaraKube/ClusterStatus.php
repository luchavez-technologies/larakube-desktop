<?php

namespace App\Services\LaraKube;

use Illuminate\Process\Exceptions\ProcessTimedOutException;
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

    /**
     * Plain-language cluster health — node pressure, OOM kills, pods stuck
     * Pending for lack of room — from `cloud:diagnose --json`. The one check
     * that explains *why* a cluster is unreachable instead of just saying so.
     * Deliberately uncached, unlike dns/tls/backup above: this is read on
     * demand (a server page visit, never polled), there's no external rate
     * limit to protect, and "is this stranded right now" is exactly the kind
     * of answer that must never be minutes stale.
     *
     * @return array<mixed>|null
     */
    public function diagnose(string $context): ?array
    {
        $report = $this->json(['cloud:diagnose', 'production', "--context={$context}", '--json'], 60);

        return is_array($report) && ($report['success'] ?? false) === true ? $report : null;
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
     * {initialized, context, services, tenants: {tool, project, custom}}
     * from `plex:show --json` — the Commons read every OTHER status method
     * here already uses (dns/tls/backup shell to their own show/status
     * command plus --json); this used to bypass the CLI entirely with two
     * raw `kubectl get configmap` reads, duplicating ConfigMap-parsing logic
     * a third time. Null (not a default empty shape) on a genuine failure,
     * so a transient unreachable cluster is never cached as "Commons not
     * initialized" for the next 10 minutes.
     *
     * @return array{initialized: bool, context: ?string, services: array<string, mixed>, serviceCatalog: array<string, mixed>, tenants: array{tool: list<array<string, mixed>>, project: list<array<string, mixed>>, custom: list<array<string, mixed>>}}|null
     */
    public function plex(string $context): ?array
    {
        return $this->remember("plex:{$context}", function () use ($context): ?array {
            return $this->parsePlexReport($this->json(['plex:show', 'production', "--context={$context}", '--json'], 60));
        });
    }

    /**
     * CLI JSON output is untrusted shape-wise (a bug in plex:show, or a
     * version mismatch between an old Desktop build and a newer CLI, could
     * both produce something unexpected) — validated explicitly here instead
     * of trusting is_array($report) and casting, so a malformed report reads
     * as "unknown" (null) rather than crashing a deferred prop or silently
     * passing garbage to ToolCommons::describe().
     *
     * @return array{initialized: bool, context: ?string, services: array<string, mixed>, serviceCatalog: array<string, mixed>, tenants: array{tool: list<array<string, mixed>>, project: list<array<string, mixed>>, custom: list<array<string, mixed>>}}|null
     */
    private function parsePlexReport(mixed $report): ?array
    {
        if (! is_array($report) || ! isset($report['initialized'], $report['services'], $report['tenants']) || ! is_array($report['tenants'])) {
            return null;
        }

        $bucket = function (mixed $value): array {
            if (! is_array($value)) {
                return [];
            }

            /** @var list<array<string, mixed>> */
            return array_values(array_filter($value, 'is_array'));
        };

        return [
            'initialized' => (bool) $report['initialized'],
            'context' => isset($report['context']) ? (string) $report['context'] : null,
            'services' => is_array($report['services']) ? $report['services'] : [],
            'serviceCatalog' => is_array($report['serviceCatalog'] ?? null) ? $report['serviceCatalog'] : [],
            'tenants' => [
                'tool' => $bucket($report['tenants']['tool'] ?? []),
                'project' => $bucket($report['tenants']['project'] ?? []),
                'custom' => $bucket($report['tenants']['custom'] ?? []),
            ],
        ];
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
            if (! is_array($items) || empty($items)) {
                return [];
            }

            $bindingsCmd = $this->locator->isolate([$cli, "--context={$context}", 'get', 'clusterrolebinding,rolebinding', '-A', '-l', 'larakube.dev/access-user', '-o', 'json']);
            $bindingsResult = Process::env($bindingsCmd['environment'])->timeout(15)->run($bindingsCmd['command']);
            $bindingItems = $bindingsResult->successful() ? (json_decode($bindingsResult->output(), true)['items'] ?? []) : [];

            $clusterRolesByUser = [];
            $namespacesByUser = [];

            if (is_array($bindingItems)) {
                foreach ($bindingItems as $b) {
                    $userSa = $b['metadata']['labels']['larakube.dev/access-user'] ?? null;
                    if (! $userSa && ! empty($b['subjects'])) {
                        foreach ($b['subjects'] as $sub) {
                            if (($sub['kind'] ?? '') === 'ServiceAccount') {
                                $userSa = $sub['name'] ?? null;
                                break;
                            }
                        }
                    }
                    if (! $userSa) {
                        continue;
                    }

                    $kind = $b['kind'] ?? '';
                    $roleName = $b['roleRef']['name'] ?? 'edit';

                    if ($kind === 'ClusterRoleBinding') {
                        $clusterRolesByUser[$userSa] = $roleName;
                    } elseif ($kind === 'RoleBinding') {
                        $bNs = $b['metadata']['namespace'] ?? '';
                        if ($bNs !== '') {
                            $namespacesByUser[$userSa][$bNs] = $roleName;
                        }
                    }
                }
            }

            $users = [];

            foreach ($items as $sa) {
                $name = $sa['metadata']['name'] ?? '';
                $person = $sa['metadata']['annotations']['larakube.dev/person'] ?? $name;
                $ns = $sa['metadata']['namespace'] ?? '';
                $createdAt = $sa['metadata']['creationTimestamp'] ?? null;

                $isCluster = isset($clusterRolesByUser[$name]);
                $role = $clusterRolesByUser[$name] ?? null;
                $nsList = array_keys($namespacesByUser[$name] ?? []);

                if (! $isCluster && ! empty($namespacesByUser[$name])) {
                    $role = reset($namespacesByUser[$name]);
                }

                $users[] = [
                    'name' => (string) $name,
                    'person' => (string) $person,
                    'namespace' => (string) $ns,
                    'isCluster' => $isCluster,
                    'role' => is_string($role) ? $role : null,
                    'namespaces' => $nsList,
                    'scope' => $isCluster ? 'cluster' : (empty($nsList) ? 'all' : implode(', ', $nsList)),
                    'createdAt' => is_string($createdAt) ? $createdAt : null,
                ];
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

        // A server that is gone or still starting does not answer: that is "unknown", never an error page.
        try {
            $value = $resolve();
        } catch (ProcessTimedOutException) {
            return null;
        }

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
