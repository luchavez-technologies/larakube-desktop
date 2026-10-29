<?php

namespace App\Services;

use App\Services\Runtime\WslDistro;
use Illuminate\Support\Facades\Process;

/**
 * Opens a new, visible terminal window running a command — "Open in
 * Terminal" on a server page (ssh, or k9s scoped to that server's kubectl
 * context). The command is whatever a person would type themselves; a fresh
 * terminal gets its own login shell, so this never needs to resolve a
 * binary's path itself the way ToolLocator does for LaraKube Desktop's own
 * background processes.
 */
class TerminalLauncher
{
    private ?string $failure = null;

    public function __construct(private ?bool $windows = null, private ?bool $darwin = null, private ?bool $wslFeatureEnabled = null) {}

    public function isWindows(): bool
    {
        return $this->windows ?? PHP_OS_FAMILY === 'Windows';
    }

    public function isDarwin(): bool
    {
        return $this->darwin ?? PHP_OS_FAMILY === 'Darwin';
    }

    /** Why open() last returned false, for a friendlier error than "Could not open a terminal." */
    public function lastFailure(): ?string
    {
        return $this->failure;
    }

    public function open(string $command): bool
    {
        $this->failure = null;

        return match (true) {
            $this->isDarwin() => $this->openDarwin($command),
            $this->isWindows() => $this->openWindows($command),
            default => $this->openLinux($command),
        };
    }

    private function openDarwin(string $command): bool
    {
        $script = 'tell application "Terminal" to do script '.$this->appleScriptQuote($command);

        return Process::run(['osascript', '-e', $script, '-e', 'tell application "Terminal" to activate'])->successful();
    }

    /**
     * Opens `wsl.exe -d larakube-ubuntu` in Windows Terminal when present,
     * falling back to a plain console host otherwise.
     *
     * Confirmed live (2026-10-30): wsl.exe, with ANY subcommand or flags,
     * pops Windows's own native "WSL is not installed, press any key to
     * install" console prompt the instant the feature isn't present at all
     * — the same bug class fixed elsewhere in Wsl.php/ToolLocator.php, just
     * reached from this "Open Terminal" button instead of a background
     * sync. The feature check is required here first, same as everywhere
     * else wsl.exe would otherwise be reached automatically.
     */
    private function openWindows(string $command): bool
    {
        if (! ($this->wslFeatureEnabled ??= (new Wsl(windows: true))->featureEnabled())) {
            $this->failure = 'Windows Subsystem for Linux (WSL) is not turned on.';

            return false;
        }

        $inner = 'wsl.exe -d '.WslDistro::NAME.' --user '.WslDistro::USER.' -- '.$command;

        if (Process::run(['where', 'wt.exe'])->successful()) {
            return Process::run(['wt.exe', 'cmd', '/k', $inner])->successful();
        }

        return Process::run(['cmd', '/c', 'start', 'cmd', '/k', $inner])->successful();
    }

    /** Best effort: the first terminal emulator found on PATH, none of which this app otherwise depends on. */
    private function openLinux(string $command): bool
    {
        foreach (['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xterm'] as $emulator) {
            if (! Process::run(['which', $emulator])->successful()) {
                continue;
            }

            $args = $emulator === 'xterm' ? ['-e', 'bash', '-lc', $command.'; exec bash'] : ['--', 'bash', '-lc', $command.'; exec bash'];

            return Process::run([$emulator, ...$args])->successful();
        }

        return false;
    }

    private function appleScriptQuote(string $value): string
    {
        return '"'.str_replace(['\\', '"'], ['\\\\', '\\"'], $value).'"';
    }
}
