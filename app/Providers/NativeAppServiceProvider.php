<?php

namespace App\Providers;

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\Elevation;
use Native\Desktop\Contracts\ProvidesPhpIni;
use Native\Desktop\Facades\Menu;
use Native\Desktop\Facades\MenuBar;
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
