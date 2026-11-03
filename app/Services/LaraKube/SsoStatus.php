<?php

namespace App\Services\LaraKube;

use App\Jobs\Sync\SyncClusterToolsJob;
use App\Jobs\Sync\SyncSsoJob;
use App\Models\ClusterTool;
use App\Models\Server;
use App\Models\SsoGrant;

/**
 * Zitadel SSO status, user accounts, and tool authentication wiring,
 * mirrored into the sso ClusterTool row by SyncClusterToolsJob/SyncSsoJob.
 * Reads here are instant database reads; a stale or missing picture
 * triggers a background re-sync (ADR 0004).
 */
class SsoStatus
{
    /**
     * @return array<string, mixed>
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

        /** @var array<string, mixed> $status */
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
     * @return list<array{email: string, tool: string, slug: string, role: string, project: string}>
     */
    public function grants(string $context): array
    {
        $server = Server::firstWhere('context', $context);

        if ($server === null) {
            return [];
        }

        $this->syncIfNeeded($server);

        return array_values($server->ssoGrants()->get()
            ->map(fn (SsoGrant $g): array => [
                'email' => $g->email,
                'tool' => $g->tool,
                'slug' => $g->slug,
                'role' => $g->role,
                'project' => $g->project,
            ])->all());
    }

    /**
     * @return array{status: string, lastSyncedAt: ?string, error: ?string}
     */
    public function syncState(string $context): array
    {
        $tool = Server::firstWhere('context', $context)?->ssoTool();

        if ($tool === null) {
            return ['status' => 'stale', 'lastSyncedAt' => null, 'error' => null];
        }

        return [
            'status' => $tool->sync_status,
            'lastSyncedAt' => $tool->last_synced_at?->toAtomString(),
            'error' => $tool->last_sync_error,
        ];
    }

    /** Marks SSO data stale and dispatches an immediate re-sync — for use after a mutation completes. */
    public function forget(string $context): void
    {
        $server = Server::firstWhere('context', $context);

        if ($server === null) {
            return;
        }

        $tool = $server->ssoTool();

        if ($tool === null) {
            SyncClusterToolsJob::dispatch($server->id);

            return;
        }

        $tool->update(['sync_status' => 'stale']);
        SyncSsoJob::dispatch($server->id);
    }

    private function syncIfNeeded(Server $server): ?ClusterTool
    {
        $tool = $server->ssoTool();

        if ($tool !== null && $tool->sync_status === 'syncing') {
            return $tool;
        }

        if ($tool === null || $tool->sync_status !== 'fresh') {
            SyncClusterToolsJob::dispatch($server->id);

            return $server->ssoTool();
        }

        if (! $tool->installed) {
            return $tool;
        }

        $everSynced = isset($tool->data['status']);
        $fresh = $tool->last_synced_at !== null
            && $tool->last_synced_at->gt(now()->subSeconds(SyncSsoJob::FRESH_SECONDS));

        if (! $everSynced || ! $fresh) {
            SyncSsoJob::dispatch($server->id);

            return $tool->fresh();
        }

        return $tool;
    }
}
