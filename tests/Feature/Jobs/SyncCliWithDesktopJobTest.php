<?php

use App\Jobs\Sync\SyncCliWithDesktopJob;
use App\Services\LaraKube\CliInstaller;
use App\Services\LaraKube\ToolLocator;
use App\Services\RunNotifier;
use App\Services\Wsl;
use Native\Desktop\Facades\Notification;

test('on Windows, a successful WSL CLI update passes the saved channel and notifies the user', function () {
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

    (new SyncCliWithDesktopJob)->handle($installer, app(ToolLocator::class), $wsl, app(RunNotifier::class));
});

test('the hourly, silent schedule syncs but never notifies, even on success', function () {
    $wsl = Mockery::mock(Wsl::class)->makePartial();
    $wsl->shouldReceive('isWindows')->andReturn(true);
    $wsl->shouldReceive('update')->once()->with(channel: 'stable')->andReturn(['ok' => true, 'message' => 'LaraKube Linux updated successfully.']);

    $installer = Mockery::mock(CliInstaller::class);
    $installer->shouldReceive('channel')->andReturn('stable');
    $installer->shouldNotReceive('install');

    Notification::shouldReceive('title')->never();

    (new SyncCliWithDesktopJob(notify: false))->handle($installer, app(ToolLocator::class), $wsl, app(RunNotifier::class));
});

test('on Windows, a failed WSL CLI update stays silent', function () {
    $wsl = Mockery::mock(Wsl::class)->makePartial();
    $wsl->shouldReceive('isWindows')->andReturn(true);
    $wsl->shouldReceive('update')->once()->andReturn(['ok' => false, 'message' => 'LaraKube Linux is not installed yet.']);

    $installer = Mockery::mock(CliInstaller::class);
    $installer->shouldReceive('channel')->andReturn('canary');
    $installer->shouldNotReceive('install');

    Notification::shouldReceive('title')->never();

    (new SyncCliWithDesktopJob)->handle($installer, app(ToolLocator::class), $wsl, app(RunNotifier::class));
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

    (new SyncCliWithDesktopJob)->handle($installer, $locator, $wsl, app(RunNotifier::class));
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

    (new SyncCliWithDesktopJob)->handle($installer, $locator, $wsl, app(RunNotifier::class));
});
