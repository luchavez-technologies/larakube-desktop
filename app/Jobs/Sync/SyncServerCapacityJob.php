<?php

namespace App\Jobs\Sync;

use App\Enums\ServerDataScope;
use App\Models\Server;
use App\Services\LaraKube\ClusterStatus;
use Throwable;

/**
 * Queries ClusterStatus::capacity() for a ready server in the background and
 * mirrors `capacity_data` (node headroom + System/Platform/Apps/Free breakdown)
 * into the servers table.
 */
class SyncServerCapacityJob extends ServerSyncJob
{
    public const FRESH_SECONDS = 300;

    public function __construct(int $serverId)
    {
        parent::__construct($serverId);
        $this->onQueue('sync');
    }

    public function scope(): ServerDataScope
    {
        return ServerDataScope::Capacity;
    }

    public function handle(ClusterStatus $status): void
    {
        $server = Server::find($this->serverId);

        if ($server === null || $server->context === null || $server->status !== 'ready') {
            return;
        }

        if (Server::isStackLocal([
            'name' => $server->name,
            'provider' => $server->provider,
            'kind' => $server->kind,
            'ip' => $server->ip,
            'context' => $server->context,
            'account' => $server->account,
            'projectId' => $server->cloud_project_id,
            'status' => $server->status,
        ])) {
            return;
        }

        try {
            $server->update(['capacity_sync_status' => 'syncing']);

            $result = $status->capacity($server->context);

            if ($result === null) {
                $server->update([
                    'capacity_sync_status' => 'error',
                    'capacity_last_sync_error' => 'Could not read cluster capacity.',
                ]);

                return;
            }

            $server->update([
                'capacity_data' => $result,
                'capacity_sync_status' => 'fresh',
                'capacity_last_synced_at' => now(),
                'capacity_last_sync_error' => null,
            ]);
        } catch (Throwable $e) {
            $server->update([
                'capacity_sync_status' => 'error',
                'capacity_last_sync_error' => $e->getMessage(),
            ]);
        }
    }
}
