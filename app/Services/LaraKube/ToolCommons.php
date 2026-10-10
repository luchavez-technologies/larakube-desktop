<?php

namespace App\Services\LaraKube;

/**
 * What a Cluster Tool holds on the shared Commons, in the shape the project
 * page uses for its backing services, so one card draws both. The CLI names
 * what the instance holds (`tool:list` `commons`); the Commons registry says
 * what each of those is.
 */
class ToolCommons
{
    /**
     * @param  array<string, mixed>  $row  a tool:list row
     * @param  array{initialized: bool, context?: ?string, services: array<string, mixed>, tenants: array{tool?: list<array<string, mixed>>, project?: list<array<string, mixed>>, custom?: list<array<string, mixed>>}}|null  $plex
     * @return array{commons: bool, services: list<array<string, mixed>>}|null null when the tool holds nothing on the Commons
     */
    public function describe(array $row, ?array $plex): ?array
    {
        $names = is_array($row['commons'] ?? null) ? $row['commons'] : [];
        $databases = $this->strings($names['databases'] ?? []);
        $redis = $this->strings($names['redis'] ?? []);
        $buckets = $this->strings($names['buckets'] ?? []);

        if ($databases === [] && $redis === [] && $buckets === []) {
            return null;
        }

        // A Cluster Tool's own Commons tenant always lands in the 'tool'
        // bucket (plex:show --json groups by ClusterTool::forCommonsResource()
        // — exactly what makes a registry entry "a tool's", by definition).
        $tenants = is_array($plex['tenants']['tool'] ?? null) ? $plex['tenants']['tool'] : [];
        $services = [];

        if ($databases !== []) {
            $tenant = $this->tenant($tenants, $databases, 'database');
            $services[] = $this->service('database', 'Database', $tenant['databaseService'] ?? null, array_filter([
                ['label' => 'Database', 'value' => $tenant['database'] ?? $databases[0]],
                isset($tenant['databaseService']) ? ['label' => 'Engine', 'value' => (string) $tenant['databaseService']] : null,
            ]));
        }

        if ($redis !== []) {
            $tenant = $this->tenant($tenants, $redis, null);
            $services[] = $this->service('cache', 'Cache & queues', 'redis', array_filter([
                isset($tenant['redisIndex']) ? ['label' => 'Database index', 'value' => (string) $tenant['redisIndex']] : null,
            ]));
        }

        if ($buckets !== []) {
            $tenant = $this->tenant($tenants, $buckets, 's3Bucket');
            $services[] = $this->service('storage', 'Object storage', null, [['label' => 'Bucket', 'value' => $tenant['s3Bucket'] ?? $buckets[0]]]);
        }

        return ['commons' => true, 'services' => $services];
    }

    /**
     * The registry entry for one of the instance's names, matched by tenant name or by the field that holds it.
     *
     * @param  list<array<string, mixed>>  $tenants
     * @param  list<string>  $names
     * @return array<string, mixed>
     */
    private function tenant(array $tenants, array $names, ?string $field): array
    {
        foreach ($tenants as $tenant) {
            if (in_array($tenant['name'] ?? null, $names, true)) {
                return $tenant;
            }

            if ($field !== null && in_array($tenant[$field] ?? null, $names, true)) {
                return $tenant;
            }
        }

        return [];
    }

    /**
     * @param  array<int, array{label: string, value: string}>  $details
     * @return array<string, mixed>
     */
    private function service(string $kind, string $label, ?string $engine, array $details): array
    {
        return [
            'kind' => $kind,
            'label' => $label,
            'driver' => $engine,
            'name' => $engine === null ? 'Shared' : ucfirst($engine),
            'mode' => 'commons',
            'details' => array_map(fn (array $detail): array => $detail + ['secret' => false], array_values($details)),
        ];
    }

    /**
     * @return list<string>
     */
    private function strings(mixed $values): array
    {
        return is_array($values) ? array_values(array_filter($values, fn (mixed $v): bool => is_string($v) && $v !== '')) : [];
    }
}
