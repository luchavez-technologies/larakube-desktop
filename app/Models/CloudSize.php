<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $cloud_provider_id
 * @property string $slug
 * @property string $label
 * @property string $target_kind
 * @property int $vcpu
 * @property int $memory_mb
 * @property float|null $monthly_price
 * @property string $currency
 * @property bool $is_recommended
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read CloudProvider $provider
 */
class CloudSize extends Model
{
    protected $fillable = [
        'cloud_provider_id',
        'slug',
        'label',
        'target_kind',
        'vcpu',
        'memory_mb',
        'monthly_price',
        'currency',
        'is_recommended',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'vcpu' => 'integer',
            'memory_mb' => 'integer',
            'monthly_price' => 'float',
            'is_recommended' => 'boolean',
        ];
    }

    /**
     * @return BelongsTo<CloudProvider, $this>
     */
    public function provider(): BelongsTo
    {
        return $this->belongsTo(CloudProvider::class, 'cloud_provider_id');
    }

    /**
     * @return HasMany<Server, $this>
     */
    public function servers(): HasMany
    {
        return $this->hasMany(Server::class, 'cloud_size_id');
    }
}
