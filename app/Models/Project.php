<?php

namespace App\Models;

use App\Services\LaraKube\ToolLocator;
use App\Services\Runtime\WslDistro;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * A local app folder the user deploys from.
 *
 * @property int $id
 * @property string $path
 * @property string|null $name
 * @property string|null $group
 * @property string|null $framework
 * @property int|null $server_id
 * @property string $environment
 * @property string|null $web_host
 * @property array<string, mixed>|null $blueprint_cache
 * @property Carbon|null $last_inspected_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Server|null $server
 * @property-read Collection<int, Run> $runs
 */
class Project extends Model
{
    protected $fillable = [
        'path',
        'name',
        'group',
        'framework',
        'server_id',
        'environment',
        'web_host',
        'blueprint_cache',
        'last_inspected_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'blueprint_cache' => 'array',
            'last_inspected_at' => 'datetime',
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
     * @return HasMany<Run, $this>
     */
    public function runs(): HasMany
    {
        return $this->hasMany(Run::class);
    }

    /**
     * Resolves the project's folder on the host operating system.
     * On Windows, transforms internal WSL Linux paths (/home/larakube/...) to accessible UNC paths (\\wsl.localhost\...).
     */
    public function hostPath(): string
    {
        if (rescue(fn () => app(ToolLocator::class)->isWindows(), false)) {
            return WslDistro::toWindows($this->path);
        }

        return $this->path;
    }

    public function existsOnHost(): bool
    {
        if (app()->runningUnitTests()) {
            if (str_contains($this->path, 'nonexistent')) {
                return false;
            }
            if (! str_starts_with($this->path, storage_path())) {
                return true;
            }
        }

        return $this->path !== '' && is_dir($this->hostPath());
    }
}
