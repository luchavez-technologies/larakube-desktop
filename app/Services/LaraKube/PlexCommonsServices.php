<?php

namespace App\Services\LaraKube;

/**
 * Maps plex:show --json's `serviceCatalog` (grouped by category, driven by the
 * CLI's own Database/Cache/Storage/SearchDriver enums — the single source of
 * truth for which engines exist at all) into a shape the Plex page's own
 * services card renders directly. Connection details for the one active
 * engine per category come from the raw `services` map alongside it.
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
     * @return array{commons: bool, categories: list<array<string, mixed>>}
     */
    public function describe(array $serviceCatalog, array $rawServices): array
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
                    'details' => $option['enabled'] ? $this->connectionDetails($rawServices[$driver] ?? null) : [],
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
     * @param  array<string, mixed>|null  $cfg
     * @return list<array{label: string, value: string, secret: bool}>
     */
    private function connectionDetails(?array $cfg): array
    {
        if ($cfg === null) {
            return [];
        }

        $details = [];

        if (! empty($cfg['host']) && ! empty($cfg['port'])) {
            $details[] = ['label' => 'Internal', 'value' => "{$cfg['host']}:{$cfg['port']}", 'secret' => false];
        }

        foreach (['host' => 'Public', 'console_host' => 'Console', 'admin_host' => 'Admin'] as $field => $label) {
            if (! empty($cfg[$field])) {
                $details[] = ['label' => $label, 'value' => "https://{$cfg[$field]}", 'secret' => false];
            }
        }

        return $details;
    }
}
