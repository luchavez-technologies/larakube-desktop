<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A local app folder the user deploys from. Everything else about it (name,
 * framework, host, bound server) is read from its .larakube files on demand,
 * so the CLI and this app never disagree.
 *
 * @property int $id
 * @property string $path
 */
class Project extends Model
{
    protected $fillable = ['path'];
}
