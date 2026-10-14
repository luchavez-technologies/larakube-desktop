<?php

namespace App\Console\Commands;

use App\Services\Branding\AppIconGenerator;
use App\Services\Branding\CloudBrandingClient;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Laravel\Prompts;
use Native\Desktop\Facades\Dock;
use Native\Desktop\Facades\MenuBar;

class SyncAppIconCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'icon:sync
                            {--file= : Path to local image file to use as the app icon}
                            {--url= : Remote image URL to download and sync}
                            {--theme= : Theme name or seasonal identifier (e.g. halloween, winter, luchtech)}
                            {--force : Force icon regeneration even if the image checksum has not changed}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Synchronize and dynamically generate seasonal desktop app and menu bar icons';

    /**
     * Execute the console command.
     */
    public function handle(AppIconGenerator $generator, CloudBrandingClient $cloudClient): int
    {
        if (! $generator->isSupported()) {
            $this->warn('Image manipulation requires either the GD or Imagick PHP extension. Skipping icon sync.');

            return self::SUCCESS;
        }

        $filePath = (string) $this->option('file');
        $urlPath = (string) $this->option('url');
        $theme = (string) ($this->option('theme') ?: 'custom');
        $force = (bool) $this->option('force');

        $sourceFile = null;
        $sourceDescription = '';

        if (! empty($filePath)) {
            $resolved = realpath($filePath) ?: realpath(base_path($filePath));
            if (! $resolved || ! file_exists($resolved)) {
                $this->error("Specified file not found: {$filePath}");

                return self::FAILURE;
            }
            $sourceFile = $resolved;
            $sourceDescription = "local file: {$filePath}";
        } elseif (! empty($urlPath)) {
            $this->info("Downloading remote icon from: {$urlPath}");
            $downloaded = $cloudClient->downloadIcon($urlPath);
            if (! $downloaded || ! file_exists($downloaded)) {
                $this->error("Failed to download remote icon from: {$urlPath}");

                return self::FAILURE;
            }
            $sourceFile = $downloaded;
            $sourceDescription = "remote url: {$urlPath}";
        } else {
            // Check LaraKube Cloud Branding endpoint
            $branding = $cloudClient->getActiveBranding();
            if ($branding && ! empty($branding['icon_url'])) {
                $theme = $branding['theme'];
                $month = $branding['month'] ?? date('Y-m');
                $this->info("Fetched seasonal branding [{$theme}] for {$month}");
                $downloaded = $cloudClient->downloadIcon($branding['icon_url']);
                if ($downloaded && file_exists($downloaded)) {
                    $sourceFile = $downloaded;
                    $sourceDescription = "cloud branding [{$theme}]: {$branding['icon_url']}";
                }
            }
        }

        if (! $sourceFile) {
            $this->warn('No icon source specified and cloud branding is currently unreachable.');
            $this->line('Provide an icon via --file=<path> or --url=<url>.');

            return self::SUCCESS;
        }

        $sha256 = hash_file('sha256', $sourceFile);
        $metaPath = storage_path('app/branding/current.json');

        if (! $force && file_exists($metaPath)) {
            $current = json_decode((string) file_get_contents($metaPath), true);
            if (is_array($current) && ($current['sha256'] ?? '') === $sha256) {
                $this->info("App icons are already synchronized with {$sourceDescription}. Use --force to regenerate.");

                return self::SUCCESS;
            }
        }

        $this->info("Processing app icons from {$sourceDescription}...");

        try {
            $generated = $generator->generateAll($sourceFile, public_path());

            // Save metadata
            File::ensureDirectoryExists(storage_path('app/branding'));
            file_put_contents($metaPath, json_encode([
                'theme' => $theme,
                'sha256' => $sha256,
                'source' => $sourceDescription,
                'updated_at' => now()->toIso8601String(),
            ], JSON_PRETTY_PRINT));

            // Backup current source
            @copy($sourceFile, storage_path('app/branding/current-source.png'));

            // Live runtime update for running NativePHP desktop app
            $this->updateRuntimeIcons();

            $this->components->info("Successfully synchronized app icons for theme [{$theme}]!");

            $rows = [];
            foreach ($generated as $type => $path) {
                $rows[] = [$type, str_replace(base_path().'/', '', $path), file_exists($path) ? '✓ Ready' : '✗ Failed'];
            }

            Prompts\table(
                headers: ['Asset Type', 'Relative Path', 'Status'],
                rows: $rows,
            );

            return self::SUCCESS;
        } catch (\Throwable $e) {
            $this->error('Failed to generate app icons: '.$e->getMessage());

            return self::FAILURE;
        }
    }

    /**
     * Dynamically update the running NativePHP Dock and MenuBar icons at runtime.
     */
    protected function updateRuntimeIcons(): void
    {
        if (class_exists(Dock::class)) {
            try {
                Dock::icon(public_path('icon.png'));
            } catch (\Throwable) {
                // Ignore if not running inside electron desktop container
            }
        }

        if (class_exists(MenuBar::class)) {
            try {
                MenuBar::icon(public_path('IconTemplate.png'));
            } catch (\Throwable) {
                // Ignore if menu bar is not active
            }
        }
    }
}
