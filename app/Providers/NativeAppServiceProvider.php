<?php

namespace App\Providers;

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Jobs\Sync\SyncClusterToolsJob;
use App\Jobs\Sync\SyncMailJob;
use App\Jobs\Sync\SyncServersJob;
use App\Models\Run;
use App\Models\Server;
use App\Services\Elevation;
use App\Services\LaraKube\GlobalSettings;
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
        $this->closeInterruptedLocalSetup();
        $this->syncTheme();
        $this->warmSync();

        Window::open()
            ->title(config('app.name'))
            ->width(1180)
            ->height(780)
            ->minWidth(960)
            ->minHeight(640)
            ->rememberState();

        MenuBar::create()
            ->icon(public_path('icon.png'))
            ->tooltip(config('app.name', 'LaraKube'))
            ->showDockIcon(true)
            ->onlyShowContextMenu()
            ->withContextMenu(
                Menu::make(
                    Menu::link(url('/'), 'Open LaraKube'),
                    Menu::separator(),
                    Menu::quit('Quit LaraKube'),
                )
            );
    }

    /** A local setup the app was closed during never got to remove its temporary sudo access. */
    private function closeInterruptedLocalSetup(): void
    {
        try {
            $interrupted = Run::query()->where('kind', RunKind::SetupLocal)->where('status', RunStatus::Running);

            if ($interrupted->exists()) {
                app(Elevation::class)->revoke();
                $interrupted->update(['status' => RunStatus::Failed, 'finished_at' => now()]);
            }
        } catch (\Throwable) {
            // The database may not be migrated yet on a first launch.
        }
    }

    /** Dispatches a background refresh for everything this app already knows about, so Tools/Mail are warm before the user clicks in. */
    private function warmSync(): void
    {
        try {
            SyncServersJob::dispatch();

            foreach (Server::where('status', 'ready')->whereNotNull('context')->get() as $server) {
                SyncClusterToolsJob::dispatch($server->id);

                if ($server->mailTool()?->installed) {
                    SyncMailJob::dispatch($server->id);
                }
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
        ];
    }
}
