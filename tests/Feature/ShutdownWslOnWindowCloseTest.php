<?php

use App\Services\LaraKube\GlobalSettings;
use App\Services\Wsl;
use Illuminate\Support\Facades\Process;
use Native\Desktop\Events\PowerMonitor\Shutdown;
use Native\Desktop\Events\Windows\WindowClosed;

test('closing the main window on Windows terminates the LaraKube distro by default', function () {
    Process::fake();

    $wsl = new Wsl(windows: true);
    app()->instance(Wsl::class, $wsl);

    event(new WindowClosed('main'));

    Process::assertRan(fn ($process) => (array) $process->command === ['wsl.exe', '--terminate', 'larakube-ubuntu']);
});

test('closing a non-main window does not shut down WSL', function () {
    Process::fake();

    $wsl = new Wsl(windows: true);
    app()->instance(Wsl::class, $wsl);

    event(new WindowClosed('logs'));

    Process::assertNothingRan();
});

test('closing the main window with shutdown mode shuts down entire WSL VM', function () {
    Process::fake();

    $wsl = new Wsl(windows: true);
    app()->instance(Wsl::class, $wsl);

    $settings = mock(GlobalSettings::class);
    $settings->shouldReceive('wslShutdownMode')->andReturn('shutdown');
    app()->instance(GlobalSettings::class, $settings);

    event(new WindowClosed('main'));

    Process::assertRan(fn ($process) => (array) $process->command === ['wsl.exe', '--shutdown']);
});

test('closing the main window with disabled mode does not shut down WSL', function () {
    Process::fake();

    $wsl = new Wsl(windows: true);
    app()->instance(Wsl::class, $wsl);

    $settings = mock(GlobalSettings::class);
    $settings->shouldReceive('wslShutdownMode')->andReturn('disabled');
    app()->instance(GlobalSettings::class, $settings);

    event(new WindowClosed('main'));

    Process::assertNothingRan();
});

test('power monitor system shutdown on Windows triggers WSL termination', function () {
    Process::fake();

    $wsl = new Wsl(windows: true);
    app()->instance(Wsl::class, $wsl);

    event(new Shutdown);

    Process::assertRan(fn ($process) => (array) $process->command === ['wsl.exe', '--terminate', 'larakube-ubuntu']);
});

test('closing window on non-Windows does nothing', function () {
    Process::fake();

    $wsl = new Wsl(windows: false);
    app()->instance(Wsl::class, $wsl);

    event(new WindowClosed('main'));

    Process::assertNothingRan();
});
