<?php

namespace App\Listeners;

use App\Services\LaraKube\GlobalSettings;
use App\Services\Wsl;
use Native\Desktop\Events\PowerMonitor\Shutdown;
use Native\Desktop\Events\Windows\WindowClosed;

/**
 * Cleanly shuts down or terminates the LaraKube WSL distribution when the desktop window
 * is closed or when the host computer initiates a system shutdown.
 */
class ShutdownWslOnWindowClose
{
    public function __construct(
        private Wsl $wsl,
        private GlobalSettings $settings,
    ) {}

    public function handleWindowClosed(WindowClosed $event): void
    {
        if ($event->id !== 'main') {
            return;
        }

        $this->performShutdown();
    }

    public function handlePowerShutdown(Shutdown $event): void
    {
        $this->performShutdown();
    }

    private function performShutdown(): void
    {
        if (! $this->wsl->isWindows()) {
            return;
        }

        $mode = $this->settings->wslShutdownMode();

        if ($mode === 'disabled') {
            return;
        }

        if ($mode === 'shutdown') {
            $this->wsl->shutdown();

            return;
        }

        // Default: 'terminate' (safely stops larakube-ubuntu distro without affecting other user distros)
        $this->wsl->terminate();
    }
}
