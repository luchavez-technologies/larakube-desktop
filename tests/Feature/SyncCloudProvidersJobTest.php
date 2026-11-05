<?php

use App\Jobs\Sync\SyncCloudProvidersJob;
use App\Services\LaraKube\ReadinessCheck;

test('sync cloud providers job calls readiness providers with fresh and statusOnly flags', function () {
    $readiness = mock(ReadinessCheck::class);
    $readiness->shouldReceive('providers')
        ->once()
        ->with(true, true)
        ->andReturn([]);

    $job = new SyncCloudProvidersJob;
    $job->handle($readiness);
});
