<?php

namespace App\Services\LaraKube;

use App\Jobs\Sync\SyncServerDomainsJob;
use App\Models\Server;
use App\Models\ServerDomain;

/**
 * A server's connected base domains (ExternalDNS zones, TLS zones, domains
 * extracted from live Ingress hosts), mirrored into the server_domains table
 * by SyncServerDomainsJob. Reads here are instant database reads; a stale or
 * missing picture triggers a background re-sync rather than blocking on the
 * CLI — this is what made the "ExternalDNS Active" badge in Quick Launch
 * take a long time to appear on a cold cache.
 */
class DomainCatalog
{
    public const FRESH_SECONDS = SyncServerDomainsJob::FRESH_SECONDS;

    /**
     * @return list<array{domain: string, externalDns: bool, tls: bool, inUse: bool}>|null
     */
    public function forContext(string $context): ?array
    {
        $server = Server::firstWhere('context', $context);

        if ($server === null) {
            return null;
        }

        $server = $this->syncIfNeeded($server);

        return array_values($server->domains()->get()->map(fn (ServerDomain $row): array => [
            'domain' => $row->domain,
            'externalDns' => $row->external_dns,
            'tls' => $row->tls,
            'inUse' => $row->in_use,
        ])->all());
    }

    /**
     * Whether the domains shown are fresh, syncing, stale or erroring, and
     * when they were last confirmed — for a "syncing in the background" badge.
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
            'status' => $server->domains_sync_status,
            'lastSyncedAt' => $server->domains_last_synced_at?->toAtomString(),
            'error' => $server->domains_last_sync_error,
        ];
    }

    /**
     * A sync already in flight (by this call or a concurrent one) is left
     * alone — treating "syncing" the same as "stale" would cascade duplicate
     * re-verifications, the same trap MailStatus hit before it was fixed.
     */
    private function syncIfNeeded(Server $server): Server
    {
        if ($server->domains_sync_status === 'syncing') {
            return $server;
        }

        if ($server->domains_sync_status !== 'fresh' || ! $this->isFresh($server)) {
            SyncServerDomainsJob::dispatch($server->id);

            return $server->fresh() ?? $server;
        }

        return $server;
    }

    private function isFresh(Server $server): bool
    {
        return $server->domains_last_synced_at !== null
            && $server->domains_last_synced_at->gt(now()->subSeconds(self::FRESH_SECONDS));
    }
}
