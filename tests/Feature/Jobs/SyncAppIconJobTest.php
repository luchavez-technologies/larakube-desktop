<?php

use App\Jobs\Sync\SyncAppIconJob;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;

beforeEach(function () {
    $this->metaPath = storage_path('app/branding/current.json');
    File::ensureDirectoryExists(storage_path('app/branding'));
});

test('SyncAppIconJob triggers icon:sync when branding is stale or missing', function () {
    if (file_exists($this->metaPath)) {
        @unlink($this->metaPath);
    }

    Artisan::spy();

    $job = new SyncAppIconJob;
    $job->handle();

    Artisan::shouldHaveReceived('call')
        ->with('icon:sync')
        ->once();
});

test('SyncAppIconJob skips sync when branding was updated recently', function () {
    file_put_contents($this->metaPath, json_encode([
        'theme' => 'recent',
        'updated_at' => now()->subDays(5)->toIso8601String(),
    ]));

    Artisan::spy();

    $job = new SyncAppIconJob;
    $job->handle();

    Artisan::shouldNotHaveReceived('call');
});
