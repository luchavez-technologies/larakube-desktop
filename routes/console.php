<?php

use App\Jobs\Sync\SyncCliWithDesktopJob;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('icon:sync')->monthlyOn(1, '00:00');

// TEMPORARY, for active CLI development: canary moves fast enough that waiting
// for a Desktop update to also bring the CLI along (NativeAppServiceProvider's
// own version-change trigger) is too slow to be useful day to day. $notify:
// false keeps this quiet — canary has no "already latest" check of its own, so
// every run would otherwise "succeed" and notify even when nothing changed.
// Dial back to daily, or drop this schedule entirely, once releases settle down.
Schedule::job(new SyncCliWithDesktopJob(notify: false))
    ->hourly()
    ->when(fn () => app()->isProduction());
