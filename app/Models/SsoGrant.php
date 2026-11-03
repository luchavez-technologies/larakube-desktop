<?php

namespace App\Models;

use Database\Factories\SsoGrantFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One SSO role grant on a server, mirrored from Zitadel by SyncSsoJob.
 *
 * @property int $id
 * @property int $server_id
 * @property int|null $cluster_tool_id
 * @property string $email
 * @property string $tool
 * @property string $slug
 * @property string $role
 * @property string $project
 * @property Server $server
 * @property ClusterTool|null $clusterTool
 */
class SsoGrant extends Model
{
    /** @use HasFactory<SsoGrantFactory> */
    use HasFactory;

    protected $fillable = [
        'server_id',
        'cluster_tool_id',
        'email',
        'tool',
        'slug',
        'role',
        'project',
    ];

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
        return $this->belongsTo(ClusterTool::class, 'cluster_tool_id');
    }
}
