<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Display metadata (currently just a color) for a project group, keyed by
 * the free-text name used on Project::group. Grouping itself is still a
 * string match on Project::group; this table only decorates it.
 *
 * @property int $id
 * @property string $name
 * @property string|null $color
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
    ];
}
