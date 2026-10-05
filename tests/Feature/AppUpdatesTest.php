<?php

use App\Services\AppUpdates;
use Illuminate\Support\Facades\Cache;
use Native\Desktop\Events\AutoUpdater\DownloadProgress;
use Native\Desktop\Events\AutoUpdater\UpdateAvailable;
use Native\Desktop\Events\AutoUpdater\UpdateDownloaded;
use Native\Desktop\Events\AutoUpdater\UpdateNotAvailable;
use Native\Desktop\Facades\AutoUpdater;

beforeEach(fn () => Cache::flush());

test('the updater events become a status the Settings card can show', function () {
    $updates = app(AppUpdates::class);

    event(new UpdateAvailable('0.0.1-canary.19', [], '2026-10-05', null, null));
    expect($updates->status())->toMatchArray(['state' => 'downloading', 'latest' => '0.0.1-canary.19']);

    event(new DownloadProgress(100, 10, 50, 50.4, 10));
    expect($updates->status()['percent'])->toBe(50);

    event(new UpdateDownloaded('/tmp/x', '0.0.1-canary.19', [], '2026-10-05'));
    expect($updates->status())->toMatchArray(['state' => 'ready', 'percent' => 100]);

    event(new UpdateNotAvailable('0.0.1-canary.19', [], '2026-10-05', null, null));
    expect($updates->status()['state'])->toBe('current');
});

test('checking and installing do nothing when the updater is off in this build', function () {
    config(['nativephp.updater.enabled' => false]);
    AutoUpdater::shouldReceive('checkForUpdates')->never();

    $this->post('/updates/check')->assertNotFound();
    $this->post('/updates/install')->assertNotFound();
    $this->getJson('/updates')->assertOk()->assertJson(['enabled' => false]);
});
