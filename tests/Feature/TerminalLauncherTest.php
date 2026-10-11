<?php

use App\Services\TerminalLauncher;
use Illuminate\Support\Facades\Process;

test('on macOS, a new Terminal window runs the command via osascript', function () {
    Process::fake();
    $launcher = new TerminalLauncher(windows: false, darwin: true);

    expect($launcher->open('ssh welcome-ec2'))->toBeTrue();

    Process::assertRan(fn ($process): bool => $process->command === [
        'osascript',
        '-e',
        'tell application "Terminal" to do script "ssh welcome-ec2"',
        '-e',
        'tell application "Terminal" to activate',
    ]);
});

test('a command containing quotes is escaped for the AppleScript string, not left to break out of it', function () {
    Process::fake();
    $launcher = new TerminalLauncher(windows: false, darwin: true);

    $launcher->open('echo "hi"');

    Process::assertRan(fn ($process): bool => $process->command[2] === 'tell application "Terminal" to do script "echo \\"hi\\""');
});

test('on Windows, the command runs inside the bundled WSL distro, in Windows Terminal when it is present', function () {
    Process::fake([
        '*wt.exe*' => Process::result(),
        '*' => Process::result(),
    ]);
    $launcher = new TerminalLauncher(windows: true, darwin: false);

    $launcher->open('k9s --context=foo');

    Process::assertRan(fn ($process): bool => $process->command === [
        'wt.exe',
        'cmd',
        '/k',
        'wsl.exe -d larakube-ubuntu --user larakube -- k9s --context=foo',
    ]);
});

test('on Windows without Windows Terminal, it falls back to a plain console host', function () {
    Process::fake([
        '*wt.exe*' => Process::result(exitCode: 1),
        '*' => Process::result(),
    ]);
    $launcher = new TerminalLauncher(windows: true, darwin: false);

    $launcher->open('k9s --context=foo');

    Process::assertRan(fn ($process): bool => $process->command === [
        'cmd',
        '/c',
        'start',
        'cmd',
        '/k',
        'wsl.exe -d larakube-ubuntu --user larakube -- k9s --context=foo',
    ]);
});

test('on Linux, the first available terminal emulator is used', function () {
    Process::fake([
        '*x-terminal-emulator*' => Process::result(exitCode: 1),
        '*gnome-terminal*' => Process::result(),
        '*' => Process::result(),
    ]);
    $launcher = new TerminalLauncher(windows: false, darwin: false);

    expect($launcher->open('ssh welcome-ec2'))->toBeTrue();

    Process::assertRan(fn ($process): bool => $process->command === [
        'gnome-terminal',
        '--',
        'bash',
        '-lc',
        'ssh welcome-ec2; exec bash',
    ]);
});

test('on Linux with no terminal emulator found, nothing runs and it reports failure', function () {
    Process::fake(['*' => Process::result(exitCode: 1)]);
    $launcher = new TerminalLauncher(windows: false, darwin: false);

    expect($launcher->open('ssh welcome-ec2'))->toBeFalse();
});
