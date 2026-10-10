<?php

namespace App\Jobs\Sync;

use App\Enums\ActivityType;
use App\Models\Activity;
use App\Models\Server;
use App\Models\ServerDomain;
use App\Services\LaraKube\ClusterStatus;
use Illuminate\Support\Facades\DB;

/**
 * Mirrors ClusterStatus::domains() (ExternalDNS zones, TLS zones, and
 * domains extracted from live Ingress hosts) into the server_domains table
 * for one server. Freshness lives on the Server row itself, not on row
 * count — a server with zero connected domains is a normal, "fresh" state,
 * not an unsynced one.
 */
class SyncServerDomainsJob extends SyncJob
{
    public const FRESH_SECONDS = 1800;

    public function __construct(public int $serverId) {}

    protected function uniqueKey(): string
    {
        return (string) $this->serverId;
    }

    public function handle(ClusterStatus $status): void
    {
        $server = Server::find($this->serverId);

        if ($server === null || $server->context === null) {
            return;
        }

        // Captured before the "syncing" update below overwrites it in-memory
        // (Eloquent's update() mutates the model's own attributes, not just
        // the row) — markError() would otherwise always see "syncing" and
        // never recognise a repeat failure.
        $wasAlreadyErrored = $server->domains_sync_status === 'error';

        // The whole body is guarded, not just the CLI call — a failure in
        // the "syncing" update itself (a schema out of date with the code, a
        // locked database) must still end in a visible, recorded error state
        // rather than an uncaught exception that leaves the row stuck
        // forever and the page polling with nothing to show for it.
        try {
            $server->update(['domains_sync_status' => 'syncing']);

            $rows = $status->domains($server->context);

            DB::transaction(function () use ($server, $rows): void {
                $seenDomains = [];

                foreach ($rows as $row) {
                    $domain = (string) $row['domain'];
                    $seenDomains[] = $domain;

                    ServerDomain::updateOrCreate(
                        ['server_id' => $server->id, 'domain' => $domain],
                        [
                            'external_dns' => $row['externalDns'],
                            'tls' => $row['tls'],
                            'in_use' => $row['inUse'],
                        ],
                    );
                }

                // A domain no longer reported (zone disconnected, Ingress
                // removed) is dropped outright — unlike cluster_tools/mail,
                // there is no history worth keeping for a domain that is
                // simply gone.
                ServerDomain::where('server_id', $server->id)
                    ->whereNotIn('domain', $seenDomains)
                    ->delete();

                $server->update([
                    'domains_sync_status' => 'fresh',
                    'domains_last_synced_at' => now(),
                    'domains_last_sync_error' => null,
                ]);
            });
        } catch (\Throwable $e) {
            $this->markError($server, $e->getMessage(), $wasAlreadyErrored);
        }
    }

    private function markError(Server $server, string $message, bool $alreadyErrored): void
    {
        $server->update(['domains_sync_status' => 'error', 'domains_last_sync_error' => $message]);

        if (! $alreadyErrored) {
            Activity::create([
                'server_id' => $server->id,
                'type' => ActivityType::DomainsSyncFailed,
                'title' => 'Could not check connected domains',
                'description' => $message,
                'occurred_at' => now(),
            ]);
        }
    }
}
