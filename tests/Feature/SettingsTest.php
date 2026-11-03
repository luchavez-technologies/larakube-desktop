<?php

use App\Jobs\Sync\SyncCliWithDesktopJob;
use App\Models\Server;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Queue;
use Inertia\Testing\AssertableInertia;

test('settings page renders with global configuration and AI agents', function () {
    $this->get(route('settings.show'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('settings/index')
            ->has('settings')
            ->has('allowedTlds')
            ->has('cloudProviders')
            ->has('availableEditors')
            ->has('allEditors')
            ->where('settings.defaultEditor', 'vscode')
        );
});

test('defaultEditor preference can be saved to config and retrieved', function () {
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($home);
    $_SERVER['HOME'] = realpath($home);

    $settings = app(GlobalSettings::class);
    expect($settings->getDefaultEditor())->toBe('vscode');

    $this->post(route('settings.update'), [
        'defaultEditor' => 'claude',
    ])->assertRedirect();

    expect($settings->getDefaultEditor())->toBe('claude')
        ->and($settings->get()['defaultEditor'])->toBe('claude');

    $settings->setDefaultEditor('antigravity');
    expect($settings->getDefaultEditor())->toBe('antigravity');

    File::deleteDirectory($home);
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
    $prevEnv = getenv('USERPROFILE');
    $prevServer = $_SERVER['USERPROFILE'] ?? null;
    $resolvedProfile = (string) realpath($tempProfile);
    putenv("USERPROFILE={$resolvedProfile}");
    $_SERVER['USERPROFILE'] = $resolvedProfile;

    try {
        $locator = new ToolLocator(windows: true, wslFeatureEnabled: true);
        app()->instance(ToolLocator::class, $locator);
        $settings = new GlobalSettings($locator);
        app()->instance(GlobalSettings::class, $settings);

        $this->from(route('onboarding'))
            ->post(route('setup.usage'), ['usage' => 'tools'])
            ->assertRedirect(route('onboarding'));

        expect($settings->get()['usage'])->toBe('tools')
            ->and($settings->hideProjects())->toBeTrue();

        // Verify written to host profile
        $hostConfigFile = $resolvedProfile.'/.larakube/config.json';
        expect(File::exists($hostConfigFile))->toBeTrue();
        $decoded = json_decode((string) File::get($hostConfigFile), true);
        expect($decoded['usage'])->toBe('tools')
            ->and($decoded['hideProjects'])->toBeTrue();
    } finally {
        File::deleteDirectory($tempProfile);
        $prevEnv === false ? putenv('USERPROFILE') : putenv("USERPROFILE={$prevEnv}");
        if ($prevServer === null) {
            unset($_SERVER['USERPROFILE']);
        } else {
            $_SERVER['USERPROFILE'] = $prevServer;
        }
    }
});

test('Server::active hides servers marked hidden_in_demo when Demo Mode is enabled', function () {
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($home);
    $_SERVER['HOME'] = realpath($home);

    $hiddenServer = Server::create([
        'name' => 'luchtech-vps',
        'provider' => 'digitalocean',
        'kind' => 'vps',
        'status' => 'ready',
        'hidden_in_demo' => true,
    ]);
    $visibleServer = Server::create([
        'name' => 'orbstack',
        'provider' => 'orbstack',
        'kind' => 'local',
        'status' => 'ready',
        'hidden_in_demo' => false,
    ]);

    $settings = app(GlobalSettings::class);
    $settings->update(['demoMode' => false]);

    expect(Server::active()->pluck('name')->all())->toContain('luchtech-vps', 'orbstack');

    $this->post(route('settings.demo-mode'), [
        'demoMode' => true,
        'demoHiddenServers' => ['luchtech-vps'],
    ])->assertRedirect();

    expect($settings->demoMode())->toBeTrue()
        ->and($hiddenServer->fresh()->hidden_in_demo)->toBeTrue()
        ->and($visibleServer->fresh()->hidden_in_demo)->toBeFalse()
        ->and(Server::active()->pluck('name')->all())->toBe(['orbstack'])
        ->and(Server::activeUnfiltered()->pluck('name')->all())->toContain('luchtech-vps', 'orbstack');

    File::deleteDirectory($home);
});

test('switching release channel updates Desktop updater config and dispatches SyncCliWithDesktopJob', function () {
    Queue::fake();

    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($home);
    $_SERVER['HOME'] = realpath($home);

    $settings = app(GlobalSettings::class);
    expect($settings->releaseChannel())->toBe('canary');

    $this->post(route('settings.update'), [
        'cliChannel' => 'stable',
    ])->assertRedirect();

    expect($settings->releaseChannel())->toBe('stable')
        ->and(config('nativephp.updater.providers.github.channel'))->toBe('latest')
        ->and(config('nativephp.updater.providers.github.releaseType'))->toBe('release');

    Queue::assertPushed(SyncCliWithDesktopJob::class, fn (SyncCliWithDesktopJob $job) => $job->notify === true);

    File::deleteDirectory($home);
});

test('POST /settings/sync-cli dispatches SyncCliWithDesktopJob', function () {
    Queue::fake();

    $this->post(route('settings.sync-cli'))
        ->assertRedirect()
        ->assertSessionHas('success');

    Queue::assertPushed(SyncCliWithDesktopJob::class, fn (SyncCliWithDesktopJob $job) => $job->notify === true);
});

test('dashboard and servers pages hide demo-hidden servers when Demo Mode is enabled', function () {
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($home);
    $_SERVER['HOME'] = realpath($home);

    Server::create([
        'name' => 'luchtech-vps',
        'provider' => 'digitalocean',
        'kind' => 'vps',
        'status' => 'ready',
        'hidden_in_demo' => true,
    ]);
    Server::create([
        'name' => 'orbstack',
        'provider' => 'orbstack',
        'kind' => 'local',
        'status' => 'ready',
        'hidden_in_demo' => false,
    ]);

    $bin = "{$home}/bin";
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    $settings = app(GlobalSettings::class);
    $settings->completeOnboarding();
    $settings->update([
        'demoMode' => true,
        'demoHiddenServers' => ['luchtech-vps'],
    ]);

    $this->get(route('servers.index'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('servers/index')
            ->loadDeferredProps(fn (AssertableInertia $reload) => $reload
                ->has('servers', 1)
                ->where('servers.0.name', 'orbstack')
            )
        );

    $this->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('dashboard/index')
            ->loadDeferredProps(fn (AssertableInertia $reload) => $reload
                ->has('servers', 1)
                ->where('servers.0.name', 'orbstack')
                ->where('stats.serversCount', 1)
            )
        );

    File::deleteDirectory($home);
});

test('versions prop detects cliChannelMismatch when CLI version channel differs from configured channel', function () {
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($home);
    $_SERVER['HOME'] = realpath($home);

    app(GlobalSettings::class)->update(['cliChannel' => 'stable']);

    $readiness = mock(ReadinessCheck::class);
    $readiness->shouldReceive('status')->with('larakube')->andReturn([
        'installed' => true,
        'version' => 'LaraKube 0.50.0-canary.4',
    ]);
    app()->instance(ReadinessCheck::class, $readiness);

    $this->get(route('settings.show'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('versions.channel', 'stable')
            ->where('versions.cliDetectedChannel', 'canary')
            ->where('versions.cliChannelMismatch', true)
        );

    File::deleteDirectory($home);
});
