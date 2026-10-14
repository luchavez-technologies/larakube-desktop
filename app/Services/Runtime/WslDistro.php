<?php

namespace App\Services\Runtime;

/**
 * The WSL distro LaraKube Desktop owns on Windows, named for what it is (Ubuntu with our tools) and the way Docker Desktop owns `docker-desktop`: its name,
 * the user commands run as, and how its files and Windows files are written in each other's terms.
 */
final class WslDistro
{
    public const string NAME = 'larakube-ubuntu';

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
            $rest = str_replace('\\', '/', $drive[2]);
            $rest = trim($rest, '/');

            return '/mnt/'.strtolower($drive[1]).($rest !== '' ? '/'.$rest : '');
        }

        return $path;
    }

    /**
     * Whether a given path (Windows or Linux format) points to an operating system system directory
     * where user project creation or registration must be disallowed.
     */
    public static function isSystemDirectory(string $path): bool
    {
        $linux = self::toLinux($path);
        $clean = strtolower(rtrim($linux, '/'));

        // Windows system directories (under /mnt/<drive>/...)
        if (preg_match('#^/mnt/[a-z]/(?:windows|program files|program files \(x86\)|programdata|system volume information|\$recycle\.bin)(?:/.*)?$#i', $clean) === 1) {
            return true;
        }

        // Bare drive roots e.g. /mnt/c or /mnt/c/
        if (preg_match('#^/mnt/[a-z]$#i', $clean) === 1) {
            return true;
        }

        // Linux OS system directories
        if (preg_match('#^/(?:bin|boot|dev|etc|lib|lib64|lost\+found|proc|root|run|sbin|sys|tmp|usr|var)(?:/.*)?$#', $clean) === 1) {
            return true;
        }

        return false;
    }

    public static function toWindows(string $path, string $distro = self::NAME): string
    {
        if (preg_match('#^/mnt/([a-zA-Z])(?:/(.*))?$#', $path, $drive) === 1) {
            $rest = isset($drive[2]) ? str_replace('/', '\\', $drive[2]) : '';

            return strtoupper($drive[1]).':\\'.$rest;
        }

        if (str_starts_with($path, '/')) {
            return self::unc($path, $distro);
        }

        return $path;
    }

    private static function mnt(string $path): string
    {
        return str_replace('\\', '/', $path);
    }
}
