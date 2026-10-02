<?php

namespace App\Services;

use Illuminate\Support\Facades\Process;

/**
 * Lets the CLI's `sudo` calls run without a password for the length of one local setup.
 *
 * `larakube setup` installs a cluster through many `sudo` steps, and an app has no
 * terminal to type a password into. For that one run, a file in /etc/sudoers.d allows
 * the signed-in user passwordless sudo, and it is removed when the run ends. Inside WSL
 * the file is written through `wsl.exe -u root`, which needs no password; on Linux a
 * graphical `pkexec` prompt asks for one.
 */
class Elevation
{
    public const SUDOERS_FILE = '/etc/sudoers.d/larakube-desktop-setup';

    public function __construct(private ?string $user = null, private ?string $distro = null) {}

    /** How root can be reached from here without a terminal, or null when it cannot. */
    public function method(): ?string
    {
        if ($this->distro() !== '' && $this->commandExists('wsl.exe')) {
            return 'wsl';
        }

        if (PHP_OS_FAMILY === 'Linux' && $this->distro() === '' && $this->commandExists('pkexec')) {
            return 'pkexec';
        }

        return null;
    }

    public function grant(): bool
    {
        $user = $this->user();

        if ($user === null) {
            return false;
        }

        return $this->asRoot(['sh', '-c', 'printf "%s\n" '.escapeshellarg("{$user} ALL=(ALL) NOPASSWD:ALL").' > '.self::SUDOERS_FILE.' && chmod 440 '.self::SUDOERS_FILE]);
    }

    public function revoke(): bool
    {
        return $this->asRoot(['rm', '-f', self::SUDOERS_FILE]);
    }

    /** @param  list<string>  $command */
    private function asRoot(array $command): bool
    {
        $prefix = match ($this->method()) {
            'wsl' => ['wsl.exe', '-d', $this->distro(), '-u', 'root', '--'],
            'pkexec' => ['pkexec'],
            default => null,
        };

        if ($prefix === null) {
            return false;
        }

        return Process::timeout(120)->run([...$prefix, ...$command])->successful();
    }

    /** The signed-in account, only when it is safe to put in a sudoers file. */
    private function user(): ?string
    {
        $user = $this->user ?? (string) get_current_user();

        return preg_match('/^[a-z_][a-z0-9_-]*$/i', $user) === 1 ? $user : null;
    }

    private function distro(): string
    {
        return $this->distro ?? (string) getenv('WSL_DISTRO_NAME');
    }

    private function commandExists(string $binary): bool
    {
        return trim(Process::run(['sh', '-c', 'command -v '.escapeshellarg($binary)])->output()) !== '';
    }
}
