<?php

use App\Services\LaraKube\GlobalSettings;

test('the home route sends a computer without the CLI to Setup', function () {
    $settings = mock(GlobalSettings::class);
    $settings->shouldReceive('hasCompletedOnboarding')->andReturnTrue();
    $settings->shouldReceive('hideProjects')->andReturnFalse();
    $settings->shouldReceive('experimental')->andReturnFalse();
    app()->instance(GlobalSettings::class, $settings);

    $this->get(route('home'))->assertRedirect(route('readiness'));
});
