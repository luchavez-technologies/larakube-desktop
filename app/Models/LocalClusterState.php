<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Singleton row mirroring LocalCluster::detect() — kept fresh by
 * SyncLocalClusterJob instead of every page read shelling out to kubectl.
 *
 * @property int $id
 * @property string|null $engine
 * @property string|null $context
 * @property string|null $status
 * @property string|null $tone
 * @property string $sync_status
 * @property Carbon|null $last_synced_at
 * @property string|null $last_sync_error
 * @property array<string, array{replicas: int, readyReplicas: int, deploymentsCount: int}>|null $workloads_data
 * @property string $workloads_sync_status
 * @property Carbon|null $workloads_last_synced_at
 * @property string|null $workloads_last_sync_error
 */
class LocalClusterState extends Model
{
    protected $table = 'local_cluster_state';

    protected $fillable = [
        'engine',
        'context',
        'status',
        'tone',
        'sync_status',
        'last_synced_at',
        'last_sync_error',
        'workloads_data',
        'workloads_sync_status',
        'workloads_last_synced_at',
        'workloads_last_sync_error',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'last_synced_at' => 'datetime',
            'workloads_data' => 'array',
            'workloads_last_synced_at' => 'datetime',
        ];
    }

    public static function current(): self
    {
        return self::query()->firstOrCreate(['id' => 1]);
    }
}
