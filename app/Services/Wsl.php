<?php

namespace App\Services;

use Illuminate\Support\Facades\Process;

/**
 * Whether this Windows computer can run the LaraKube CLI through the Windows
 * Subsystem for Linux. WSL starts on demand, so "running" is not the question:
 * it must be installed, have a WSL 2 distribution, and answer a command.
 */
class Wsl
{
    public const INSTALL_COMMAND = 'wsl --install -d Ubuntu';

    public function __construct(private ?bool $windows = null) {}

    public function isWindows(): bool
    {
        return $this->windows ?? PHP_OS_FAMILY === 'Windows';
    }

    /**
     * @return array{state: 'ready'|'missing'|'no-distro'|'old-version'|'broken', distro: ?string, version: ?int, message: string, command: ?string}
     */
    public function check(): array
    {
        $status = Process::timeout(30)->run(['wsl.exe', '--status']);

        if (! $status->successful()) {
            return $this->result('missing', null, null, 'Windows Subsystem for Linux (WSL) is not installed. LaraKube Desktop needs it to run.', self::INSTALL_COMMAND);
        }

        $distro = $this->defaultDistro();

        if ($distro === null) {
            return $this->result('no-distro', null, null, 'WSL is installed but has no Linux distribution yet.', self::INSTALL_COMMAND);
        }

        if ($distro['version'] !== 2) {
            return $this->result('old-version', $distro['name'], $distro['version'], "{$distro['name']} uses WSL 1. LaraKube Desktop needs WSL 2.", "wsl --set-version {$distro['name']} 2");
        }

        $answer = Process::timeout(90)->run(['wsl.exe', '-d', $distro['name'], '--', 'echo', 'ok']);

        if (! $answer->successful() || trim($answer->output()) !== 'ok') {
            return $this->result('broken', $distro['name'], 2, "{$distro['name']} did not start. Virtualization may be turned off in your computer's BIOS, or Windows needs a restart after installing WSL.", null);
        }

        return $this->result('ready', $distro['name'], 2, "{$distro['name']} (WSL 2) is ready.", null);
    }

    /**
     * The distribution commands run in: the default one if it is usable,
     * otherwise the first. Docker Desktop's own distributions are skipped.
     *
     * @return array{name: string, version: int}|null
     */
    public function defaultDistro(): ?array
    {
        $listing = Process::timeout(30)->run(['wsl.exe', '--list', '--verbose']);

        if (! $listing->successful()) {
            return null;
        }

        $found = [];

        foreach (preg_split('/\R/', $this->text($listing->output())) ?: [] as $line) {
            if (preg_match('/^\s*(\*)?\s*(\S+)\s+(Running|Stopped|Installing|Uninstalling|Converting)\s+([12])\s*$/i', $line, $match) !== 1) {
                continue;
            }

            if (str_starts_with(strtolower($match[2]), 'docker-desktop')) {
                continue;
            }

            $found[] = ['name' => $match[2], 'version' => (int) $match[4], 'default' => $match[1] === '*'];
        }

        usort($found, fn (array $a, array $b): int => [$b['default'], $b['version']] <=> [$a['default'], $a['version']]);

        return isset($found[0]) ? ['name' => $found[0]['name'], 'version' => $found[0]['version']] : null;
    }

    /** wsl.exe prints UTF-16, which arrives with a NUL after every character. */
    private function text(string $output): string
    {
        if (str_contains($output, "\0")) {
            $output = (string) mb_convert_encoding($output, 'UTF-8', 'UTF-16LE');
        }

        return str_replace("\u{FEFF}", '', $output);
    }

    /**
     * @param  'ready'|'missing'|'no-distro'|'old-version'|'broken'  $state
     * @return array{state: 'ready'|'missing'|'no-distro'|'old-version'|'broken', distro: ?string, version: ?int, message: string, command: ?string}
     */
    private function result(string $state, ?string $distro, ?int $version, string $message, ?string $command): array
    {
        return ['state' => $state, 'distro' => $distro, 'version' => $version, 'message' => $message, 'command' => $command];
    }
}
