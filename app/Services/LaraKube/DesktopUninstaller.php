<?php

namespace App\Services\LaraKube;

use App\Services\Wsl;
use Illuminate\Support\Facades\File;
use Native\Desktop\Facades\App;
use Native\Desktop\Facades\Shell;

class DesktopUninstaller
{
    public function __construct(
        private TerminalIntegration $terminal,
        private ToolLocator $locator,
        private Wsl $wsl,
    ) {}

    /**
     * Executes the uninstallation tasks according to user selections.
     *
     * @param array{
     *     removeCli?: bool,
     *     removeShellPath?: bool,
     *     purgeClusterData?: bool,
     *     removeWsl?: bool,
     *     purgeAppData?: bool,
     *     trashAppBundle?: bool
     * } $options
     * @return array{success: bool, actions: list<string>, error?: string}
     */
    public function execute(array $options): array
    {
        $actions = [];

        // 1. Remove CLI Binaries (~/.larakube/bin) if requested
        if (! empty($options['removeCli'])) {
            $home = ToolLocator::home();
            $binDir = $home !== '' ? "{$home}/.larakube/bin" : '';

            if ($binDir !== '' && is_dir($binDir)) {
                File::deleteDirectory($binDir);
                $actions[] = "Deleted CLI binaries directory: {$binDir}";
            }
        }

        // 2. Remove Shell Profile PATH export
        if (! empty($options['removeShellPath']) || ! empty($options['removeCli'])) {
            $result = $this->terminal->uninstall();
            if (! empty($result['files'])) {
                $actions[] = 'Cleaned shell PATH from: '.implode(', ', $result['files']);
            }
        }

        // 3. Purge ~/.larakube Cluster Data & Configuration
        if (! empty($options['purgeClusterData'])) {
            $home = ToolLocator::home();
            $larakubeDir = $home !== '' ? "{$home}/.larakube" : '';

            if ($larakubeDir !== '' && is_dir($larakubeDir)) {
                File::deleteDirectory($larakubeDir);
                $actions[] = "Purged LaraKube data directory: {$larakubeDir}";
            }
        }

        // 4. Windows WSL 2 Distro Removal
        if ($this->locator->isWindows() && ! empty($options['removeWsl'])) {
            $resetResult = $this->wsl->reset();
            $actions[] = "WSL reset: {$resetResult['message']}";
        }

        // 5. Purge AppData / Application Support (database, logs, caches)
        if (! empty($options['purgeAppData'])) {
            try {
                $cleanExceptGitignore = function (string $dir) use (&$cleanExceptGitignore): void {
                    if (! is_dir($dir)) {
                        return;
                    }
                    foreach (scandir($dir) ?: [] as $file) {
                        if ($file === '.' || $file === '..' || $file === '.gitignore') {
                            continue;
                        }
                        $full = $dir.'/'.$file;
                        if (is_dir($full)) {
                            $cleanExceptGitignore($full);
                            @rmdir($full);
                        } else {
                            @unlink($full);
                        }
                    }
                };

                $cleanExceptGitignore(storage_path('framework/cache'));
                $cleanExceptGitignore(storage_path('framework/sessions'));
                $cleanExceptGitignore(storage_path('logs'));
                $actions[] = 'Purged local application cache and logs';
            } catch (\Throwable) {
                // Best-effort cleanup of cache files
            }
        }

        // 6. Trash Application Bundle (macOS)
        if (! empty($options['trashAppBundle']) && $this->locator->isDarwin()) {
            $appBundlePath = '/Applications/LaraKube.app';
            if (File::exists($appBundlePath)) {
                try {
                    Shell::trashFile($appBundlePath);
                    $actions[] = "Moved {$appBundlePath} to Trash";
                } catch (\Throwable) {
                    // Running in dev or non-packaged mode
                }
            }
        }

        return [
            'success' => true,
            'actions' => $actions,
        ];
    }

    /**
     * Terminate the application after uninstall execution.
     */
    public function finishAndQuit(): void
    {
        try {
            App::quit();
        } catch (\Throwable) {
            // Fallback for CLI/unit test runner
        }
    }
}
