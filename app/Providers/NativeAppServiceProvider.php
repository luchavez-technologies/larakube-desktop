<?php

namespace App\Providers;

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Jobs\Sync\SyncAppIconJob;
use App\Jobs\Sync\SyncCliWithDesktopJob;
use App\Jobs\Sync\SyncClusterToolsJob;
use App\Jobs\Sync\SyncDriveJob;
use App\Jobs\Sync\SyncMailJob;
use App\Jobs\Sync\SyncPlexJob;
use App\Jobs\Sync\SyncServerDomainsJob;
use App\Jobs\Sync\SyncServersJob;
use App\Models\Run;
use App\Models\Server;
use App\Services\Elevation;
use App\Services\LaraKube\AppMenu;
use App\Services\LaraKube\GlobalSettings;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Log;
use Native\Desktop\Contracts\ProvidesPhpIni;
use Native\Desktop\Enums\SystemThemesEnum;
use Native\Desktop\Facades\Menu;
use Native\Desktop\Facades\MenuBar;
use Native\Desktop\Facades\System;
use Native\Desktop\Facades\Window;

class NativeAppServiceProvider implements ProvidesPhpIni
{
    /**
     * Executed once the native application has been booted.
     * Use this method to open windows, register global shortcuts, etc.
     */
    public function boot(): void
    {
        $this->ensureDatabaseMigrated();
        $this->closeInterruptedRuns();
        $this->syncTheme();
        $this->syncCliOnDesktopUpdate();
        $this->warmSync();

        AppMenu::register();

        Window::open()
            ->title(config('app.name'))
            ->width(1180)
            ->height(780)
            ->minWidth(960)
            ->minHeight(640)
            ->rememberState();

        $trayIcon = PHP_OS_FAMILY === 'Windows'
            ? (file_exists(public_path('icon.ico')) ? public_path('icon.ico') : public_path('icon.png'))
            : public_path('IconTemplate.png');

        MenuBar::create()
            ->icon($trayIcon)
            ->tooltip(config('app.name', 'LaraKube'))
            ->showDockIcon(true)
            ->onlyShowContextMenu(false)
            ->width(360)
            ->height(520)
            ->resizable(false)
            ->url(url('/tray'))
            ->withContextMenu(
                Menu::make(
                    Menu::link(url('/'), 'Open LaraKube Desktop'),
                    Menu::separator(),
                    Menu::link(url('/settings'), 'Settings…'),
                    Menu::separator(),
                    Menu::quit('Quit LaraKube'),
                )
            );
    }

    /** Ensures all database migrations are applied to the active database on startup. */
    private function ensureDatabaseMigrated(): void
    {
        try {
            Artisan::call('migrate', ['--force' => true]);
        } catch (\Throwable $e) {
            Log::warning('Startup migration warning: '.$e->getMessage());
        }
    }

    /** Cleans up any runs that were left in 'running' state when the previous app instance closed. */
    private function closeInterruptedRuns(): void
    {
        try {
            $interrupted = Run::query()->where('status', RunStatus::Running);

            if ($interrupted->exists()) {
                $hasLocalSetup = (clone $interrupted)->where('kind', RunKind::SetupLocal)->exists();
                if ($hasLocalSetup) {
                    app(Elevation::class)->revoke();
                }

                $interrupted->update([
                    'status' => RunStatus::Failed,
                    'finished_at' => now(),
                ]);
            }
        } catch (\Throwable) {
            // The database may not be migrated yet on a first launch.
        }
    }

    /** Dispatches a background refresh for everything this app already knows about, so Tools/Mail are warm before the user clicks in. */
    private function warmSync(): void
    {
        try {
            SyncAppIconJob::dispatch();
            SyncServersJob::dispatch();

            foreach (Server::where('status', 'ready')->whereNotNull('context')->get() as $server) {
                SyncClusterToolsJob::dispatch($server->id);
                SyncServerDomainsJob::dispatch($server->id);
                SyncPlexJob::dispatch($server->id);

                if ($server->mailTool()?->installed) {
                    SyncMailJob::dispatch($server->id);
                }

                if ($server->driveTool()?->installed) {
                    SyncDriveJob::dispatch($server->id);
                }
            }
        } catch (\Throwable) {
            // The database may not be migrated yet on a first launch.
        }
    }

    /**
     * A Desktop update is the signal to also bring the CLI up to the saved
     * release channel — Desktop depends on it for nearly everything, and a
     * new Desktop feature often needs a CLI it shipped alongside. Compares
     * against the version last seen at boot rather than any "just installed"
     * event, since that is the one signal that survives both the auto-updater
     * (download now, relaunch into it later) and a manual reinstall.
     * Skipped outside a packaged build, and on a fresh install (nothing seen
     * yet, so there is nothing to call an update) — SyncCliWithDesktopJob
     * itself also skips a machine that was never taken through Setup.
     */
    private function syncCliOnDesktopUpdate(): void
    {
        if (! app()->isProduction()) {
            return;
        }

        try {
            $settings = app(GlobalSettings::class);
            $current = (string) config('nativephp.version');
            $previous = $settings->lastSeenDesktopVersion();

            if ($current === '' || $current === $previous) {
                return;
            }

            $settings->rememberDesktopVersion($current);

            if ($previous !== null) {
                SyncCliWithDesktopJob::dispatch();
            }
        } catch (\Throwable) {
            // The database may not be migrated yet on a first launch.
        }
    }

    private function syncTheme(): void
    {
        try {
            $savedTheme = app(GlobalSettings::class)->getTheme();
            $themeEnum = match ($savedTheme) {
                'light' => SystemThemesEnum::LIGHT,
                'dark' => SystemThemesEnum::DARK,
                default => SystemThemesEnum::SYSTEM,
            };
            System::theme($themeEnum);
        } catch (\Throwable) {
        }
    }

    /**
     * Return an array of php.ini directives to be set.
     *
     * @return array<string, string>
     */
    public function phpIni(): array
    {
        return [
            'max_execution_time' => '0',
            'max_input_time' => '-1',
        ];
    }
}
