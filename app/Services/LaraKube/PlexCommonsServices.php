<?php

namespace App\Services\LaraKube;

/**
 * Maps plex:show --json's `serviceCatalog` (grouped by category, driven by the
 * CLI's own Database/Cache/Storage/SearchDriver enums — the single source of
 * truth for which engines exist at all) into a shape the Plex page's own
 * services card renders directly. Each active engine's addresses come from the
 * CLI's `endpoints` report (in-cluster and public), its admin UI from the raw
 * `services` map.
 */
class PlexCommonsServices
{
    /** Category keys are driven by the driver-enum classes themselves (stable); only their display copy lives here. */
    private const CATEGORY_LABELS = [
        'database' => 'Database',
        'cache' => 'Cache & Queues',
        'storage' => 'Object Storage',
        'search' => 'Search',
        'render' => 'Render',
    ];

    /**
     * @param  array<string, array{active: ?string, options: array<string, array{label: string, enabled: bool, ready: bool}>}>  $serviceCatalog
     * @param  array<string, mixed>  $rawServices
     * @param  array<string, array{internal?: string, public?: ?string, publicCapable?: bool}>  $endpoints
     * @return array{commons: bool, categories: list<array<string, mixed>>}
     */
    public function describe(array $serviceCatalog, array $rawServices, array $endpoints = []): array
    {
        $categories = [];

        foreach ($serviceCatalog as $key => $entry) {
            $options = [];

            foreach ($entry['options'] as $driver => $option) {
                $options[] = [
                    'driver' => $driver,
                    'label' => $option['label'],
                    'enabled' => $option['enabled'],
                    'ready' => $option['ready'],
                    'details' => $option['enabled'] ? $this->connectionDetails($endpoints[$driver] ?? [], $rawServices[$driver] ?? null) : [],
                    // Object storage with no public address: its file links only work inside the cluster.
                    'needsPublicAddress' => $option['enabled']
                        && ($endpoints[$driver]['publicCapable'] ?? false)
                        && empty($endpoints[$driver]['public']),
                ];
            }

            $categories[] = [
                'key' => $key,
                'label' => self::CATEGORY_LABELS[$key] ?? ucfirst($key),
                'active' => $entry['active'],
                'options' => $options,
            ];
        }

        return ['commons' => true, 'categories' => $categories];
    }

    /**
     * @param  array{internal?: string, public?: ?string, publicCapable?: bool}  $endpoint
     * @param  array<string, mixed>|null  $cfg
     * @return list<array{label: string, value: string, secret: bool}>
     */
    private function connectionDetails(array $endpoint, ?array $cfg): array
    {
        $details = [];

        if (! empty($endpoint['internal'])) {
            $details[] = ['label' => 'Internal', 'value' => (string) $endpoint['internal'], 'secret' => false];
        }
        if (! empty($endpoint['public'])) {
            $details[] = ['label' => 'Public', 'value' => (string) $endpoint['public'], 'secret' => false];
        }
        if (is_array($cfg) && ! empty($cfg['admin_host'])) {
            $details[] = ['label' => 'Admin', 'value' => "https://{$cfg['admin_host']}", 'secret' => false];
        }

        return $details;
    }
}
