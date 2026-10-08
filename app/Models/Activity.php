<?php

namespace App\Models;

use App\Enums\ActivityType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A meaningful, server-scoped event: a first-ever sync, a sync failing or
 * recovering, or a real mutation (tool installed/removed, mailbox
 * created/deleted, …). Deliberately NOT written for every routine
 * background sync — see ActivityType and RecordRunOutput.
 *
 * @property int $id
 * @property int $server_id
 * @property int|null $cluster_tool_id
 * @property int|null $run_id
 * @property ActivityType $type
 * @property string $title
 * @property string|null $description
 * @property array<string, mixed>|null $meta
 * @property Carbon $occurred_at
 * @property Server $server
 * @property ClusterTool|null $clusterTool
 * @property Run|null $run
 */
class Activity extends Model
{
    protected $fillable = [
        'server_id',
        'cluster_tool_id',
        'run_id',
        'type',
        'title',
        'description',
        'meta',
        'occurred_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'type' => ActivityType::class,
            'meta' => 'array',
            'occurred_at' => 'datetime',
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
     * @return BelongsTo<Run, $this>
     */
    public function run(): BelongsTo
    {
        return $this->belongsTo(Run::class);
    }
}
