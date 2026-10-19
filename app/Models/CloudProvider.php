<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $slug
 * @property string $label
 * @property string $default_region
 * @property string $default_vps_size
 * @property string|null $default_managed_size
 * @property string|null $managed_provider
 * @property string|null $ha_option
 * @property string|null $ha_cost
 * @property string|null $pricing_url
 * @property bool $credentials_ready
 * @property string|null $credentials_hint
 * @property string|null $active_account
 * @property array<string, mixed>|null $accounts
 * @property string $source
 * @property Carbon|null $last_synced_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
class CloudProvider extends Model
{
    protected $fillable = [
        'slug',
        'label',
        'default_region',
        'default_vps_size',
        'default_managed_size',
        'managed_provider',
        'ha_option',
        'ha_cost',
        'pricing_url',
        'credentials_ready',
        'credentials_hint',
        'active_account',
        'accounts',
        'source',
        'last_synced_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'credentials_ready' => 'boolean',
            'accounts' => 'array',
            'last_synced_at' => 'datetime',
        ];
    }

    /**
     * @return HasMany<CloudRegion, $this>
     */
    public function regions(): HasMany
    {
        return $this->hasMany(CloudRegion::class);
    }

    /**
     * @return HasMany<CloudSize, $this>
     */
    public function sizes(): HasMany
    {
        return $this->hasMany(CloudSize::class);
    }

    /**
     * @return HasMany<CloudSize, $this>
     */
    public function vpsSizes(): HasMany
    {
        return $this->sizes()->whereIn('target_kind', ['vps', 'both']);
    }

    /**
     * @return HasMany<CloudSize, $this>
     */
    public function managedSizes(): HasMany
    {
        return $this->sizes()->whereIn('target_kind', ['managed', 'both']);
    }

    /**
     * @return HasMany<Server, $this>
     */
    public function servers(): HasMany
    {
        return $this->hasMany(Server::class);
    }

    /**
     * Formats into the Inertia Provider shape expected by the frontend.
     *
     * @return array<string, mixed>
     */
    public function toInertiaProvider(): array
    {
        return [
            'slug' => $this->slug,
            'label' => $this->label,
            'regions' => $this->regions->map(fn (CloudRegion $r): array => [
                'value' => $r->slug,
                'label' => $r->label,
            ])->values()->all(),
            'defaultRegion' => $this->default_region,
            'vpsSizes' => $this->vpsSizes->map(fn (CloudSize $s): array => [
                'value' => $s->slug,
                'label' => $s->label,
            ])->values()->all(),
            'defaultVpsSize' => $this->default_vps_size,
            'managedSizes' => $this->managedSizes->map(fn (CloudSize $s): array => [
                'value' => $s->slug,
                'label' => $s->label,
            ])->values()->all(),
            'defaultManagedSize' => $this->default_managed_size,
            'managedProvider' => $this->managed_provider,
            'haOption' => $this->ha_option,
            'haCost' => $this->ha_cost,
            'pricing' => [
                'source' => $this->source,
                'asOf' => $this->last_synced_at?->toIso8601String(),
                'currency' => ($firstSize = $this->sizes->first()) instanceof CloudSize ? $firstSize->currency : 'USD',
                'priceIsEstimated' => $this->pricing_url !== null,
                'officialPricingUrl' => $this->pricing_url,
            ],
            'credentials' => [
                'ready' => (bool) $this->credentials_ready,
                'hint' => $this->credentials_hint,
            ],
            'accounts' => $this->accounts ?? [],
            'activeAccount' => $this->active_account,
        ];
    }
}
