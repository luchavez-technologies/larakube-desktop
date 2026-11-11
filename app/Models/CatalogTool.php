<?php

namespace App\Models;

use App\Enums\DatabaseDriver;
use App\Enums\ToolCategory;
use App\Enums\ToolSource;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Shared Cluster App & Marketplace catalog entry synced from LaraKube CLI / Cloud.
 *
 * Unlike `cluster_tools` (which tracks per-server live install state), `catalog_tools`
 * stores one canonical definition per app slug so Desktop UI and MCP can paginate,
 * search, and compute DB compatibility matrices without duplicating hundreds of rows
 * per server.
 *
 * @property int $id
 * @property string $slug
 * @property string $name
 * @property string $brand
 * @property string $tagline
 * @property string|null $icon
 * @property string|null $logo
 * @property string $source
 * @property bool $paid
 * @property int $upvotes_count
 * @property list<string>|null $stack
 * @property list<string>|null $categories
 * @property array<string, mixed>|null $commons_capabilities
 * @property list<array<string, mixed>>|null $init_fields
 * @property bool $supports_no_plex
 * @property bool $multi_instance
 * @property bool $requires_admin_email
 * @property int $position
 * @property Carbon|null $remote_updated_at
 * @property Carbon|null $synced_at
 */
class CatalogTool extends Model
{
    protected $fillable = [
        'slug',
        'name',
        'brand',
        'tagline',
        'icon',
        'logo',
        'source',
        'paid',
        'upvotes_count',
        'stack',
        'categories',
        'commons_capabilities',
        'init_fields',
        'supports_no_plex',
        'multi_instance',
        'requires_admin_email',
        'position',
        'remote_updated_at',
        'synced_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'paid' => 'boolean',
            'upvotes_count' => 'integer',
            'stack' => 'array',
            'categories' => 'array',
            'commons_capabilities' => 'array',
            'init_fields' => 'array',
            'supports_no_plex' => 'boolean',
            'multi_instance' => 'boolean',
            'requires_admin_email' => 'boolean',
            'position' => 'integer',
            'remote_updated_at' => 'datetime',
            'synced_at' => 'datetime',
        ];
    }

    /**
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        $term = trim((string) $term);
        if ($term === '') {
            return $query;
        }

        $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], strtolower($term)).'%';

        return $query->where(function (Builder $q) use ($like): void {
            $q->whereRaw('LOWER(slug) LIKE ?', [$like])
                ->orWhereRaw('LOWER(name) LIKE ?', [$like])
                ->orWhereRaw('LOWER(brand) LIKE ?', [$like])
                ->orWhereRaw('LOWER(tagline) LIKE ?', [$like]);
        });
    }

    /**
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeCategory(Builder $query, ToolCategory|string|null $category): Builder
    {
        $value = $category instanceof ToolCategory ? $category->value : trim((string) $category);
        if ($value === '' || $value === 'all') {
            return $query;
        }

        return $query->whereJsonContains('categories', $value);
    }

    /**
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeSource(Builder $query, ToolSource|string|null $source): Builder
    {
        $value = $source instanceof ToolSource ? $source->value : trim((string) $source);
        if ($value === '' || $value === 'all') {
            return $query;
        }

        return $query->where('source', $value);
    }

    /**
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeCompatibleWithDatabase(Builder $query, DatabaseDriver|string $driver): Builder
    {
        $resolved = $driver instanceof DatabaseDriver ? $driver : DatabaseDriver::fromPlexService($driver);
        if ($resolved === null) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($resolved): void {
            $q->whereJsonContains('commons_capabilities->plexDatabases', $resolved->value)
                ->orWhereJsonContains('commons_capabilities->databases', $resolved->value);
        });
    }

    /**
     * Convert this catalog record into the shared ClusterTool shape expected by Desktop UI and MCP.
     *
     * @return array<string, mixed>
     */
    public function toToolRow(): array
    {
        $caps = is_array($this->commons_capabilities) ? $this->commons_capabilities : [];
        $dbs = array_values(array_map('strval', (array) ($caps['databases'] ?? [])));
        $plexDbs = isset($caps['plexDatabases']) && is_array($caps['plexDatabases'])
            ? array_values(array_map('strval', $caps['plexDatabases']))
            : array_values(array_filter($dbs, fn (string $d): bool => $d !== DatabaseDriver::SQLITE->value));
        $supportsSqlite = array_key_exists('supportsSqlite', $caps)
            ? (bool) $caps['supportsSqlite']
            : in_array(DatabaseDriver::SQLITE->value, $dbs, true);

        return [
            'tool' => $this->slug,
            'instance' => '',
            'icon' => $this->icon ?? '📦',
            'brand' => $this->brand,
            'label' => $this->name,
            'name' => $this->name,
            'tagline' => $this->tagline,
            'logo' => $this->logo,
            'paid' => $this->paid,
            'source' => $this->source,
            'upvotesCount' => $this->upvotes_count,
            'stack' => $this->stack ?? [],
            'categories' => $this->categories ?? [],
            'installed' => false,
            'host' => null,
            'aliases' => [],
            'url' => null,
            'requiresAdminEmail' => $this->requires_admin_email,
            'multiInstance' => $this->multi_instance,
            'supportsNoPlex' => $this->supports_no_plex,
            'commons' => ['databases' => [], 'redis' => [], 'buckets' => []],
            'commonsCapabilities' => [
                'databases' => $dbs,
                'plexDatabases' => $plexDbs,
                'supportsSqlite' => $supportsSqlite,
                'cache' => array_values((array) ($caps['cache'] ?? [])),
                'storage' => array_values((array) ($caps['storage'] ?? [])),
                'auth' => array_values((array) ($caps['auth'] ?? [])),
                'mail' => array_values((array) ($caps['mail'] ?? [])),
            ],
            'initFields' => $this->init_fields ?? [],
        ];
    }

    /**
     * Upsert one catalog entry from CLI JSON (`tool:list` or `tool:catalog`).
     *
     * @param  array<string, mixed>  $row
     */
    public static function upsertFromPayload(array $row, int $position = 0): ?self
    {
        $slug = trim((string) ($row['tool'] ?? $row['slug'] ?? ''));
        if ($slug === '') {
            return null;
        }

        $brand = (string) ($row['brand'] ?? $row['name'] ?? $slug);
        $cleanBrand = (string) preg_replace('/\s*\[[^\]]*\]$/', '', $brand);
        $name = (string) ($row['name'] ?? $cleanBrand);
        $source = (ToolSource::tryFrom((string) ($row['source'] ?? 'official')) ?? ToolSource::OFFICIAL)->value;
        $initFields = is_array($row['initFields'] ?? null) ? array_values($row['initFields']) : [];

        $supportsNoPlex = array_key_exists('supportsNoPlex', $row)
            ? (bool) $row['supportsNoPlex']
            : collect($initFields)->contains(fn (mixed $f): bool => is_array($f) && ($f['key'] ?? null) === 'noPlex');

        $remoteUpdatedAt = null;
        if (is_string($row['remoteUpdatedAt'] ?? null) && $row['remoteUpdatedAt'] !== '') {
            $remoteUpdatedAt = Carbon::parse($row['remoteUpdatedAt']);
        }

        return self::updateOrCreate(
            ['slug' => $slug],
            [
                'name' => $name,
                'brand' => $cleanBrand,
                'tagline' => (string) ($row['tagline'] ?? ''),
                'icon' => is_string($row['icon'] ?? null) ? $row['icon'] : null,
                'logo' => is_string($row['logo'] ?? null) ? $row['logo'] : null,
                'source' => $source,
                'paid' => (bool) ($row['paid'] ?? false),
                'upvotes_count' => (int) ($row['upvotesCount'] ?? 0),
                'stack' => is_array($row['stack'] ?? null) ? array_values($row['stack']) : [],
                'categories' => is_array($row['categories'] ?? null) ? array_values($row['categories']) : [],
                'commons_capabilities' => is_array($row['commonsCapabilities'] ?? null) ? $row['commonsCapabilities'] : null,
                'init_fields' => $initFields,
                'supports_no_plex' => $supportsNoPlex,
                'multi_instance' => (bool) ($row['multiInstance'] ?? true),
                'requires_admin_email' => (bool) ($row['requiresAdminEmail'] ?? false),
                'position' => $position,
                'remote_updated_at' => $remoteUpdatedAt,
                'synced_at' => now(),
            ],
        );
    }
}
