<?php

use App\Jobs\Sync\SyncCliWithDesktopJob;
use App\Services\LaraKube\CliInstaller;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ToolLocator;
use App\Services\RunNotifier;
use App\Services\Wsl;
use Native\Desktop\Facades\Notification;

test('on Windows with usage=apps, a successful WSL CLI update passes the saved channel and notifies the user', function () {
    app(GlobalSettings::class)->update(['usage' => 'apps']);

    $wsl = Mockery::mock(Wsl::class)->makePartial();
    $wsl->shouldReceive('isWindows')->andReturn(true);
    $wsl->shouldReceive('update')->once()->with(channel: 'canary')->andReturn(['ok' => true, 'message' => 'LaraKube Linux updated successfully.']);
    app()->instance(Wsl::class, $wsl);

    $installer = Mockery::mock(CliInstaller::class);
    $installer->shouldReceive('channel')->andReturn('canary');
    $installer->shouldNotReceive('install');
    app()->instance(CliInstaller::class, $installer);

    Notification::shouldReceive('title')->once()->with('LaraKube CLI synced')->andReturnSelf();
    Notification::shouldReceive('message')->once()->andReturnSelf();
    Notification::shouldReceive('reference')->once()->with('cli-update')->andReturnSelf();
    Notification::shouldReceive('show')->once();

    (new SyncCliWithDesktopJob)->handle($installer, app(ToolLocator::class), $wsl, app(GlobalSettings::class), app(RunNotifier::class));
});

test('the hourly, silent schedule syncs but never notifies, even on success', function () {
    app(GlobalSettings::class)->update(['usage' => 'apps']);

    $wsl = Mockery::mock(Wsl::class)->makePartial();
    $wsl->shouldReceive('isWindows')->andReturn(true);
    $wsl->shouldReceive('update')->once()->with(channel: 'stable')->andReturn(['ok' => true, 'message' => 'LaraKube Linux updated successfully.']);

    $installer = Mockery::mock(CliInstaller::class);
    $installer->shouldReceive('channel')->andReturn('stable');
    $installer->shouldNotReceive('install');

    Notification::shouldReceive('title')->never();

    (new SyncCliWithDesktopJob(notify: false))->handle($installer, app(ToolLocator::class), $wsl, app(GlobalSettings::class), app(RunNotifier::class));
});

test('on Windows with usage=apps, a failed WSL CLI update stays silent', function () {
    app(GlobalSettings::class)->update(['usage' => 'apps']);

    $wsl = Mockery::mock(Wsl::class)->makePartial();
    $wsl->shouldReceive('isWindows')->andReturn(true);
    $wsl->shouldReceive('update')->once()->andReturn(['ok' => false, 'message' => 'LaraKube Linux is not installed yet.']);

    $installer = Mockery::mock(CliInstaller::class);
    $installer->shouldReceive('channel')->andReturn('canary');
    $installer->shouldNotReceive('install');

    Notification::shouldReceive('title')->never();

    (new SyncCliWithDesktopJob)->handle($installer, app(ToolLocator::class), $wsl, app(GlobalSettings::class), app(RunNotifier::class));
});

test('on Windows with usage=tools, the native larakube.exe is synced instead — never through WSL', function () {
    // usage === 'tools' never needs WSL at all; confirmed live (2026-10-30)
    // that even Wsl::update()'s own distro() lookup can trigger Windows's
    // native "WSL is not installed" prompt, so this must route through the
    // same no-WSL CliInstaller path macOS/Linux already use.
    app(GlobalSettings::class)->update(['usage' => 'tools']);

    $wsl = Mockery::mock(Wsl::class)->makePartial();
    $wsl->shouldReceive('isWindows')->andReturn(true);
    $wsl->shouldNotReceive('update');

    $installer = Mockery::mock(CliInstaller::class);
    $installer->shouldReceive('channel')->andReturn('canary');
    $installer->shouldReceive('install')->once()->with('canary')->andReturn(['success' => true, 'path' => 'C:\\fake\\larakube.exe', 'error' => null]);

    $locator = Mockery::mock(ToolLocator::class);
    $locator->shouldReceive('find')->once()->with('larakube')->andReturn('C:\\fake\\larakube.exe');

    Notification::shouldReceive('title')->once()->with('LaraKube CLI synced')->andReturnSelf();
    Notification::shouldReceive('message')->once()->andReturnSelf();
    Notification::shouldReceive('reference')->once()->with('cli-update')->andReturnSelf();
    Notification::shouldReceive('show')->once();

    (new SyncCliWithDesktopJob)->handle($installer, $locator, $wsl, app(GlobalSettings::class), app(RunNotifier::class));
});

test('on macOS/Linux, a machine that never ran Setup is left alone', function () {
    $wsl = Mockery::mock(Wsl::class)->makePartial();
    $wsl->shouldReceive('isWindows')->andReturn(false);

    $installer = Mockery::mock(CliInstaller::class);
    $installer->shouldReceive('channel')->andReturn('stable');
    $installer->shouldNotReceive('install');

    $locator = Mockery::mock(ToolLocator::class);
    $locator->shouldReceive('find')->once()->with('larakube')->andReturn(null);

    Notification::shouldReceive('title')->never();

    (new SyncCliWithDesktopJob)->handle($installer, $locator, $wsl, app(GlobalSettings::class), app(RunNotifier::class));
});

test('on macOS/Linux, a machine that already has the CLI gets reinstalled on its saved channel and notified', function () {
    $wsl = Mockery::mock(Wsl::class)->makePartial();
    $wsl->shouldReceive('isWindows')->andReturn(false);

    $installer = Mockery::mock(CliInstaller::class);
    $installer->shouldReceive('channel')->andReturn('stable');
    $installer->shouldReceive('install')->once()->with('stable')->andReturn(['success' => true, 'path' => '/fake/larakube', 'error' => null]);

    $locator = Mockery::mock(ToolLocator::class);
    $locator->shouldReceive('find')->once()->with('larakube')->andReturn('/fake/larakube');

    Notification::shouldReceive('title')->once()->with('LaraKube CLI synced')->andReturnSelf();
    Notification::shouldReceive('message')->once()->andReturnSelf();
    Notification::shouldReceive('reference')->once()->with('cli-update')->andReturnSelf();
    Notification::shouldReceive('show')->once();

    (new SyncCliWithDesktopJob)->handle($installer, $locator, $wsl, app(GlobalSettings::class), app(RunNotifier::class));
});
