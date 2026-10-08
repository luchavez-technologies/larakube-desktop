<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One base domain a server knows about — an ExternalDNS zone, a TLS zone, or
 * a domain extracted from a live Ingress host — mirrored from
 * `ClusterStatus::domains()` by SyncServerDomainsJob. Freshness lives on the
 * owning Server (domains_sync_status/domains_last_synced_at), never inferred
 * from row count: a server can legitimately have zero connected domains, and
 * that must not look perpetually unsynced.
 *
 * @property int $id
 * @property int $server_id
 * @property string $domain
 * @property bool $external_dns
 * @property bool $tls
 * @property bool $in_use
 */
class ServerDomain extends Model
{
    protected $fillable = [
        'server_id',
        'domain',
        'external_dns',
        'tls',
        'in_use',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'external_dns' => 'boolean',
            'tls' => 'boolean',
            'in_use' => 'boolean',
        ];
    }

    /**
     * @return BelongsTo<Server, $this>
     */
    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }
}
