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
 * Also run hourly (routes/console.php) while canary is moving fast during
 * active development — dial that back (or remove it) once releases settle
 * down; the $notify=false there keeps that cadence from spamming a
 * notification every hour for something that may not have changed, since
 * canary has no "already latest" check of its own to detect a no-op update.
 *
 * Only for a machine that already has it: a first-time user who has never
 * been through Setup gets nothing here, since CliInstaller::install() and
 * Wsl::update() have no "is this actually set up" guard of their own on the
 * Unix side, and silently installing the CLI in the background before Setup
 * has even run would be a surprise, not a convenience.
 */
class SyncCliWithDesktopJob extends SyncJob
{
    public function __construct(private readonly bool $notify = true) {}

    protected function uniqueKey(): string
    {
        return $this->notify ? 'desktop-version-change' : 'hourly-channel-check';
    }

    public function handle(CliInstaller $installer, ToolLocator $locator, Wsl $wsl, RunNotifier $notifier): void
    {
        $channel = $installer->channel();

        $synced = $wsl->isWindows()
            ? $wsl->update(channel: $channel)['ok']
            : ($locator->find('larakube') !== null && $installer->install($channel)['success']);

        if ($synced && $this->notify) {
            $notifier->cliUpdated($channel);
        }
    }
}
