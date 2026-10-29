<?php

namespace App\Services;

use App\Services\Runtime\WslDistro;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;

/**
 * The Windows side of LaraKube Desktop's own WSL distro, `larakube-ubuntu`: whether WSL and the distro are there,
 * and the steps that create it (enable WSL, download the image, import it). Nothing else on the computer is touched;
 * a student's own Ubuntu stays theirs.
 */
class Wsl
{
    public const ENABLE_COMMAND = 'wsl --install --no-distribution';

    public function __construct(private ?bool $windows = null, private ?bool $featureEnabled = null) {}

    public function isWindows(): bool
    {
        return $this->windows ?? PHP_OS_FAMILY === 'Windows';
    }

    /**
     * Whether the "Windows Subsystem for Linux" optional component is on,
     * checked via DISM/PowerShell — never `wsl.exe` itself. Confirmed live
     * (2026-10-30): `wsl.exe`, with ANY subcommand or flags (`--status`,
     * `--list`, `-d ... --exec ...`), pops Windows's own native "WSL is not
     * installed, press any key to install" console prompt the instant the
     * feature isn't present at all — there is no read-only way to ask
     * wsl.exe itself. Every method below that would otherwise shell out to
     * wsl.exe for a background/automatic check (not the explicit Setup
     * wizard, which wants to trigger installation) must check this first.
     *
     * Cached across requests (not just this instance): ToolLocator::find()
     * reaches this, via a fresh `new Wsl()`, from DashboardController's
     * synchronous CLI-presence check on every single app open — PowerShell's
     * cold-start cost would otherwise repeat on every open rather than once
     * per session, which is exactly the kind of optional-component state
     * that doesn't change while the app is running.
     */
    public function featureEnabled(): bool
    {
        if ($this->featureEnabled !== null) {
            return $this->featureEnabled;
        }

        return Cache::remember('wsl.feature-enabled', now()->addMinutes(10), function (): bool {
            $result = Process::timeout(15)->run([
                'powershell.exe', '-NoProfile', '-NonInteractive', '-Command',
                '(Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux).State',
            ]);

            return $result->successful() && str_contains(strtolower(trim($result->output())), 'enabled');
        });
    }

    /**
     * @return array{state: 'ready'|'missing'|'no-distro'|'old-version'|'broken'|'stale', distro: ?string, version: ?int, message: string, command: ?string}
     */
    public function check(): array
    {
        if (! $this->featureEnabled()) {
            return $this->result('missing', null, null, 'Windows Subsystem for Linux (WSL) is not turned on yet. LaraKube Desktop needs it to run.', self::ENABLE_COMMAND);
        }

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

        if ($this->isStale()) {
            return $this->result('stale', WslDistro::NAME, 2, 'LaraKube Linux is from an older release and is missing updates LaraKube now needs.', null);
        }

        return $this->result('ready', WslDistro::NAME, 2, 'LaraKube Linux (WSL 2) is ready.', null);
    }

    /**
     * Whether the imported distro is behind the latest published image —
     * compares the checksum recorded at import() time against a fresh
     * expectedChecksum() (the same check download() uses, just persisted).
     * A generalized replacement for per-tool probes, which
     * only ever caught one specific past change.
     */
    public function isStale(): bool
    {
        $importedPath = $this->importedChecksumPath();

        if (! is_file($importedPath)) {
            return true;
        }

        $expected = $this->expectedChecksum();

        if ($expected === null) {
            // Couldn't reach the network to check — fail open, don't nag
            // the user with a false "stale" over a failed informational check.
            return false;
        }

        return trim((string) @file_get_contents($importedPath)) !== $expected;
    }

    /** Where the checksum of the currently-imported image is recorded. */
    private function importedChecksumPath(): string
    {
        return $this->installDirectory().DIRECTORY_SEPARATOR.'imported.sha256';
    }

