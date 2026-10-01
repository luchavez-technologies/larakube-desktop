<?php

namespace App\Services\LaraKube;

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
    ) {}

    public function binDir(): string
    {
        if ($this->binDir !== null) {
            return $this->binDir;
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
        return PHP_OS_FAMILY === 'Darwin' ? 'mac' : 'linux';
    }

    public function arch(): string
    {
        $machine = php_uname('m');

        if (in_array($machine, ['arm64', 'aarch64'], true)) {
            return 'arm';
        }

        return 'x64';
    }

    public function binaryName(): string
    {
        return "larakube-{$this->os()}-{$this->arch()}";
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

    /**
     * @return array{success: bool, path: ?string, error: ?string}
     */
    public function install(?string $channel = null): array
    {
        $channel = $channel ?? $this->channel();
        $this->setChannel($channel);

        $binDir = $this->binDir();
        if ($binDir === '') {
            return ['success' => false, 'path' => null, 'error' => 'Could not determine user binary directory.'];
        }

        $target = "{$binDir}/larakube";

        try {
            if (! is_dir($binDir)) {
                File::makeDirectory($binDir, 0755, true);
            }

            $url = $this->downloadUrl($channel);
            $tempFile = storage_path('framework/temp/larakube-download-'.bin2hex(random_bytes(4)));
            File::ensureDirectoryExists(dirname($tempFile));

            $response = Http::withOptions([
                'follow_redirects' => true,
                'verify' => true,
            ])->timeout(120)->sink($tempFile)->get($url);

            if (! $response->successful() || ! file_exists($tempFile) || filesize($tempFile) < 1024) {
                if (file_exists($tempFile)) {
                    @unlink($tempFile);
                }

                return [
                    'success' => false,
                    'path' => null,
                    'error' => "Download failed from {$url} (HTTP status: {$response->status()}).",
                ];
            }

            // Move into place and make executable
            if (file_exists($target)) {
                @unlink($target);
            }

            File::move($tempFile, $target);
            chmod($target, 0755);

            // Initialize global config if not already created
            $home = ToolLocator::home();
            $configPath = "{$home}/.larakube/config.json";
            if ($home !== '' && ! file_exists($configPath)) {
                @file_put_contents($configPath, json_encode(['email' => 'admin@larakube.dev'], JSON_PRETTY_PRINT));
            }

            return [
                'success' => true,
                'path' => $target,
                'error' => null,
            ];
        } catch (Throwable $e) {
            return [
                'success' => false,
                'path' => null,
                'error' => $e->getMessage(),
            ];
        }
    }
}
