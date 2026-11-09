<?php

namespace App\Listeners;

use Native\Desktop\Events\PowerMonitor\Shutdown;
use Native\Desktop\Events\Windows\WindowClosed;
use Native\Desktop\Facades\ChildProcess;
use Throwable;

/** Cleanly stops the persistent MCP HTTP socket server when the desktop window is closed or on host shutdown. */
class StopMcpHttpOnShutdown
{
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
        try {
            ChildProcess::stop('mcp-http');
        } catch (Throwable) {
            // Electron client or child process may already be down.
        }
    }
}
