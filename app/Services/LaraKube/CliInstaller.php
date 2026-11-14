<?php

namespace App\Services\LaraKube;

use App\Services\Wsl;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Throwable;

class CliInstaller
{
    public const CHANNELS = ['canary', 'stable'];

    public const REPO = 'https://github.com/luchavez-technologies/larakube-cli/releases';

    public function __construct(
        private GlobalSettings $settings,
        private ?string $binDir = null,
        private ?string $os = null,
        private ?string $arch = null,
    ) {}

    public function binDir(): string
    {
        if ($this->binDir !== null) {
            return $this->binDir;
        }

        if ($this->os() === 'windows') {
            $profile = ToolLocator::hostProfile(true);

            return $profile !== '' ? "{$profile}/.larakube/bin" : '';
        }

        $home = ToolLocator::home();

        return $home !== '' ? "{$home}/.larakube/bin" : '';
    }

    public function channel(): string
    {
        $saved = $this->settings->get()['cliChannel'];

        return in_array($saved, self::CHANNELS, true) ? $saved : 'canary';
    }

    public function setChannel(string $channel): void
    {
        if (in_array($channel, self::CHANNELS, true)) {
            $this->settings->update(['cliChannel' => $channel]);
        }
    }

    public function os(): string
    {
        if ($this->os !== null) {
            return $this->os;
        }

        if (PHP_OS_FAMILY === 'Windows') {
            return 'windows';
        }

        return PHP_OS_FAMILY === 'Darwin' ? 'mac' : 'linux';
    }

    public function arch(): string
    {
        if ($this->arch !== null) {
            return $this->arch;
        }

        if ($this->os() === 'windows') {
            return 'x64';
        }

        $machine = php_uname('m');

        if (in_array($machine, ['arm64', 'aarch64'], true)) {
            return 'arm';
        }

        return 'x64';
    }

    public function binaryName(): string
    {
        $ext = $this->os() === 'windows' ? '.exe' : '';

        return "larakube-{$this->os()}-{$this->arch()}{$ext}";
    }

    public function downloadUrl(?string $channel = null): string
    {
        $channel = $channel ?? $this->channel();
        $binary = $this->binaryName();

        if ($channel === 'canary') {
            return self::REPO."/download/canary/{$binary}";
        }

        return self::REPO."/latest/download/{$binary}";
    }

    public function linuxCacheDownloadUrl(?string $channel = null): string
    {
        $channel = $channel ?? $this->channel();
        $binary = "larakube-linux-{$this->arch()}";

        if ($channel === 'canary') {
            return self::REPO."/download/canary/{$binary}";
        }

        return self::REPO."/latest/download/{$binary}";
    }

