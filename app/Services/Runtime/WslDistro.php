<?php

namespace App\Services\Runtime;

/**
 * The WSL distro LaraKube Desktop owns on Windows, the way Docker Desktop owns `docker-desktop`: its name,
 * the user commands run as, and how its files and Windows files are written in each other's terms.
 */
final class WslDistro
{
    public const string NAME = 'LaraKube';

    public const string USER = 'larakube';

    public const string HOME = '/home/larakube';

    /** A Linux path inside the distro as Windows names it, for Explorer and for reading files from Windows. */
    public static function unc(string $linuxPath, string $distro = self::NAME): string
    {
        return '\\\\wsl.localhost\\'.$distro.str_replace('/', '\\', '/'.ltrim($linuxPath, '/'));
    }

    /**
     * A path as the distro names it: a Windows drive path becomes `/mnt/<drive>/...`, a path through
     * `\\wsl.localhost\<distro>\...` (or `\\wsl$\...`) drops the prefix, and a Linux path is left as it is.
     */
    public static function toLinux(string $path, string $distro = self::NAME): string
    {
        if (preg_match('#^\\\\\\\\(?:wsl\.localhost|wsl\$)\\\\([^\\\\]+)(.*)$#i', $path, $unc) === 1) {
            return $unc[1] === $distro ? (str_replace('\\', '/', $unc[2]) ?: '/') : self::mnt($path);
        }

        if (preg_match('#^([A-Za-z]):[\\\\/]?(.*)$#', $path, $drive) === 1) {
            return '/mnt/'.strtolower($drive[1]).'/'.str_replace('\\', '/', $drive[2]);
        }

        return $path;
    }

    private static function mnt(string $path): string
    {
        return str_replace('\\', '/', $path);
    }
}