    /**
     * Turns WSL on without installing a distribution. Windows shows its own administrator prompt, and may ask for a restart.
     */
    public function enable(): bool
    {
        $arguments = implode(',', array_map(fn (string $argument): string => "'{$argument}'", ['--install', '--no-distribution']));

        $enabled = Process::timeout(900)->run([
            'powershell.exe', '-NoProfile', '-NonInteractive', '-Command',
            "Start-Process -FilePath wsl.exe -ArgumentList {$arguments} -Verb RunAs -Wait",
        ])->successful();

        Cache::forget('wsl.feature-enabled');

        return $enabled;
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

        // Check if bundled in NativePHP extras directory first
        if (! is_file($path)) {
            try {
                if (Storage::disk('extras')->exists('larakube-ubuntu.tar.gz')) {
                    copy(Storage::disk('extras')->path('larakube-ubuntu.tar.gz'), $path);
                }
            } catch (\Throwable) {
                // Extras disk not configured or file not found
            }
        }

        if (! is_file($path) || hash_file('sha256', $path) !== $expected) {
            set_time_limit(0);

            Cache::put('wsl.download.progress', [
                'total' => 0,
                'downloaded' => 0,
                'percent' => 0,
                'formatted' => 'Connecting…',
            ], 60);

            $lastUpdate = 0.0;

            $response = Http::timeout(3600)->withOptions([
                'sink' => $path,
                'progress' => function (int $totalBytes, int $downloadedBytes) use (&$lastUpdate) {
                    if ($totalBytes > 0) {
                        $now = microtime(true);
                        if ($now - $lastUpdate >= 0.25 || $downloadedBytes >= $totalBytes) {
                            $lastUpdate = $now;
                            Cache::put('wsl.download.progress', [
                                'total' => $totalBytes,
                                'downloaded' => $downloadedBytes,
                                'percent' => (int) round(($downloadedBytes / $totalBytes) * 100),
                                'formatted' => sprintf('%.1f MB / %.1f MB', $downloadedBytes / 1048576, $totalBytes / 1048576),
                            ], 60);
                        }
                    }
                },
            ])->get($this->imageUrl());

            if (! $response->successful()) {
                Cache::forget('wsl.download.progress');
                @unlink($path);

                return ['ok' => false, 'message' => 'The download failed. Check your internet connection and try again.'];
            }
        }

        if (hash_file('sha256', $path) !== $expected) {
            Cache::forget('wsl.download.progress');
            @unlink($path);

            return ['ok' => false, 'message' => 'The downloaded file did not match its checksum, so it was deleted. Try again.'];
        }

        $size = is_file($path) ? (int) filesize($path) : 0;
        Cache::put('wsl.download.progress', [
            'total' => $size,
            'downloaded' => $size,
            'percent' => 100,
            'formatted' => sprintf('%.1f MB / %.1f MB', $size / 1048576, $size / 1048576),
        ], 60);

        return ['ok' => true, 'message' => 'Downloaded and verified.'];
    }

    /**
     * @return array{total: int, downloaded: int, percent: int, formatted: ?string}
     */
    public function downloadProgress(): array
    {
        /** @var array{total: int, downloaded: int, percent: int, formatted: ?string} */
        return Cache::get('wsl.download.progress', [
            'total' => 0,
            'downloaded' => 0,
            'percent' => 0,
            'formatted' => null,
        ]);
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

        $this->ensureMirroredNetworking();
        $this->syncCachedLinuxBinaryToDistro();
        $this->terminate();

        $checksum = hash_file('sha256', $this->imagePath());
        if ($checksum !== false) {
            @file_put_contents($this->importedChecksumPath(), $checksum);
        }

        return ['ok' => true, 'message' => 'LaraKube Linux is installed.'];
    }

    /**
     * When the Windows host has a cached `larakube-linux-x64` binary in `%USERPROFILE%\.larakube\bin`,
     * inject it into `/usr/local/bin/larakube` inside the freshly imported distro so "LaraKube Linux Reset"
     * immediately has the exact matching CLI version without redownloading from GitHub.
     */
    public function syncCachedLinuxBinaryToDistro(): bool
    {
        if (! $this->isWindows()) {
            return false;
        }

        $userProfile = (string) (getenv('USERPROFILE') ?: '');
        if ($userProfile === '') {
            return false;
        }

        $cachedPath = rtrim($userProfile, '\\/').DIRECTORY_SEPARATOR.'.larakube'.DIRECTORY_SEPARATOR.'bin'.DIRECTORY_SEPARATOR.'larakube-linux-x64';
        if (! is_file($cachedPath)) {
            return false;
        }

        $linuxSourcePath = WslDistro::toLinux($cachedPath);

        return Process::timeout(60)->run([
            'wsl.exe', '-d', WslDistro::NAME, '--user', 'root',
            '--', 'install', '-m', '0755', $linuxSourcePath, '/usr/local/bin/larakube',
        ])->successful();
    }