    /**
     * @return array{success: bool, path: ?string, error: ?string}
     */
    public function install(?string $channel = null): array
    {
        set_time_limit(0);

        $channel = $channel ?? $this->channel();
        $this->setChannel($channel);

        $binDir = $this->binDir();
        if ($binDir === '') {
            return ['success' => false, 'path' => null, 'error' => 'Could not determine user binary directory.'];
        }

        $ext = $this->os() === 'windows' ? '.exe' : '';
        $target = "{$binDir}/larakube{$ext}";
        $tempFile = null;
        $oldTarget = null;

        try {
            if (! is_dir($binDir)) {
                File::makeDirectory($binDir, 0755, true);
            }

            $url = $this->downloadUrl($channel);
            $download = $this->downloadVerifiedBinary($url, $binDir, 'larakube-download');
            if (! $download['success'] || $download['path'] === null) {
                return [
                    'success' => false,
                    'path' => null,
                    'error' => $download['error'] ?? "Download failed from {$url}.",
                ];
            }

            $tempFile = $download['path'];

            // Remove or move aside any existing binary before moving the verified
            // temp file into place. On Windows, an active file handle (e.g. a running
            // process or Defender scan) blocks unlink(), so fall back to renaming it
            // to .old first.
            if (file_exists($target) && ! @unlink($target) && $this->os() === 'windows') {
                $oldTarget = "{$target}.old";
                if (file_exists($oldTarget)) {
                    @unlink($oldTarget);
                }
                @rename($target, $oldTarget);
            }

            File::move($tempFile, $target);
            @chmod($target, 0755);

            if ($oldTarget !== null && file_exists($oldTarget)) {
                @unlink($oldTarget);
            }

            // Initialize global config if not already created
            $configDir = dirname($binDir);
            $configPath = "{$configDir}/config.json";
            if (! file_exists($configPath)) {
                @file_put_contents($configPath, json_encode(['email' => 'admin@larakube.dev'], JSON_PRETTY_PRINT));
            }

            rescue(fn () => app(ReadinessCheck::class)->forget('larakube'), report: false);

            return [
                'success' => true,
                'path' => $target,
                'error' => null,
            ];
        } catch (Throwable $e) {
            if ($tempFile !== null && file_exists($tempFile)) {
                @unlink($tempFile);
            }

            if ($oldTarget !== null && ! file_exists($target) && file_exists($oldTarget)) {
                @rename($oldTarget, $target);
            }

            return [
                'success' => false,
                'path' => null,
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * Installs or updates the Linux `larakube` CLI binary inside the `larakube-ubuntu`
     * WSL distribution independently from the native Windows `.exe` binary.
     *
     * @return array{success: bool, path: ?string, error: ?string}
     */
    public function installWsl(?string $channel = null, ?Wsl $wsl = null): array
    {
        set_time_limit(0);

        $channel = $channel ?? $this->channel();
        $this->setChannel($channel);

        $binDir = $this->binDir();
        if ($binDir === '') {
            return ['success' => false, 'path' => null, 'error' => 'Could not determine user binary directory.'];
        }

        if (! is_dir($binDir)) {
            File::makeDirectory($binDir, 0755, true);
        }

        $download = $this->downloadLinuxCacheBinary($binDir, $channel);
        if (! $download['success'] || $download['path'] === null) {
            return [
                'success' => false,
                'path' => null,
                'error' => $download['error'] ?? 'Could not download LaraKube Linux CLI binary.',
            ];
        }

        $wsl ??= app(Wsl::class);
        if ($wsl->distro() === null) {
            return [
                'success' => false,
                'path' => null,
                'error' => 'LaraKube Linux (WSL) distribution is not installed.',
            ];
        }

        if (! $wsl->syncCachedLinuxBinaryToDistro($download['path'])) {
            return [
                'success' => false,
                'path' => null,
                'error' => 'Could not install LaraKube CLI into larakube-ubuntu WSL distribution.',
            ];
        }

        rescue(fn () => app(ReadinessCheck::class)->forget('larakube-wsl'), report: false);

        return [
            'success' => true,
            'path' => '/usr/local/bin/larakube',
            'error' => null,
        ];
    }

    /**
     * @return array{success: bool, path: ?string, error: ?string}
     */
    private function downloadLinuxCacheBinary(string $binDir, string $channel): array
    {
        $linuxTarget = "{$binDir}/larakube-linux-{$this->arch()}";
        $url = $this->linuxCacheDownloadUrl($channel);
        $tempFile = null;

        try {
            $download = $this->downloadVerifiedBinary($url, $binDir, 'larakube-linux-download');
            if (! $download['success'] || $download['path'] === null) {
                return [
                    'success' => false,
                    'path' => null,
                    'error' => $download['error'] ?? "Download failed from {$url}.",
                ];
            }

            $tempFile = $download['path'];

            if (file_exists($linuxTarget)) {
                @unlink($linuxTarget);
            }

            File::move($tempFile, $linuxTarget);
            @chmod($linuxTarget, 0755);

            return [
                'success' => true,
                'path' => $linuxTarget,
                'error' => null,
            ];
        } catch (Throwable $e) {
            if ($tempFile !== null && file_exists($tempFile)) {
                @unlink($tempFile);
            }

            return [
                'success' => false,
                'path' => null,
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * Downloads a binary to a fresh same-directory temp file, closes its stream handle
     * before inspecting size, verifies Content-Length completeness, and retries up to 3 times.
     *
     * @return array{success: bool, path: ?string, error: ?string}
     */
    private function downloadVerifiedBinary(string $url, string $destinationDir, string $prefix): array
    {
        $lastError = "Download failed from {$url}.";

        for ($attempt = 1; $attempt <= 3; $attempt++) {
            if ($attempt > 1) {
                app()->runningUnitTests() ? usleep(10_000) : sleep(2);
            }

            $tempFile = "{$destinationDir}/.{$prefix}-".bin2hex(random_bytes(4)).'.tmp';

            try {
                File::ensureDirectoryExists($destinationDir);

                $response = Http::withOptions([
                    'follow_redirects' => true,
                    'verify' => true,
                ])->connectTimeout(30)->timeout(600)->sink($tempFile)->get($url);

                clearstatcache(true, $tempFile);

                $successful = $response->successful();
                $status = $response->status();
                $contentLength = $response->header('Content-Length');

                if ($successful && (! file_exists($tempFile) || (int) filesize($tempFile) === 0)) {
                    $body = $response->body();
                    if ($body !== '') {
                        file_put_contents($tempFile, $body);
                    }
                }

                $psrBody = $response->toPsrResponse()->getBody();
                if ($psrBody->getMetadata('uri') === $tempFile) {
                    $psrBody->close();
                }
                unset($response, $psrBody);
                clearstatcache(true, $tempFile);

                if (! $successful) {
                    if (file_exists($tempFile)) {
                        @unlink($tempFile);
                    }
                    $lastError = "Download failed from {$url} (HTTP status: {$status}).";

                    continue;
                }

                if (! file_exists($tempFile) || (int) filesize($tempFile) < 1024) {
                    if (file_exists($tempFile)) {
                        @unlink($tempFile);
                    }
                    $lastError = "Download failed from {$url} (file missing or incomplete).";

                    continue;
                }

                $expectedBytes = ctype_digit(trim($contentLength))
                    ? (int) trim($contentLength)
                    : 0;
                $actualBytes = (int) filesize($tempFile);

                if ($expectedBytes > 0 && $actualBytes !== $expectedBytes) {
                    @unlink($tempFile);
                    $lastError = "Incomplete download from {$url} (received {$actualBytes} of {$expectedBytes} bytes).";

                    continue;
                }

                return [
                    'success' => true,
                    'path' => $tempFile,
                    'error' => null,
                ];
            } catch (Throwable $e) {
                if (file_exists($tempFile)) {
                    @unlink($tempFile);
                }
                $lastError = $e->getMessage();
            }
        }

        return [
            'success' => false,
            'path' => null,
            'error' => $lastError,
        ];
    }
}
