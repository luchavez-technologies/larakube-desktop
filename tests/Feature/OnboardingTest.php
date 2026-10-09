<?php

use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Inertia\Testing\AssertableInertia;

function onboardingIsolatedHome(): string
{
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($home);
    $_SERVER['HOME'] = realpath($home);

    return $home;
}

function onboardingFakeBinDirectory(array $binaries = ['larakube']): string
{
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);

    foreach ($binaries as $binary) {
        File::put("{$directory}/{$binary}", "#!/bin/sh\n");
        chmod("{$directory}/{$binary}", 0755);
    }

    app()->instance(ToolLocator::class, new ToolLocator([$directory]));

    return $directory;
}

test('the wizard shows the current usage, provider choice, and a tool catalog filtered by it', function () {
    onboardingIsolatedHome();
    onboardingFakeBinDirectory();
    Process::fake(['*' => Process::result(output: '')]);

    $this->post('/onboarding/providers', ['providers' => ['do']])->assertRedirect();

    $this->get(route('onboarding'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('onboarding/index')
            ->where('intendedProviders', ['do'])
            ->where('usage', null)
            ->has('cloudProviders')
            ->where('catalog', fn ($catalog): bool => collect($catalog)->pluck('slug')->contains('aws') === false
                && collect($catalog)->pluck('slug')->contains('gcloud') === false
                && collect($catalog)->pluck('slug')->contains('larakube')));
});

test('an empty or missing provider choice shows every tool, not none', function () {
    onboardingIsolatedHome();
    onboardingFakeBinDirectory();
    Process::fake(['*' => Process::result(output: '')]);

    $this->get(route('onboarding'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('catalog', fn ($catalog): bool => collect($catalog)->pluck('slug')->contains('aws')
                && collect($catalog)->pluck('slug')->contains('gcloud')));
});

test('setProviders rejects a provider slug that does not exist', function () {
    onboardingIsolatedHome();

    $this->post('/onboarding/providers', ['providers' => ['nonsense']])
        ->assertSessionHasErrors('providers.0');
});

test('completing onboarding is remembered, and the wizard does not reappear', function () {
    onboardingIsolatedHome();

    expect(app(GlobalSettings::class)->hasCompletedOnboarding())->toBeFalse();

    $this->post('/onboarding/complete')->assertRedirect(route('dashboard'));

    expect(app(GlobalSettings::class)->hasCompletedOnboarding())->toBeTrue();
});

test('redoing onboarding from Settings sends the person back to the wizard', function () {
    onboardingIsolatedHome();
    $this->post('/onboarding/complete');

    $this->post('/onboarding/reset')->assertRedirect(route('onboarding'));

    expect(app(GlobalSettings::class)->hasCompletedOnboarding())->toBeFalse();
});
