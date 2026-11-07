<?php

namespace App\Models;

use App\Services\LaraKube\GlobalSettings;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Display metadata (currently just a color) for a project group, keyed by
 * the free-text name used on Project::group. Grouping itself is still a
 * string match on Project::group; this table only decorates it.
 *
 * @property int $id
 * @property string $name
 * @property string|null $color
 * @property bool $hidden_in_demo
 */
class ProjectGroup extends Model
{
    /** Swatch tokens a group's color may be set to, matched to Tailwind color families already used across Desktop. */
    public const COLORS = [
        'slate',
        'rose',
        'orange',
        'amber',
        'emerald',
        'teal',
        'sky',
        'violet',
        'pink',
    ];

    protected $fillable = [
        'name',
        'color',
        'hidden_in_demo',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'hidden_in_demo' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (ProjectGroup $group): void {
            if (! array_key_exists('hidden_in_demo', $group->getAttributes()) && $group->name !== '') {
                $group->hidden_in_demo = in_array(
                    $group->name,
                    rescue(fn (): array => app(GlobalSettings::class)->demoHiddenProjectGroups(), [], report: false),
                    true,
                );
            }
        });
    }

    /**
     * Scope a query to exclude project groups marked hidden in Demo Mode while Demo Mode is active.
     *
     * @param  Builder<static>  $query
     * @return Builder<static>
     */
    public function scopeVisible(Builder $query): Builder
    {
        if (app(GlobalSettings::class)->demoMode()) {
            $hiddenNames = app(GlobalSettings::class)->demoHiddenProjectGroups();

            return $query->where('hidden_in_demo', false)
                ->when($hiddenNames !== [], fn (Builder $q): Builder => $q->whereNotIn('name', $hiddenNames));
        }

        return $query;
    }
}
