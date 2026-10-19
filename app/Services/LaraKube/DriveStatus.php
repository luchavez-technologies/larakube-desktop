<?php

namespace App\Services\LaraKube;

use App\Jobs\Sync\SyncClusterToolsJob;
use App\Jobs\Sync\SyncDriveJob;
use App\Models\ClusterTool;
use App\Models\Server;

/**
 * oCIS Drive status, Collabora Online integration, and web extensions, mirrored
 * into cluster_tools.data by SyncClusterToolsJob/SyncDriveJob. Reads here are
 * instant database reads; stale data triggers background sync.
 */
class DriveStatus
{
    /** @var list<array{id: string, name: string, description: string, version: string, category: string}> */
    public const CURATED_EXTENSIONS = [
        [
            'id' => 'com.github.lukashirt.excalidraw',
            'name' => 'Excalidraw',
            'description' => 'Collaborative virtual whiteboard and sketching tool',
            'version' => 'v0.1.0',
            'category' => 'Diagrams',
        ],
        [
            'id' => 'web-app-draw-io',
            'name' => 'Draw.io',
            'description' => 'Professional flowcharts, network maps, and architecture diagramming (.drawio)',
            'version' => 'v0.2.0',
            'category' => 'Diagrams',
        ],
        [
            'id' => 'com.github.sawjan.3dviewer',
            'name' => '3D Model Viewer',
            'description' => 'Interactive 3D model viewer for STL, OBJ, and glTF assets',
            'version' => 'v0.1.0',
            'category' => 'Media',
        ],
        [
            'id' => 'com.github.owncloud.web-app-dicom-viewer',
            'name' => 'DICOM Viewer',
            'description' => 'Medical radiology and imaging file viewer (.dcm)',
            'version' => 'v1.0.0',
            'category' => 'Specialized',
        ],
        [
            'id' => 'com.github.owncloud.web-extensions.pdf-viewer',
            'name' => 'PDF Viewer',
            'description' => 'In-browser PDF reader, annotations, and page navigator',
            'version' => 'v0.1.0',
            'category' => 'Documents',
        ],
    ];

    public function __construct() {}

    /**
     * Whether oCIS Drive is installed on this server.
     */
    public function isInstalled(string $context): bool
    {
        $server = Server::firstWhere('context', $context);

        if ($server === null) {
            return false;
        }

        $driveTool = $this->syncIfNeeded($server);

        return $driveTool !== null && $driveTool->installed;
    }

    /**
     * Drive connection, admin credentials, storage details, Collabora Office status, and wirings.
     *
     * @return array<string, mixed>|null
     */
    public function serverInfo(string $context): ?array
    {
        $server = Server::firstWhere('context', $context);

        if ($server === null) {
            return null;
        }

        $driveTool = $this->syncIfNeeded($server);

        if ($driveTool === null) {
            return ['installed' => false];
        }

        /** @var array<string, mixed> $info */
        $info = $driveTool->data['driveInfo'] ?? ['installed' => $driveTool->installed];

        // Augment with Collabora Office status and normalize components for UI
        /** @var list<mixed> $rawComponents */
        $rawComponents = is_array($info['components'] ?? null) ? array_values($info['components']) : [];
        $enrichedComponents = [];
        $codeComponent = null;

        foreach ($rawComponents as $comp) {
            if (! is_array($comp)) {
                continue;
            }

            $key = (string) ($comp['key'] ?? '');
            $deployment = (string) ($comp['deployment'] ?? $comp['name'] ?? '');
            $role = (string) ($comp['role'] ?? 'WORKER');
            $name = $deployment !== '' ? $deployment : ($comp['name'] ?? ($key !== '' ? "drive-{$key}" : 'drive-ocis'));

            if ($key === 'code' || str_contains($deployment, 'code') || str_contains($name, 'code')) {
                $codeComponent = $comp;
                $isCodeDeployed = ! empty($comp['deployed']) || ! empty($comp['ready']);
                $isCodeReady = ! empty($comp['ready']);

                if ($isCodeDeployed) {
                    $enrichedComponents[] = [
                        'key' => 'code',
                        'name' => $name,
                        'role' => $role,
                        'ready' => $isCodeReady,
                        'replicas' => (string) ($comp['replicas'] ?? ($isCodeReady ? '1/1' : '0/1')),
                        'restartCount' => (int) ($comp['restartCount'] ?? 0),
                    ];
                }

                continue;
            }

            $isAppReady = (bool) ($comp['ready'] ?? $driveTool->installed);
            $enrichedComponents[] = [
                'key' => $key ?: 'app',
                'name' => $name,
                'role' => $role,
                'ready' => $isAppReady,
                'replicas' => (string) ($comp['replicas'] ?? ($isAppReady ? '1/1' : '0/1')),
                'restartCount' => (int) ($comp['restartCount'] ?? 0),
            ];
        }

        $isOfficeDeployed = $codeComponent !== null && (! empty($codeComponent['deployed']) || ! empty($codeComponent['ready']));
        $isOfficeReady = $codeComponent !== null && ! empty($codeComponent['ready']);

        $host = isset($info['host']) && is_string($info['host']) ? $info['host'] : null;
        $info['office'] = [
            'installed' => $isOfficeDeployed,
            'ready' => $isOfficeReady,
            'host' => $host ? "office.{$host}" : null,
            'url' => $host ? "https://office.{$host}" : null,
        ];
        $info['components'] = $enrichedComponents;

        return $info;
    }

