<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One mail domain on a server, mirrored from `larakube mail:domains --json`
 * by SyncMailJob.
 *
 * @property int $id
 * @property int $server_id
 * @property int|null $cluster_tool_id
 * @property string $name
 * @property int $accounts_count
 * @property Server $server
 */
class MailDomain extends Model
{
    protected $fillable = [
        'server_id',
        'cluster_tool_id',
        'name',
        'accounts_count',
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
        return $this->belongsTo(ClusterTool::class);
    }

    /**
     * @return HasMany<MailAccount, $this>
     */
    public function accounts(): HasMany
    {
        return $this->hasMany(MailAccount::class);
    }
}
