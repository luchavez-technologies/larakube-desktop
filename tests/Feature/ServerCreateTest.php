<?php

use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ReadinessCheck;
use Illuminate\Support\Facades\File;
use Inertia\Testing\AssertableInertia;

test('the create server page is told the default cloud provider, to pre-select it', function () {
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($home);
    $_SERVER['HOME'] = realpath($home);

    app(GlobalSettings::class)->update(['defaultCloudProvider' => 'aws']);

    $readiness = mock(ReadinessCheck::class);
    $readiness->shouldReceive('providers')->andReturn([]);
    app()->instance(ReadinessCheck::class, $readiness);

    $this->get(route('servers.create'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('servers/create')
            ->where('defaultProvider', 'aws'));
});
