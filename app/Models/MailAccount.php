<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One mailbox on a server, mirrored from `larakube mail:accounts --json` by
 * SyncMailJob. Freshness is tracked on the owning mail ClusterTool row, not
 * per account, since all mail data syncs as one atomic batch.
 *
 * @property int $id
 * @property int $server_id
 * @property int|null $cluster_tool_id
 * @property int|null $mail_domain_id
 * @property string $email
 * @property string|null $name
 * @property string|null $role
 * @property int|null $quota_bytes
 * @property int|null $used_bytes
 * @property array<string, mixed>|null $data
 * @property Server $server
 * @property MailDomain|null $domain
 */
class MailAccount extends Model
{
    protected $fillable = [
        'server_id',
        'cluster_tool_id',
        'mail_domain_id',
        'email',
        'name',
        'role',
        'quota_bytes',
        'used_bytes',
        'data',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'data' => 'array',
        ];
    }

    /**
     * @return BelongsTo<Server, $this>
     */
    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    /**
     * @return BelongsTo<ClusterTool, $this>
     */
    public function clusterTool(): BelongsTo
    {
        return $this->belongsTo(ClusterTool::class);
    }

    /**
     * @return BelongsTo<MailDomain, $this>
     */
    public function domain(): BelongsTo
    {
        return $this->belongsTo(MailDomain::class, 'mail_domain_id');
    }

    /**
     * The shape the Mail page's AccountRow type expects, matching what
     * `mail:accounts --json` itself returns.
     *
     * @return array{email: string, name: string, role: string, quota: string, quotaBytes: ?int, used: string, usedBytes: ?int}
     */
    public function toAccountArray(): array
    {
        $data = $this->data ?? [];

        return [
            'email' => $this->email,
            'name' => $this->name ?? (string) ($data['name'] ?? ''),
            'role' => $this->role ?? (string) ($data['role'] ?? ''),
            'quota' => (string) ($data['quota'] ?? ''),
            'quotaBytes' => $this->quota_bytes,
            'used' => (string) ($data['used'] ?? ''),
            'usedBytes' => $this->used_bytes,
        ];
    }
}
