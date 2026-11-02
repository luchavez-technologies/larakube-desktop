<?php

namespace App\Services\LaraKube;

use App\Jobs\Sync\SyncClusterToolsJob;
use App\Jobs\Sync\SyncOpenBaoJob;
use App\Models\ClusterTool;
use App\Models\Server;

/**
 * OpenBao's bootstrap/seal state, static-role rotation wiring, and custom
 * env var counts, mirrored into the openbao ClusterTool row by
 * SyncClusterToolsJob/SyncOpenBaoJob. Reads here are instant database
 * reads; a stale or missing picture triggers a background re-sync (ADR 0004).
 */
class OpenBaoStatus
{
    /**
     * @return array{installed: bool, bootstrapped?: bool, sealed?: ?bool, staticRoles?: list<array{tool: string, instance: string, role: string, rotationPeriod: ?string, wired: bool}>, customEnv?: list<array{tool: string, instance: string, plainCount: int, secretCount: int, vaulted: bool}>}
     */
    public function status(string $context): array
    {
        $server = Server::firstWhere('context', $context);

        if ($server === null) {
            return ['installed' => false];
        }

        $tool = $this->syncIfNeeded($server);

        if ($tool === null || ! $tool->installed) {
            return ['installed' => false];
        }

        /** @var array{installed: bool, bootstrapped?: bool, sealed?: ?bool, staticRoles?: list<array{tool: string, instance: string, role: string, rotationPeriod: ?string, wired: bool}>, customEnv?: list<array{tool: string, instance: string, plainCount: int, secretCount: int, vaulted: bool}>} $status */
        $status = $tool->data['status'] ?? ['installed' => true];

        return $status;
    }

    public function isInstalled(string $context): bool
    {
        $server = Server::firstWhere('context', $context);

        if ($server === null) {
            return false;
        }

        $tool = $this->syncIfNeeded($server);

        return $tool !== null && $tool->installed;
    }

    /**
     * @return array{status: string, lastSyncedAt: ?string, error: ?string}
     */
    public function syncState(string $context): array
    {
        $tool = Server::firstWhere('context', $context)?->openBaoTool();

        if ($tool === null) {
            return ['status' => 'stale', 'lastSyncedAt' => null, 'error' => null];
        }

        return [
            'status' => $tool->sync_status,
            'lastSyncedAt' => $tool->last_synced_at?->toAtomString(),
            'error' => $tool->last_sync_error,
        ];
    }

    /** Marks OpenBao data stale and dispatches an immediate re-sync — for use after a mutation completes. */
    public function forget(string $context): void
    {
        $server = Server::firstWhere('context', $context);

        if ($server === null) {
            return;
        }

        $tool = $server->openBaoTool();

        if ($tool === null) {
            SyncClusterToolsJob::dispatch($server->id);

            return;
        }

        $tool->update(['sync_status' => 'stale']);
        SyncOpenBaoJob::dispatch($server->id);
    }

    private function syncIfNeeded(Server $server): ?ClusterTool
    {
        $tool = $server->openBaoTool();

        if ($tool !== null && $tool->sync_status === 'syncing') {
            return $tool;
        }

        if ($tool === null || $tool->sync_status !== 'fresh') {
            SyncClusterToolsJob::dispatch($server->id);

            return $server->openBaoTool();
        }

        if (! $tool->installed) {
            return $tool;
        }

        $everSynced = isset($tool->data['status']);
        $fresh = $tool->last_synced_at !== null
            && $tool->last_synced_at->gt(now()->subSeconds(SyncOpenBaoJob::FRESH_SECONDS));

        if (! $everSynced || ! $fresh) {
            SyncOpenBaoJob::dispatch($server->id);

            return $tool->fresh();
        }

        return $tool;
    }
}
