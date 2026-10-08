<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
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
 * @property string|null $ip
 * @property string|null $context
 * @property string|null $ssh_key
 * @property list<string>|null $bindings
 * @property string|null $account
 * @property string|null $cloud_project_id
 * @property string $status
 * @property string $sync_status
 * @property Carbon|null $last_synced_at
 * @property string|null $last_sync_error
 */
class Server extends Model
{
    protected $fillable = [
        'name',
        'role',
        'provider',
        'kind',
        'region',
        'ip',
        'context',
        'ssh_key',
        'bindings',
        'account',
        'cloud_project_id',
        'status',
        'sync_status',
        'last_synced_at',
        'last_sync_error',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'bindings' => 'array',
            'last_synced_at' => 'datetime',
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

    /** The cluster tool row for Stalwart mail, under either slug the CLI has used. */
    public function mailTool(): ?ClusterTool
    {
        return $this->clusterTools()->whereIn('tool', ['mail', 'stalwart'])->first();
    }

    public function isFresh(): bool
    {
        return $this->sync_status === 'fresh';
    }

    /**
     * Keeps this server's identity fields in step with a live StackCatalog
     * row a controller already fetched — not a full sync (no Activity, no
     * freshness stamp), just making sure the row exists and agrees with the
     * live truth before ToolCatalog/MailStatus look it up by context.
     *
     * @param  array{name: string, provider: string, kind: string, region: ?string, ip: ?string, context: ?string, sshKey?: ?string, bindings?: list<string>, account: ?string, projectId: ?string, status: string, role?: string}  $stack
     */
    public static function syncFromStack(array $stack): self
    {
        return self::updateOrCreate(['name' => $stack['name']], [
            'role' => $stack['role'] ?? 'deploy',
            'provider' => $stack['provider'],
            'kind' => $stack['kind'],
            'region' => $stack['region'] ?? null,
            'ip' => $stack['ip'] ?? null,
            'context' => $stack['context'] ?? null,
            'ssh_key' => $stack['sshKey'] ?? null,
            'bindings' => $stack['bindings'] ?? null,
            'account' => $stack['account'] ?? null,
            'cloud_project_id' => $stack['projectId'] ?? null,
            'status' => $stack['status'],
        ]);
    }
}
