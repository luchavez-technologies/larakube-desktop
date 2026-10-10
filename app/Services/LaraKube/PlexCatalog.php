<?php

namespace App\Services\LaraKube;

use App\Jobs\Sync\SyncPlexJob;
use App\Models\Server;

/**
 * A server's Plex Commons report (initialized state, service catalog, tool/
 * project/custom tenants), mirrored into the server's plex_data column by
 * SyncPlexJob from ClusterStatus::plex(). Reads here are instant database
 * reads; a stale or missing report triggers a background re-sync rather than
 * blocking the page on `plex:show --json` — on a tool-dense server that call
 * enumerates every installed Cluster Tool's Commons resources and is slow.
 */
class PlexCatalog
{
    public const FRESH_SECONDS = SyncPlexJob::FRESH_SECONDS;

    /**
     * @return array{initialized: bool, context: ?string, services: array<string, mixed>, serviceCatalog: array<string, mixed>, tenants: array{tool: list<array<string, mixed>>, project: list<array<string, mixed>>, custom: list<array<string, mixed>>}}|null
     */
    public function forContext(string $context): ?array
    {
        $server = Server::firstWhere('context', $context);

        if ($server === null) {
            return null;
        }

        $server = $this->syncIfNeeded($server);

        /** @var array{initialized: bool, context: ?string, services: array<string, mixed>, serviceCatalog: array<string, mixed>, tenants: array{tool: list<array<string, mixed>>, project: list<array<string, mixed>>, custom: list<array<string, mixed>>}}|null */
        return $server->plex_data;
    }

    /**
     * Whether the report shown is fresh, syncing, stale or erroring, and when
     * it was last confirmed — for a "syncing in the background" badge.
     *
     * @return array{status: string, lastSyncedAt: ?string, error: ?string}
     */
    public function syncState(string $context): array
    {
        $server = Server::firstWhere('context', $context);

        if ($server === null) {
            return ['status' => 'stale', 'lastSyncedAt' => null, 'error' => null];
        }

        return [
            'status' => $server->plex_sync_status,
            'lastSyncedAt' => $server->plex_last_synced_at?->toAtomString(),
            'error' => $server->plex_last_sync_error,
        ];
    }

    /**
     * Marks the report stale and dispatches an immediate re-sync, busting the
     * underlying ClusterStatus cache first — otherwise the sync job would
     * just read back the same cached `plex:show` result. For the explicit
     * "Refresh" action and for a completed Run that changed Plex Commons.
     */
    public function forget(string $context): void
    {
        app(ClusterStatus::class)->forgetPlex($context);

        $server = Server::firstWhere('context', $context);

        if ($server !== null) {
            $server->update(['plex_sync_status' => 'stale']);
            SyncPlexJob::dispatch($server->id);
        }
    }

    /**
     * A sync already in flight (by this call or a concurrent one) is left
     * alone — treating "syncing" the same as "stale" would cascade duplicate
     * re-verifications, the same trap MailStatus hit before it was fixed.
     */
    private function syncIfNeeded(Server $server): Server
    {
        if ($server->plex_sync_status === 'syncing') {
            return $server;
        }

        if ($server->plex_sync_status !== 'fresh' || ! $this->isFresh($server)) {
            SyncPlexJob::dispatch($server->id);

            return $server->fresh() ?? $server;
        }

        return $server;
    }

    private function isFresh(Server $server): bool
    {
        return $server->plex_last_synced_at !== null
            && $server->plex_last_synced_at->gt(now()->subSeconds(self::FRESH_SECONDS));
    }
}
