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
 * graphical `pkexec` prompt asks for one; on native macOS `osascript`'s "do shell
 * script ... with administrator privileges" asks for one the same way.
 */
class Elevation
{
    public const SUDOERS_FILE = '/etc/sudoers.d/larakube-desktop-setup';

    public function __construct(private ?string $user = null, private ?string $distro = null, private ?bool $windows = null, private ?bool $darwin = null) {}

    /** On Windows the commands run in the larakube-ubuntu distro, whose user already has passwordless sudo, so there is nothing to grant. */
    private function onWindows(): bool
    {
        return $this->windows ?? PHP_OS_FAMILY === 'Windows';
    }

    private function onDarwin(): bool
    {
        return $this->darwin ?? PHP_OS_FAMILY === 'Darwin';
    }

    /** How root can be reached from here without a terminal, or null when it cannot. */
    public function method(): ?string
    {
        if ($this->onWindows()) {
            return 'distro';
        }

        if ($this->distro() !== '' && $this->commandExists('wsl.exe')) {
            return 'wsl';
        }

        if ($this->onDarwin() && $this->commandExists('osascript')) {
            return 'osascript';
        }

        if (PHP_OS_FAMILY === 'Linux' && $this->distro() === '' && $this->commandExists('pkexec')) {
            return 'pkexec';
        }

        return null;
    }

    public function grant(): bool
    {
        if ($this->onWindows()) {
            return true;
        }

        $user = $this->user();

        if ($user === null) {
            return false;
        }

        return $this->asRoot(['sh', '-c', 'printf "%s\n" '.escapeshellarg("{$user} ALL=(ALL) NOPASSWD:ALL").' > '.self::SUDOERS_FILE.' && chmod 440 '.self::SUDOERS_FILE]);
    }

    public function revoke(): bool
    {
        if ($this->onWindows()) {
            return true;
        }

        return $this->asRoot(['rm', '-f', self::SUDOERS_FILE]);
    }

    /** @param  list<string>  $command */
    private function asRoot(array $command): bool
    {
        if ($this->method() === 'osascript') {
            return $this->runViaOsascript($command);
        }

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

    /**
     * `do shell script ... with administrator privileges` is macOS's native
     * equivalent of `pkexec`: it shows the same GUI credential prompt as any
     * other admin-rights request, without needing a terminal attached. The
     * command is handed to `/bin/sh -c` inside that script, so each argument
     * is shell-quoted first and the resulting string is then escaped for
     * AppleScript's own double-quoted literal (backslash and `"`).
     *
     * @param  list<string>  $command
     */
    private function runViaOsascript(array $command): bool
    {
        $shellCommand = implode(' ', array_map('escapeshellarg', $command));
        $appleScriptLiteral = str_replace(['\\', '"'], ['\\\\', '\\"'], $shellCommand);
        $script = 'do shell script "'.$appleScriptLiteral.'" with administrator privileges';

        return Process::timeout(120)->run(['osascript', '-e', $script])->successful();
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