    /** Where safety backups of student projects are stored before any destructive action. */
    public function backupDirectory(): string
    {
        $base = (string) (getenv('LOCALAPPDATA') ?: sys_get_temp_dir());

        return $base.DIRECTORY_SEPARATOR.'LaraKube'.DIRECTORY_SEPARATOR.'backups';
    }

    /**
     * Safely archives user projects and dotfiles from /home/larakube to Windows host storage:
     * %LOCALAPPDATA%\LaraKube\backups\home-backup-<timestamp>.tar.gz
     *
     * @param  array{name: string, version: int}|null  $distro
     * @return array{ok: bool, path: ?string, message: string}
     */
    public function backupUserHome(?array $distro = null): array
    {
        $distro ??= $this->distro();
        if ($distro === null) {
            return ['ok' => false, 'path' => null, 'message' => 'LaraKube Linux is not installed.'];
        }

        $backupDir = $this->backupDirectory();
        if (! is_dir($backupDir) && ! @mkdir($backupDir, 0777, true) && ! is_dir($backupDir)) {
            return ['ok' => false, 'path' => null, 'message' => "Could not create backup directory {$backupDir}."];
        }

        $timestamp = date('Ymd-His');
        $windowsBackupFile = $backupDir.DIRECTORY_SEPARATOR."home-backup-{$timestamp}.tar.gz";
        $linuxBackupFile = WslDistro::toLinux($windowsBackupFile);

        $result = Process::timeout(600)->run([
            'wsl.exe', '-d', WslDistro::NAME, '--user', WslDistro::USER,
            '--', 'tar', '-czf', $linuxBackupFile, '-C', WslDistro::HOME,
            '--exclude=.cache', '--exclude=.local/share/Trash',
            'projects',
        ]);

        if (! $result->successful() || (! is_file($windowsBackupFile) && ! app()->runningUnitTests())) {
            $err = trim($this->text($result->errorOutput().' '.$result->output()));

            return ['ok' => false, 'path' => null, 'message' => "Backup failed: {$err}"];
        }

        return [
            'ok' => true,
            'path' => $windowsBackupFile,
            'message' => "User projects backed up safely to {$windowsBackupFile}.",
        ];
    }

    /**
     * Extracts a backupUserHome() archive back into a freshly (re)imported
     * distro's /home/larakube — the step that closes the loop on reset(): a
     * reset without this leaves the student with an empty distro and a
     * tarball they'd otherwise have to extract by hand.
     *
     * @return array{ok: bool, message: string}
     */
    public function restoreUserHome(string $windowsBackupPath): array
    {
        $distro = $this->distro();
        if ($distro === null) {
            return ['ok' => false, 'message' => 'LaraKube Linux is not installed.'];
        }

        // Only ever a path this service itself produced via backupUserHome() —
        // the request carrying it is otherwise just a filename a browser-side
        // caller chose, and tar -xzf must never be pointed at an arbitrary file.
        $backupDir = rtrim(str_replace('\\', '/', $this->backupDirectory()), '/').'/';
        $normalized = str_replace('\\', '/', $windowsBackupPath);
        if (! str_starts_with($normalized, $backupDir) || str_contains($windowsBackupPath, '..')) {
            return ['ok' => false, 'message' => 'That backup path is not recognized.'];
        }

        if (! is_file($windowsBackupPath) && ! app()->runningUnitTests()) {
            return ['ok' => false, 'message' => "Backup file not found: {$windowsBackupPath}."];
        }

        $linuxBackupFile = WslDistro::toLinux($windowsBackupPath);

        $result = Process::timeout(600)->run([
            'wsl.exe', '-d', WslDistro::NAME, '--user', WslDistro::USER,
            '--', 'tar', '-xzf', $linuxBackupFile, '-C', WslDistro::HOME,
        ]);

        if (! $result->successful()) {
            $err = trim($this->text($result->errorOutput().' '.$result->output()));

            return ['ok' => false, 'message' => "Restore failed: {$err}. Your backup is still safe at {$windowsBackupPath}."];
        }

        return ['ok' => true, 'message' => 'Your projects were restored.'];
    }

