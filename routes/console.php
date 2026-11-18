<?php

use App\Jobs\Sync\SyncAllServerBackupsJob;
use App\Jobs\Sync\SyncAllServerClusterUsersJob;
use App\Jobs\Sync\SyncAllServerExternalDnsJob;
use App\Jobs\Sync\SyncAllServerPlexJob;
use App\Jobs\Sync\SyncAllServerTlsJob;
use App\Jobs\Sync\SyncCatalogToolsJob;
use App\Jobs\Sync\SyncCliWithDesktopJob;
use App\Jobs\Sync\SyncLocalClusterJob;
use App\Jobs\Sync\SyncLocalWorkloadsJob;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('icon:sync')->monthlyOn(1, '00:00');

// Local cluster status and local project replica counts are pushed via
// LocalWorkloadsSynced (and dispatched immediately by RecordRunOutput/warmSync),
// so a 1-minute tick is enough as the backstop for external terminal drift.
Schedule::job(new SyncLocalClusterJob)->everyMinute()->withoutOverlapping();

Schedule::job(new SyncLocalWorkloadsJob)->everyMinute()->withoutOverlapping();

// Cloud backup status is lower-stakes staleness than local cluster state —
// every few minutes is enough, and NativeAppServiceProvider::warmSync()
// already triggers an immediate sync on app boot.
Schedule::job(new SyncAllServerBackupsJob)->everyFiveMinutes()->withoutOverlapping();

// plex:show enumerates every installed Cluster Tool's Commons resources, so
// it is slower than backup:status — SyncPlexJob's own FRESH_SECONDS (1800)
// is the real floor; ticking every 10 minutes keeps it well under that
// without re-syncing more often than the data can usefully change.
Schedule::job(new SyncAllServerPlexJob)->everyTenMinutes()->withoutOverlapping();

// Servers detail page's dns/tls/clusterUsers cards — same reasoning as
// plex above, matching each per-server job's own FRESH_SECONDS (1800).
Schedule::job(new SyncAllServerExternalDnsJob)->everyTenMinutes()->withoutOverlapping();
Schedule::job(new SyncAllServerTlsJob)->everyTenMinutes()->withoutOverlapping();
Schedule::job(new SyncAllServerClusterUsersJob)->everyTenMinutes()->withoutOverlapping();

// Global Official + Community Cluster App catalog syncs incrementally via
// `--updated-since` so hundreds of future marketplace tools stay fresh without
// re-pulling every server.
Schedule::job(new SyncCatalogToolsJob)->hourly()->withoutOverlapping();

// TEMPORARY, for active CLI development: canary moves fast enough that waiting
// for a Desktop update to also bring the CLI along (NativeAppServiceProvider's
// own version-change trigger) is too slow to be useful day to day. $notify:
// false keeps this quiet — canary has no "already latest" check of its own, so
// every run would otherwise "succeed" and notify even when nothing changed.
// Dial back to daily, or drop this schedule entirely, once releases settle down.
Schedule::job(new SyncCliWithDesktopJob(notify: false))
    ->hourly()
    ->when(fn () => app()->isProduction());
