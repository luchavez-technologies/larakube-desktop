<?php

namespace App\Models;

use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ToolLocator;
use App\Services\Runtime\WslDistro;
use Illuminate\Database\Eloquent\Builder;
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
 * @property bool $hidden_in_demo
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
        'hidden_in_demo',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'blueprint_cache' => 'array',
            'last_inspected_at' => 'datetime',
            'hidden_in_demo' => 'boolean',
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

    protected static function booted(): void
    {
        static::creating(function (Project $project): void {
            if (! array_key_exists('hidden_in_demo', $project->getAttributes()) && $project->path !== '') {
                $project->hidden_in_demo = in_array(
                    $project->path,
                    rescue(fn (): array => app(GlobalSettings::class)->demoHiddenProjects(), [], report: false),
                    true,
                );
            }
        });
    }

    /**
     * Scope a query to exclude projects (and projects in a hidden group) marked hidden in Demo Mode while Demo Mode is active.
     *
     * @param  Builder<static>  $query
     * @return Builder<static>
     */
    public function scopeVisible(Builder $query): Builder
    {
        $settings = app(GlobalSettings::class);
        if (! $settings->demoMode()) {
            return $query;
        }

        $hiddenPaths = $settings->demoHiddenProjects();
        $hiddenGroups = $settings->demoHiddenProjectGroups();

        return $query->where('hidden_in_demo', false)
            ->when($hiddenPaths !== [], fn (Builder $q): Builder => $q->whereNotIn('path', $hiddenPaths))
            ->when($hiddenGroups !== [], fn (Builder $q): Builder => $q->where(
                fn (Builder $q2): Builder => $q2->whereNull('group')->orWhereNotIn('group', $hiddenGroups)
            ));
    }
}
