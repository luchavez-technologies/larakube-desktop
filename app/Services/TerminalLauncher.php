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
    public function __construct(private ?bool $windows = null, private ?bool $darwin = null) {}

    public function isWindows(): bool
    {
        return $this->windows ?? PHP_OS_FAMILY === 'Windows';
    }

    public function isDarwin(): bool
    {
        return $this->darwin ?? PHP_OS_FAMILY === 'Darwin';
    }

    public function open(string $command): bool
    {
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
     * Unverified on real Windows (no Windows machine in this dev loop) — best
     * effort via the same `wsl.exe -d larakube-ubuntu` invocation the rest of
     * this app already uses (see Wsl::check()), opened in Windows Terminal
     * when present, falling back to a plain console host otherwise.
     */
    private function openWindows(string $command): bool
    {
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