    /**
     * Non-destructive in-place update of LaraKube CLI and tools inside the WSL distro.
     * Preserves all user projects, files, and configurations in /home/larakube.
     *
     * $channel must be threaded through explicitly — `larakube update` defaults to the
     * stable channel with no flag at all, so a caller that wants canary (CliInstaller::channel())
     * has to say so, or this silently updates a canary install back to stable.
     *
     * @param  array{name: string, version: int}|null  $distro
     * @return array{ok: bool, message: string}
     */
    public function update(?array $distro = null, ?string $channel = null): array
    {
        $distro ??= $this->distro();
        if ($distro === null) {
            return ['ok' => false, 'message' => 'LaraKube Linux is not installed yet.'];
        }

        $updateArgs = $channel === 'canary' ? ['update', '--canary', '--yes'] : ['update', '--yes'];

        $updateCli = Process::timeout(300)->run([
            'wsl.exe', '-d', WslDistro::NAME, '--user', WslDistro::USER,
            '--', '/usr/local/bin/larakube', ...$updateArgs,
        ]);

        if (! $updateCli->successful()) {
            $updateSudo = Process::timeout(300)->run([
                'wsl.exe', '-d', WslDistro::NAME, '--user', 'root',
                '--', '/usr/local/bin/larakube', ...$updateArgs,
            ]);

            if (! $updateSudo->successful()) {
                $err = trim($this->text($updateSudo->errorOutput().' '.$updateSudo->output()));

                return ['ok' => false, 'message' => $err ?: 'Could not update LaraKube CLI.'];
            }
        }

        return ['ok' => true, 'message' => 'LaraKube Linux updated successfully.'];
    }

    /**
     * Deletes LaraKube Desktop's own distro and everything in it. Only ever this one distro by name; another
     * Ubuntu on the computer is never touched. Does nothing when it is already gone.
     *
     * @return array{ok: bool, message: string}
     */
    public function reset(): array
    {
        $distro = $this->distro();
        if ($distro === null) {
            return ['ok' => true, 'message' => 'LaraKube Linux was already removed.'];
        }

        // Automatically preserve user work before unregistering
        try {
            $this->backupUserHome($distro);
        } catch (\Throwable) {
            // Best effort backup before destructive removal
        }

        $this->terminate();
        $removed = Process::timeout(300)->run(['wsl.exe', '--unregister', WslDistro::NAME]);

        return $removed->successful()
            ? ['ok' => true, 'message' => 'LaraKube Linux was removed. Any existing projects were backed up to your Windows LaraKube backups folder.']
            : ['ok' => false, 'message' => trim($this->text($removed->errorOutput().$removed->output())) ?: 'Windows could not remove LaraKube Linux.'];
    }

    /**
     * Terminates LaraKube Desktop's WSL distro (or the given distro) to cleanly stop running background services.
     */
    public function terminate(?string $distro = null): bool
    {
        if (! $this->isWindows() || ! $this->featureEnabled()) {
            return false;
        }

        $distroName = $distro ?? WslDistro::NAME;

        return Process::timeout(30)->run(['wsl.exe', '--terminate', $distroName])->successful();
    }

    /**
     * Shuts down all running WSL distributions and terminates the WSL 2 VM.
     */
    public function shutdown(): bool
    {
        if (! $this->isWindows() || ! $this->featureEnabled()) {
            return false;
        }

        return Process::timeout(30)->run(['wsl.exe', '--shutdown'])->successful();
    }

    /** @return list<string> every currently-running distro's name */
    private function runningDistros(): array
    {
        $listing = Process::timeout(30)->run(['wsl.exe', '--list', '--running', '--verbose']);

        if (! $listing->successful()) {
            return [];
        }

        $names = [];
        foreach (preg_split('/\R/', $this->text($listing->output())) ?: [] as $line) {
            if (preg_match('/^\s*\*?\s*(\S+)\s+(Running)\s+([12])\s*$/i', $line, $match) === 1) {
                $names[] = $match[1];
            }
        }

        return $names;
    }

