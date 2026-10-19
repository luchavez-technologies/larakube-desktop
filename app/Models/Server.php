<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * A server this machine created or discovered, mirrored from
 * `larakube cloud:stacks --json` by SyncServersJob. A dev box is a row with
 * role 'dev' — the same table, not a separate concept.
 *
 * @property int $id
 * @property string $name
 * @property string $role
 * @property string $provider
 * @property string $kind
 * @property string|null $region
 * @property string|null $size
 * @property int|null $cloud_provider_id
 * @property int|null $cloud_region_id
 * @property int|null $cloud_size_id
 * @property string|null $ip
 * @property int $port
 * @property string|null $context
 * @property string|null $ssh_key
 * @property list<string>|null $bindings
 * @property string|null $account
 * @property string|null $cloud_project_id
 * @property string $status
 * @property string $sync_status
 * @property Carbon|null $last_synced_at
 * @property string|null $last_sync_error
 * @property string $domains_sync_status
 * @property Carbon|null $domains_last_synced_at
 * @property string|null $domains_last_sync_error
 * @property string $plex_sync_status
 * @property Carbon|null $plex_last_synced_at
 * @property string|null $plex_last_sync_error
 * @property array<string, mixed>|null $plex_data
 * @property-read CloudProvider|null $cloudProvider
 * @property-read CloudRegion|null $cloudRegion
 * @property-read CloudSize|null $cloudSize
 */
class Server extends Model
{
    protected $fillable = [
        'name',
        'role',
        'provider',
        'kind',
        'region',
        'size',
        'cloud_provider_id',
        'cloud_region_id',
        'cloud_size_id',
        'ip',
        'port',
        'context',
        'ssh_key',
        'bindings',
        'account',
        'cloud_project_id',
        'status',
        'sync_status',
        'last_synced_at',
        'last_sync_error',
        'domains_sync_status',
        'domains_last_synced_at',
        'domains_last_sync_error',
        'plex_sync_status',
        'plex_last_synced_at',
        'plex_last_sync_error',
        'plex_data',
    ];

    protected static function booted(): void
    {
        static::saving(function (Server $server): void {
            if ($server->provider && ! in_array($server->provider, ['custom', 'existing', 'local'], true)) {
                $server->cloud_provider_id ??= CloudProvider::where('slug', $server->provider)->value('id');

                if ($server->cloud_provider_id && $server->region && ! $server->cloud_region_id) {
                    $server->cloud_region_id = CloudRegion::where('cloud_provider_id', $server->cloud_provider_id)
                        ->where('slug', $server->region)
                        ->value('id');
                }

                if ($server->cloud_provider_id && $server->size && ! $server->cloud_size_id) {
                    $targetKind = in_array($server->kind, ['managed', 'cluster'], true) ? 'managed' : 'vps';
                    $server->cloud_size_id = CloudSize::where('cloud_provider_id', $server->cloud_provider_id)
                        ->where('slug', $server->size)
                        ->whereIn('target_kind', [$targetKind, 'both'])
                        ->value('id')
                        ?? CloudSize::where('cloud_provider_id', $server->cloud_provider_id)
                            ->where('slug', $server->size)
                            ->value('id');
                }
            }
        });
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'port' => 'integer',
            'bindings' => 'array',
            'last_synced_at' => 'datetime',
            'domains_last_synced_at' => 'datetime',
            'plex_last_synced_at' => 'datetime',
            'plex_data' => 'array',
        ];
    }

    /**
     * @return HasMany<ClusterTool, $this>
     */
    public function clusterTools(): HasMany
    {
        return $this->hasMany(ClusterTool::class);
    }

    /**
     * @return HasMany<ServerDomain, $this>
     */
    public function domains(): HasMany
    {
        return $this->hasMany(ServerDomain::class);
    }

    /**
     * @return HasMany<Activity, $this>
     */
    public function activities(): HasMany
    {
        return $this->hasMany(Activity::class);
    }

    /**
     * @return HasMany<MailAccount, $this>
     */
    public function mailAccounts(): HasMany
    {
        return $this->hasMany(MailAccount::class);
    }

    /**
     * @return HasMany<MailDomain, $this>
     */
    public function mailDomains(): HasMany
    {
        return $this->hasMany(MailDomain::class);
    }

    /**
     * @return BelongsTo<CloudProvider, $this>
     */
    public function cloudProvider(): BelongsTo
    {
        return $this->belongsTo(CloudProvider::class, 'cloud_provider_id');
    }

    /**
     * @return BelongsTo<CloudRegion, $this>
     */
    public function cloudRegion(): BelongsTo
    {
        return $this->belongsTo(CloudRegion::class, 'cloud_region_id');
    }

    /**
     * @return BelongsTo<CloudSize, $this>
     */
    public function cloudSize(): BelongsTo
    {
        return $this->belongsTo(CloudSize::class, 'cloud_size_id');
    }

    /** The cluster tool row for Stalwart mail, under either slug the CLI has used. */
    public function mailTool(): ?ClusterTool
    {
        return $this->clusterTools()->whereIn('tool', ['mail', 'stalwart'])->first();
    }

    /** The cluster tool row for oCIS drive, under either slug the CLI has used. */
    public function driveTool(): ?ClusterTool
    {
        return $this->clusterTools()->whereIn('tool', ['drive', 'ocis'])->first();
    }

    public function isFresh(): bool
    {
        return $this->sync_status === 'fresh';
    }

    public function isLocal(): bool
    {
        return self::isStackLocal([
            'provider' => $this->provider,
            'region' => $this->region,
            'ip' => $this->ip,
        ]);
    }

    /**
     * @param  array{provider?: ?string, region?: ?string, ip?: ?string}  $stack
     */
    public static function isStackLocal(array $stack): bool
    {
        $provider = strtolower((string) ($stack['provider'] ?? ''));
        $localProviders = ['local', 'k3d', 'kind', 'orbstack', 'minikube', 'docker'];

        if (in_array($provider, $localProviders, true)) {
            return true;
        }

        if (($stack['region'] ?? '') === 'local') {
            return true;
        }

        $ip = $stack['ip'] ?? null;
        if ($ip && in_array($ip, ['127.0.0.1', 'localhost', 'local'], true)) {
            return true;
        }

        return false;
    }

    /**
     * Keeps this server's identity fields in step with a live StackCatalog
     * row a controller already fetched — not a full sync (no Activity, no
     * freshness stamp), just making sure the row exists and agrees with the
     * live truth before ToolCatalog/MailStatus look it up by context.
     *
     * @param  array{name: string, provider: string, kind: string, region: ?string, ip: ?string, port?: ?int, sshPort?: ?int, context: ?string, sshKey?: ?string, bindings?: list<string>, account: ?string, projectId: ?string, status: string, role?: string}  $stack
     */
    public static function syncFromStack(array $stack): self
    {
        return self::updateOrCreate(['name' => $stack['name']], [
            'role' => $stack['role'] ?? 'deploy',
            'provider' => $stack['provider'],
            'kind' => $stack['kind'],
            'region' => $stack['region'] ?? null,
            'ip' => $stack['ip'] ?? null,
            'port' => (int) ($stack['port'] ?? $stack['sshPort'] ?? 22),
            'context' => $stack['context'] ?? null,
            'ssh_key' => $stack['sshKey'] ?? null,
            'bindings' => $stack['bindings'] ?? null,
            'account' => $stack['account'] ?? null,
            'cloud_project_id' => $stack['projectId'] ?? null,
            'status' => $stack['status'],
        ]);
    }
}
