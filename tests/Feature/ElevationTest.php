<?php

use App\Services\Elevation;
use Illuminate\Support\Facades\Process;

test('on Windows there is nothing to grant, because the distro user already has passwordless sudo', function () {
    Process::fake();
    $elevation = new Elevation(windows: true);

    expect($elevation->method())->toBe('distro')
        ->and($elevation->grant())->toBeTrue()
        ->and($elevation->revoke())->toBeTrue();

    Process::assertNothingRan();
});

test('on native macOS, administrator access is requested via osascript, the same GUI prompt pkexec gives on Linux', function () {
    Process::fake(['*command -v*osascript*' => Process::result('/usr/bin/osascript'), '*' => Process::result()]);
    $elevation = new Elevation(user: 'student', windows: false, darwin: true);

    expect($elevation->method())->toBe('osascript')
        ->and($elevation->grant())->toBeTrue();

    Process::assertRan(fn ($process) => $process->command[0] === 'osascript'
        && $process->command[1] === '-e'
        && str_contains($process->command[2], 'with administrator privileges')
        && str_contains($process->command[2], 'student ALL=(ALL) NOPASSWD:ALL')
        && str_contains($process->command[2], Elevation::SUDOERS_FILE));
});

test('revoking on native macOS removes the sudoers entry via osascript too', function () {
    Process::fake(['*command -v*osascript*' => Process::result('/usr/bin/osascript'), '*' => Process::result()]);
    $elevation = new Elevation(user: 'student', windows: false, darwin: true);

    expect($elevation->revoke())->toBeTrue();

    Process::assertRan(fn ($process) => $process->command[0] === 'osascript'
        && str_contains($process->command[2], "'rm'")
        && str_contains($process->command[2], "'-f'")
        && str_contains($process->command[2], Elevation::SUDOERS_FILE));
});

test('without osascript on the PATH, macOS has no elevation method and grant refuses rather than hanging on a password prompt', function () {
    Process::fake(['*osascript*' => Process::result('', exitCode: 1), '*' => Process::result()]);
    $elevation = new Elevation(user: 'student', windows: false, darwin: true);

    expect($elevation->method())->toBeNull()
        ->and($elevation->grant())->toBeFalse();
});
