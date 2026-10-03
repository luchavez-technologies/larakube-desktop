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
     * @param  array{initialized: bool, services: array<string, mixed>, tenants: array<string, mixed>}|null  $plex
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

        $tenants = is_array($plex['tenants'] ?? null) ? $plex['tenants'] : [];
        $services = [];

        if ($databases !== []) {
            $tenant = $this->tenant($tenants, $databases, 'db');
            $services[] = $this->service('database', 'Database', $tenant['db_service'] ?? null, array_filter([
                ['label' => 'Database', 'value' => $tenant['db'] ?? $databases[0]],
                isset($tenant['db_service']) ? ['label' => 'Engine', 'value' => (string) $tenant['db_service']] : null,
            ]));
        }

        if ($redis !== []) {
            $tenant = $this->tenant($tenants, $redis, null);
            $services[] = $this->service('cache', 'Cache & queues', 'redis', array_filter([
                isset($tenant['redis_index']) ? ['label' => 'Database index', 'value' => (string) $tenant['redis_index']] : null,
            ]));
        }

        if ($buckets !== []) {
            $tenant = $this->tenant($tenants, $buckets, 's3_bucket');
            $services[] = $this->service('storage', 'Object storage', null, [['label' => 'Bucket', 'value' => $tenant['s3_bucket'] ?? $buckets[0]]]);
        }

        return ['commons' => true, 'services' => $services];
    }

    /**
     * The registry entry for one of the instance's names, matched by tenant id or by the field that holds it.
     *
     * @param  array<string, mixed>  $tenants
     * @param  list<string>  $names
     * @return array<string, mixed>
     */
    private function tenant(array $tenants, array $names, ?string $field): array
    {
        foreach ($names as $name) {
            if (is_array($tenants[$name] ?? null)) {
                return $tenants[$name];
            }
        }

        foreach ($tenants as $tenant) {
            if (is_array($tenant) && $field !== null && in_array($tenant[$field] ?? null, $names, true)) {
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
