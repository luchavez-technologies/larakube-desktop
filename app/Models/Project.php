<?php

namespace App\Models;

use App\Services\LaraKube\ToolLocator;
use App\Services\Runtime\WslDistro;
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

    /**
     * Resolves the project's folder on the host operating system.
     * On Windows, transforms internal WSL Linux paths (/home/larakube/...) to accessible UNC paths (\\wsl.localhost\...).
     */
    public function hostPath(): string
    {
        if (app(ToolLocator::class)->isWindows()) {
            return WslDistro::toWindows($this->path);
        }

        return $this->path;
    }

    public function existsOnHost(): bool
    {
        return is_dir($this->hostPath());
    }
}
