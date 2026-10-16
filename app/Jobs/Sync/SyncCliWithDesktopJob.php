<?php

namespace App\Jobs\Sync;

use App\Services\LaraKube\CliInstaller;
use App\Services\LaraKube\ToolLocator;
use App\Services\RunNotifier;
use App\Services\Wsl;

/**
 * Desktop depends on the CLI for nearly everything it does, and a new Desktop
 * feature often needs a CLI version it shipped alongside — so a Desktop
 * update is the signal to bring the CLI (and on Windows, the one running
 * inside the bundled WSL distro) up to the saved release channel too.
 *
 * Only for a machine that already has it: a first-time user who has never
 * been through Setup gets nothing here, since CliInstaller::install() and
 * Wsl::update() have no "is this actually set up" guard of their own on the
 * Unix side, and silently installing the CLI in the background before Setup
 * has even run would be a surprise, not a convenience.
 */
class SyncCliWithDesktopJob extends SyncJob
{
    protected function uniqueKey(): string
    {
        return 'desktop-version-change';
    }

    public function handle(CliInstaller $installer, ToolLocator $locator, Wsl $wsl, RunNotifier $notifier): void
    {
        $channel = $installer->channel();

        $synced = $wsl->isWindows()
            ? $wsl->update()['ok']
            : ($locator->find('larakube') !== null && $installer->install($channel)['success']);

        if ($synced) {
            $notifier->cliUpdated($channel);
        }
    }
}
