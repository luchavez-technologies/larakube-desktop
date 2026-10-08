<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * One Cluster Tool's install state on one server (n8n, Stalwart, …), mirrored
 * from `larakube tool:list --json --context=…` by SyncClusterToolsJob.
 *
 * @property int $id
 * @property int $server_id
 * @property string $tool
 * @property string|null $host
 * @property string|null $instance
 * @property bool $installed
 * @property bool $multi_instance
 * @property int $position
 * @property array<string, mixed> $data
 * @property string $sync_status
 * @property Carbon|null $last_synced_at
 * @property string|null $last_sync_error
 * @property Server $server
 */
class ClusterTool extends Model
{
    protected $fillable = [
        'server_id',
        'tool',
        'host',
        'instance',
        'installed',
        'multi_instance',
        'position',
        'data',
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
            'installed' => 'boolean',
            'multi_instance' => 'boolean',
            'data' => 'array',
            'last_synced_at' => 'datetime',
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
     * @return HasMany<Activity, $this>
     */
    public function activities(): HasMany
    {
        return $this->hasMany(Activity::class);
    }

    /**
     * The raw CLI row, with the promoted columns layered on top so a
     * consumer sees the same shape `tool:list --json` itself returns.
     *
     * @return array<string, mixed>
     */
    public function toToolArray(): array
    {
        return [
            ...$this->data,
            'tool' => $this->tool,
            'host' => $this->host,
            'instance' => $this->instance,
            'installed' => $this->installed,
            'multiInstance' => $this->multi_instance,
        ];
    }
}