    /**
     * List marketplace catalog extensions with their installed status.
     *
     * @return list<array{id: string, name: string, description: string, version: string, category: string, installed: bool}>
     */
    public function extensions(string $context): array
    {
        $server = Server::firstWhere('context', $context);

        if ($server === null) {
            return [];
        }

        $driveTool = $this->syncIfNeeded($server);
        /** @var list<mixed> $installedList */
        $installedList = is_array($driveTool?->data['extensions'] ?? null) ? array_values($driveTool->data['extensions']) : [];
        $installedIds = [];
        foreach ($installedList as $ext) {
            if (is_array($ext)) {
                if (! empty($ext['installed']) && isset($ext['id']) && is_string($ext['id'])) {
                    $installedIds[] = $ext['id'];
                }
            } elseif (is_string($ext)) {
                $installedIds[] = $ext;
            }
        }

        $result = [];
        $seen = [];

        foreach (self::CURATED_EXTENSIONS as $curated) {
            $cleanShort = str_replace(['web-app-', 'web-extensions-'], '', $curated['id']);
            $noDash = str_replace('-', '', $cleanShort);
            $isInstalled = in_array($curated['id'], $installedIds, true)
                || in_array(basename(str_replace('.', '/', $curated['id'])), $installedIds, true)
                || in_array($cleanShort, $installedIds, true)
                || in_array($noDash, $installedIds, true)
                || in_array(str_replace('web-extensions.', 'web-app-', $curated['id']), $installedIds, true)
                || in_array(str_replace('web-app-', 'web-extensions.', $curated['id']), $installedIds, true);

            $seen[$curated['id']] = true;
            $seen[str_replace('web-extensions.', 'web-app-', $curated['id'])] = true;
            $seen[str_replace('web-app-', 'web-extensions.', $curated['id'])] = true;
            $seen[basename(str_replace('.', '/', $curated['id']))] = true;
            $seen[$cleanShort] = true;
            $seen[$noDash] = true;

            $result[] = [
                ...$curated,
                'installed' => $isInstalled,
            ];
        }

        // Add any additional catalog or installed extensions found on cluster
        foreach ($installedList as $ext) {
            if (is_array($ext) && isset($ext['id']) && is_string($ext['id']) && empty($seen[$ext['id']])) {
                $result[] = [
                    'id' => $ext['id'],
                    'name' => isset($ext['name']) && is_string($ext['name']) ? $ext['name'] : ucfirst($ext['id']),
                    'description' => isset($ext['description']) && is_string($ext['description']) ? $ext['description'] : '',
                    'version' => isset($ext['version']) && is_string($ext['version']) ? $ext['version'] : 'v1.0.0',
                    'category' => 'Custom',
                    'installed' => (bool) ($ext['installed'] ?? false),
                ];
                $seen[$ext['id']] = true;
            }
        }

        return $result;
    }

    /**
     * Sync state for the Drive tool on this server.
     *
     * @return array{status: string, lastSyncedAt: ?string, error: ?string}
     */
    public function syncState(string $context): array
    {
        $driveTool = Server::firstWhere('context', $context)?->driveTool();

        if ($driveTool === null) {
            return ['status' => 'stale', 'lastSyncedAt' => null, 'error' => null];
        }

        return [
            'status' => $driveTool->sync_status,
            'lastSyncedAt' => $driveTool->last_synced_at?->toAtomString(),
            'error' => $driveTool->last_sync_error,
        ];
    }

    private function syncIfNeeded(Server $server): ?ClusterTool
    {
        $driveTool = $server->driveTool();

        if ($driveTool !== null && $driveTool->sync_status === 'syncing') {
            return $driveTool;
        }

        if ($driveTool === null || $driveTool->sync_status !== 'fresh') {
            SyncClusterToolsJob::dispatch($server->id);

            return $server->driveTool();
        }

        if (! $driveTool->installed) {
            return $driveTool;
        }

        $everSynced = isset($driveTool->data['driveInfo']);
        $driveFresh = $driveTool->last_synced_at !== null
            && $driveTool->last_synced_at->gt(now()->subSeconds(SyncDriveJob::FRESH_SECONDS));

        $needsReadiness = false;
        if (isset($driveTool->data['driveInfo']['components']) && is_array($driveTool->data['driveInfo']['components'])) {
            foreach ($driveTool->data['driveInfo']['components'] as $c) {
                if (is_array($c) && ! array_key_exists('ready', $c)) {
                    $needsReadiness = true;
                    break;
                }
            }
        }

        if (! $everSynced || ! $driveFresh || $needsReadiness) {
            SyncDriveJob::dispatch($server->id);

            return $driveTool->fresh();
        }

        return $driveTool;
    }
}
