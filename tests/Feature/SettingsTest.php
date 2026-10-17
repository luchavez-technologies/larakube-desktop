<?php

use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Inertia\Testing\AssertableInertia;

test('settings page renders with global configuration and AI agents', function () {
    $this->get(route('settings.show'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('settings/index')
            ->has('settings')
            ->has('allowedTlds')
            ->has('cloudProviders')
        );
});

test('settings can be updated and saved to config', function () {
    $settings = mock(GlobalSettings::class);
    $settings->shouldReceive('hideProjects')->andReturnFalse();
    $settings->shouldReceive('experimental')->andReturnFalse();
    $settings->shouldReceive('demoMode')->andReturnFalse();
    $settings->shouldReceive('update')->once()->with(Mockery::on(function (array $data): bool {
        return ($data['localTld'] ?? null) === 'test'
            && ($data['email'] ?? null) === 'admin@example.com';
    }));
    app()->instance(GlobalSettings::class, $settings);

    $this->post(route('settings.update'), [
        'localTld' => 'test',
        'email' => 'admin@example.com',
    ])->assertRedirect();
});

test('bridging an AI agent configures MCP servers', function () {
    $settings = mock(GlobalSettings::class);
    $settings->shouldReceive('hideProjects')->andReturnFalse();
    $settings->shouldReceive('experimental')->andReturnFalse();
    $settings->shouldReceive('demoMode')->andReturnFalse();
    $settings->shouldReceive('bridge')->with('antigravity')->once()->andReturnTrue();
    app()->instance(GlobalSettings::class, $settings);

    $this->post(route('settings.bridge', ['agent' => 'antigravity']))
        ->assertRedirect()
        ->assertSessionHas('success');
});

test('hideProjects preference can be saved to config', function () {
    $settings = mock(GlobalSettings::class);
    $settings->shouldReceive('hideProjects')->andReturnTrue();
    $settings->shouldReceive('experimental')->andReturnFalse();
    $settings->shouldReceive('demoMode')->andReturnFalse();
    $settings->shouldReceive('update')->once()->with(Mockery::on(function (array $data): bool {
        return ($data['hideProjects'] ?? null) === true;
    }));
    app()->instance(GlobalSettings::class, $settings);

    $this->post(route('settings.update'), [
        'hideProjects' => true,
    ])->assertRedirect();
});

test('global settings bridges only larakube-cli without larakube-console', function () {
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists("{$home}/.gemini");
    $_SERVER['HOME'] = realpath($home);

    $settings = app(GlobalSettings::class);
    $bridged = $settings->bridge('antigravity');

    expect($bridged)->toBeTrue();
    $config = json_decode((string) File::get("{$home}/.gemini/antigravity.json"), true);
    expect($config['mcpServers'])->toHaveKey('larakube-cli')
        ->and($config['mcpServers'])->not->toHaveKey('larakube-console');

    File::deleteDirectory($home);
});

test('theme can be switched via dedicated endpoint', function () {
    $this->post(route('settings.theme'), [
        'theme' => 'dark',
    ])->assertRedirect()
        ->assertSessionHas('success', 'Theme updated.');
});

test('theme validation rejects invalid themes', function () {
    $this->post(route('settings.theme'), [
        'theme' => 'invalid-theme',
    ])->assertSessionHasErrors(['theme']);
});

test('theme can be updated via general settings update', function () {
    $this->post(route('settings.update'), [
        'theme' => 'light',
    ])->assertRedirect()
        ->assertSessionHas('success', 'Settings updated.');
});

test('global settings gets and sets theme', function () {
    $settings = app(GlobalSettings::class);
    $settings->setTheme('dark');
    expect($settings->getTheme())->toBe('dark');

    $settings->setTheme('system');
    expect($settings->getTheme())->toBe('system');
});

test('global settings gets and sets demo mode and its hidden-server list', function () {
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($home);
    $_SERVER['HOME'] = realpath($home);

    $settings = app(GlobalSettings::class);

    expect($settings->demoMode())->toBeFalse()
        ->and($settings->demoHiddenServers())->toBe([]);

    $settings->update([
        'demoMode' => true,
        'demoHiddenServers' => ['prod-main', 'client-acme'],
    ]);

    expect($settings->demoMode())->toBeTrue()
        ->and($settings->demoHiddenServers())->toBe(['prod-main', 'client-acme'])
        ->and($settings->get()['demoMode'])->toBeTrue()
        ->and($settings->get()['demoHiddenServers'])->toBe(['prod-main', 'client-acme']);

    $settings->update(['demoMode' => false]);

    expect($settings->demoMode())->toBeFalse()
        ->and($settings->demoHiddenServers())->toBe(['prod-main', 'client-acme']);

    File::deleteDirectory($home);
});

test('demo mode is shared to every Inertia page like hideProjects and experimental', function () {
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($home);
    $_SERVER['HOME'] = realpath($home);
    app(GlobalSettings::class)->update(['demoMode' => true]);

    $this->get(route('settings.show'))
        ->assertInertia(fn (AssertableInertia $page) => $page->where('demoMode', true));

    File::deleteDirectory($home);
});

test('usage choice can be set on Windows without WSL being installed or accessible', function () {
    $tempProfile = storage_path('framework/testing/win-profile-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($tempProfile);
    $_SERVER['USERPROFILE'] = realpath($tempProfile);

    $locator = new ToolLocator(windows: true);
    app()->instance(ToolLocator::class, $locator);
    $settings = new GlobalSettings($locator);
    app()->instance(GlobalSettings::class, $settings);

    $this->from(route('onboarding'))
        ->post(route('setup.usage'), ['usage' => 'tools'])
        ->assertRedirect(route('onboarding'));

    expect($settings->get()['usage'])->toBe('tools')
        ->and($settings->hideProjects())->toBeTrue();

    // Verify written to host profile
    $hostConfigFile = realpath($tempProfile).'/.larakube/config.json';
    expect(File::exists($hostConfigFile))->toBeTrue();
    $decoded = json_decode((string) File::get($hostConfigFile), true);
    expect($decoded['usage'])->toBe('tools')
        ->and($decoded['hideProjects'])->toBeTrue();

    File::deleteDirectory($tempProfile);
    unset($_SERVER['USERPROFILE']);
});
