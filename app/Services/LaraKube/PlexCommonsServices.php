<?php

namespace App\Services\LaraKube;

/**
 * Maps plex:show --json's `services` map into the same {kind, label, driver,
 * name, mode, details} shape ToolCommons::describe() already produces for a
 * Cluster Tool's backing services — so BackingServicesCard (already proven on
 * tools/show.tsx and the project page) renders the Plex Commons page's own
 * services panel for free, instead of a third bespoke shape.
 */
class PlexCommonsServices
{
    private const ENGINES = [
        'postgres' => ['kind' => 'database', 'label' => 'Database', 'name' => 'Postgres'],
        'mysql' => ['kind' => 'database', 'label' => 'Database', 'name' => 'MySQL'],
        'mariadb' => ['kind' => 'database', 'label' => 'Database', 'name' => 'MariaDB'],
        'redis' => ['kind' => 'cache', 'label' => 'Cache & Queues', 'name' => 'Redis'],
        'seaweedfs' => ['kind' => 'storage', 'label' => 'Object Storage', 'name' => 'SeaweedFS'],
        'garage' => ['kind' => 'storage', 'label' => 'Object Storage', 'name' => 'Garage'],
        'minio' => ['kind' => 'storage', 'label' => 'Object Storage', 'name' => 'MinIO'],
        'meilisearch' => ['kind' => 'search', 'label' => 'Search', 'name' => 'Meilisearch'],
    ];

    /**
     * @param  array<string, mixed>  $services
     * @return array{commons: bool, services: list<array<string, mixed>>}
     */
    public function describe(array $services): array
    {
        $rows = [];

        foreach (self::ENGINES as $driver => $meta) {
            $cfg = $services[$driver] ?? null;

            // This Commons never offers this engine at all — not merely
            // disabled — so it has no row, same as ToolCommons skipping a
            // service a tool never claims.
            if (! is_array($cfg)) {
                continue;
            }

            $enabled = (bool) ($cfg['enabled'] ?? false);
            $details = [];

            if ($enabled) {
                if (! empty($cfg['host']) && ! empty($cfg['port'])) {
                    $details[] = ['label' => 'Internal', 'value' => "{$cfg['host']}:{$cfg['port']}", 'secret' => false];
                }

                foreach (['host' => 'Public', 'console_host' => 'Console', 'admin_host' => 'Admin'] as $key => $label) {
                    if (! empty($cfg[$key])) {
                        $details[] = ['label' => $label, 'value' => "https://{$cfg[$key]}", 'secret' => false];
                    }
                }
            }

            $rows[] = [
                'kind' => $meta['kind'],
                'label' => $meta['label'],
                'driver' => $driver,
                'name' => $enabled ? $meta['name'] : null,
                'mode' => $enabled ? 'commons' : 'none',
                'details' => $details,
            ];
        }

        return ['commons' => true, 'services' => $rows];
    }
}
