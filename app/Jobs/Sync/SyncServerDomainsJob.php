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

        $server->update(['domains_sync_status' => 'syncing']);

        try {
            $rows = $status->domains($server->context);
        } catch (\Throwable $e) {
            $this->markError($server, $e->getMessage());

            return;
        }

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

            // A domain no longer reported (zone disconnected, Ingress removed)
            // is dropped outright — unlike cluster_tools/mail, there is no
            // history worth keeping for a domain that is simply gone.
            ServerDomain::where('server_id', $server->id)
                ->whereNotIn('domain', $seenDomains)
                ->delete();

            $server->update([
                'domains_sync_status' => 'fresh',
                'domains_last_synced_at' => now(),
                'domains_last_sync_error' => null,
            ]);
        });
    }

    private function markError(Server $server, string $message): void
    {
        $alreadyErrored = $server->domains_sync_status === 'error';

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