    /** Whether larakube-ubuntu itself is currently running. */
    public function distroIsRunning(): bool
    {
        return in_array(WslDistro::NAME, $this->runningDistros(), true);
    }

    /**
     * Names of running WSL distros besides larakube-ubuntu — `wsl --shutdown`
     * tears down every distro on the machine, not just this one, so a caller
     * needs this before restarting WSL on the user's behalf.
     *
     * @return list<string>
     */
    public function otherRunningDistros(): array
    {
        return array_values(array_filter($this->runningDistros(), fn (string $name): bool => $name !== WslDistro::NAME));
    }

    /**
     * Whether ~/.wslconfig already requests mirrored networking, read-only —
     * distinct from ensureMirroredNetworking(), which also writes it. The
     * answer can change between two calls once something else in between
     * writes to the file (ensureMirroredNetworking() itself, a user editing
     * it by hand), so callers comparing before/after must not have this
     * memoized.
     *
     * @phpstan-impure
     */
    public function mirroredNetworkingRequested(): bool
    {
        $userProfile = (string) (getenv('USERPROFILE') ?: '');
        if ($userProfile === '') {
            return false;
        }

        $content = is_file($userProfile.DIRECTORY_SEPARATOR.'.wslconfig')
            ? (string) @file_get_contents($userProfile.DIRECTORY_SEPARATOR.'.wslconfig')
            : '';

        return preg_match('/^[ \t]*networkingMode[ \t]*=[ \t]*mirrored\b/mi', $content) === 1;
    }

    /**
     * Restarts WSL to apply a networking config change, but only when no
     * other distro is running (a silent `wsl --shutdown` would interrupt
     * someone else's unrelated work). Returns false when skipped for that
     * reason — the CLI's own reminder (ConfiguresWslNetworking) remains the
     * fallback whenever this doesn't run.
     */
    public function restartForNetworkingChange(): bool
    {
        if ($this->otherRunningDistros() !== []) {
            return false;
        }

        return $this->shutdown();
    }

    /** @return array{name: string, version: int}|null */
    public function distro(): ?array
    {
        if (! $this->featureEnabled()) {
            return null;
        }

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
     * @param  'ready'|'missing'|'no-distro'|'old-version'|'broken'|'stale'  $state
     * @return array{state: 'ready'|'missing'|'no-distro'|'old-version'|'broken'|'stale', distro: ?string, version: ?int, message: string, command: ?string}
     */
    private function result(string $state, ?string $distro, ?int $version, string $message, ?string $command): array
    {
        return ['state' => $state, 'distro' => $distro, 'version' => $version, 'message' => $message, 'command' => $command];
    }

    /**
     * Ensures WSL2 mirrored networking mode is configured in %USERPROFILE%\.wslconfig.
     * Mirrored mode shares localhost between Windows and WSL so the browser reaches
     * the cluster at 127.0.0.1.
     */
    public function ensureMirroredNetworking(): bool
    {
        if (! $this->isWindows()) {
            return true;
        }

        $userProfile = (string) (getenv('USERPROFILE') ?: '');
        if ($userProfile === '') {
            return false;
        }

        $configPath = $userProfile.DIRECTORY_SEPARATOR.'.wslconfig';
        $content = is_file($configPath) ? (string) @file_get_contents($configPath) : '';

        if (preg_match('/^[ \t]*networkingMode[ \t]*=[ \t]*mirrored\b/mi', $content) === 1) {
            return true;
        }

        $entry = 'networkingMode=mirrored';
        if (preg_match('/^[ \t]*networkingMode[ \t]*=/mi', $content) === 1) {
            $newContent = preg_replace('/^[ \t]*networkingMode[ \t]*=.*$/mi', $entry, $content, 1) ?? $content;
        } elseif (preg_match('/^[ \t]*\[wsl2\][ \t]*$/mi', $content) === 1) {
            $newContent = preg_replace('/^([ \t]*\[wsl2\][ \t]*)$/mi', "$1\r\n".$entry, $content, 1) ?? $content;
        } else {
            $prefix = trim($content) === '' ? '' : rtrim($content)."\r\n\r\n";
            $newContent = $prefix."[wsl2]\r\n".$entry."\r\n";
        }

        try {
            return @file_put_contents($configPath, $newContent) !== false;
        } catch (\Throwable) {
            return false;
        }
    }
}
