<?php

namespace App\Services;

use App\Services\Runtime\WslDistro;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Process;

/**
 * The Windows side of LaraKube Desktop's own WSL distro, `larakube-ubuntu`: whether WSL and the distro are there,
 * and the steps that create it (enable WSL, download the image, import it). Nothing else on the computer is touched;
 * a student's own Ubuntu stays theirs.
 */
class Wsl
{
    public const ENABLE_COMMAND = 'wsl --install --no-distribution';

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
            return $this->result('missing', null, null, 'Windows Subsystem for Linux (WSL) is not turned on yet. LaraKube Desktop needs it to run.', self::ENABLE_COMMAND);
        }

        $distro = $this->distro();

        if ($distro === null) {
            return $this->result('no-distro', null, null, 'LaraKube Desktop has not set up its Linux yet.', null);
        }

        if ($distro['version'] !== 2) {
            return $this->result('old-version', $distro['name'], $distro['version'], "{$distro['name']} uses WSL 1. LaraKube Desktop needs WSL 2.", 'wsl --set-version '.WslDistro::NAME.' 2');
        }

        $answer = Process::timeout(90)->run(['wsl.exe', '-d', WslDistro::NAME, '--user', WslDistro::USER, '--', 'echo', 'ok']);

        if (! $answer->successful() || trim($this->text($answer->output())) !== 'ok') {
            return $this->result('broken', WslDistro::NAME, 2, 'LaraKube Linux did not start. Virtualization may be turned off in your computer\'s BIOS, or Windows needs a restart after turning WSL on.', null);
        }

        return $this->result('ready', WslDistro::NAME, 2, 'LaraKube Linux (WSL 2) is ready.', null);
    }

    /**
     * Turns WSL on without installing a distribution. Windows shows its own administrator prompt, and may ask for a restart.
     */
    public function enable(): bool
    {
        $arguments = implode(',', array_map(fn (string $argument): string => "'{$argument}'", ['--install', '--no-distribution']));

        return Process::timeout(900)->run([
            'powershell.exe', '-NoProfile', '-NonInteractive', '-Command',
            "Start-Process -FilePath wsl.exe -ArgumentList {$arguments} -Verb RunAs -Wait",
        ])->successful();
    }

    /** Where the image is downloaded from; `LARAKUBE_ROOTFS_URL` points at a canary or a mirror. */
    public function imageUrl(): string
    {
        return (string) config('larakube.rootfs_url');
    }

    /** The image's own folder under the app's data, and the one distro disk. */
    public function installDirectory(): string
    {
        $base = (string) (getenv('LOCALAPPDATA') ?: sys_get_temp_dir());

        return $base.DIRECTORY_SEPARATOR.'LaraKube'.DIRECTORY_SEPARATOR.'wsl';
    }

    public function imagePath(): string
    {
        return $this->installDirectory().DIRECTORY_SEPARATOR.'larakube-ubuntu.tar.gz';
    }

    /**
     * Downloads the image and checks it against its published SHA-256 before anything uses it.
     *
     * @return array{ok: bool, message: string}
     */
    public function download(): array
    {
        $directory = $this->installDirectory();

        if (! is_dir($directory) && ! @mkdir($directory, 0777, true) && ! is_dir($directory)) {
            return ['ok' => false, 'message' => "Could not create {$directory}."];
        }

        $expected = $this->expectedChecksum();

        if ($expected === null) {
            return ['ok' => false, 'message' => 'Could not read the image checksum. Check your internet connection and try again.'];
        }

        $path = $this->imagePath();

        if (! is_file($path) || hash_file('sha256', $path) !== $expected) {
            set_time_limit(0);
            $response = Http::timeout(3600)->withOptions(['sink' => $path])->get($this->imageUrl());

            if (! $response->successful()) {
                @unlink($path);

                return ['ok' => false, 'message' => 'The download failed. Check your internet connection and try again.'];
            }
        }

        if (hash_file('sha256', $path) !== $expected) {
            @unlink($path);

            return ['ok' => false, 'message' => 'The downloaded file did not match its checksum, so it was deleted. Try again.'];
        }

        return ['ok' => true, 'message' => 'Downloaded and verified.'];
    }

    /**
     * Imports the downloaded image as the one distro, then restarts it so its systemd and default user settings apply.
     *
     * @return array{ok: bool, message: string}
     */
    public function import(): array
    {
        if (! is_file($this->imagePath())) {
            return ['ok' => false, 'message' => 'The image has not been downloaded yet.'];
        }

        if ($this->distro() === null) {
            $disk = $this->installDirectory().DIRECTORY_SEPARATOR.'disk';

            $imported = Process::timeout(1800)->run(['wsl.exe', '--import', WslDistro::NAME, $disk, $this->imagePath(), '--version', '2']);

            if (! $imported->successful()) {
                return ['ok' => false, 'message' => trim($this->text($imported->errorOutput().$imported->output())) ?: 'Windows could not import the image.'];
            }
        }

        Process::timeout(60)->run(['wsl.exe', '--terminate', WslDistro::NAME]);

        return ['ok' => true, 'message' => 'LaraKube Linux is installed.'];
    }

    /**
     * Deletes LaraKube Desktop's own distro and everything in it. Only ever this one distro by name; another
     * Ubuntu on the computer is never touched. Does nothing when it is already gone.
     *
     * @return array{ok: bool, message: string}
     */
    public function reset(): array
    {
        if ($this->distro() === null) {
            return ['ok' => true, 'message' => 'LaraKube Linux was already removed.'];
        }

        Process::timeout(60)->run(['wsl.exe', '--terminate', WslDistro::NAME]);
        $removed = Process::timeout(300)->run(['wsl.exe', '--unregister', WslDistro::NAME]);

        return $removed->successful()
            ? ['ok' => true, 'message' => 'LaraKube Linux was removed.']
            : ['ok' => false, 'message' => trim($this->text($removed->errorOutput().$removed->output())) ?: 'Windows could not remove LaraKube Linux.'];
    }

    /** @return array{name: string, version: int}|null */
    public function distro(): ?array
    {
        $listing = Process::timeout(30)->run(['wsl.exe', '--list', '--verbose']);

        if (! $listing->successful()) {
            return null;
        }

        foreach (preg_split('/\R/', $this->text($listing->output())) ?: [] as $line) {
            if (preg_match('/^\s*\*?\s*(\S+)\s+(Running|Stopped|Installing|Uninstalling|Converting)\s+([12])\s*$/i', $line, $match) === 1 && $match[1] === WslDistro::NAME) {
                return ['name' => $match[1], 'version' => (int) $match[3]];
            }
        }

        return null;
    }

    private function expectedChecksum(): ?string
    {
        $response = Http::timeout(30)->get($this->imageUrl().'.sha256');

        if (! $response->successful()) {
            return null;
        }

        return preg_match('/\b([a-f0-9]{64})\b/i', $response->body(), $match) === 1 ? strtolower($match[1]) : null;
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
