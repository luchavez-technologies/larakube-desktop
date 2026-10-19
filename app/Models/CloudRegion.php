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
 * @property bool $is_recommended
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read CloudProvider $provider
 */
class CloudRegion extends Model
{
    protected $fillable = [
        'cloud_provider_id',
        'slug',
        'label',
        'is_recommended',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
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
        return $this->hasMany(Server::class, 'cloud_region_id');
    }
}
