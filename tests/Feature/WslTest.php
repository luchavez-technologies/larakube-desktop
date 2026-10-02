<?php

use App\Services\Wsl;
use Illuminate\Support\Facades\Process;

function wslUtf16(string $text): string
{
    return "\xFF\xFE".mb_convert_encoding($text, 'UTF-16LE', 'UTF-8');
}

function wslListing(string ...$lines): string
{
    return wslUtf16("  NAME            STATE           VERSION\n".implode("\n", $lines)."\n");
}

test('a Windows computer without WSL is told how to install it', function () {
    Process::fake(['*' => Process::result(errorOutput: 'not recognized', exitCode: 1)]);

    $result = (new Wsl(windows: true))->check();

    expect($result['state'])->toBe('missing')
        ->and($result['command'])->toBe('wsl --install -d Ubuntu');
});

test('WSL with no Linux distribution is reported as such', function () {
    Process::fake([
        '*--status*' => Process::result(output: wslUtf16('Default Version: 2')),
        '*--list*' => Process::result(output: wslListing('* docker-desktop   Running   2')),
    ]);

    expect((new Wsl(windows: true))->check()['state'])->toBe('no-distro');
});

test('a WSL 1 distribution is asked to be converted', function () {
    Process::fake([
        '*--status*' => Process::result(output: wslUtf16('Default Version: 2')),
        '*--list*' => Process::result(output: wslListing('* Ubuntu           Stopped   1')),
    ]);

    $result = (new Wsl(windows: true))->check();

    expect($result['state'])->toBe('old-version')
        ->and($result['command'])->toBe('wsl --set-version Ubuntu 2');
});

test('a stopped WSL 2 distribution counts as ready once it answers a command', function () {
    Process::fake([
        '*--status*' => Process::result(output: wslUtf16('Default Version: 2')),
        '*--list*' => Process::result(output: wslListing('  docker-desktop   Running   2', '* Ubuntu           Stopped   2')),
        '*echo*' => Process::result(output: "ok\n"),
    ]);

    $result = (new Wsl(windows: true))->check();

    expect($result)->toMatchArray(['state' => 'ready', 'distro' => 'Ubuntu', 'version' => 2]);
    Process::assertRan(fn ($process) => in_array('Ubuntu', (array) $process->command, true) && in_array('echo', (array) $process->command, true));
});

test('a distribution that will not start is reported as broken', function () {
    Process::fake([
        '*--status*' => Process::result(output: wslUtf16('Default Version: 2')),
        '*--list*' => Process::result(output: wslListing('* Ubuntu           Stopped   2')),
        '*echo*' => Process::result(errorOutput: 'WSL 2 requires an update', exitCode: 1),
    ]);

    expect((new Wsl(windows: true))->check()['state'])->toBe('broken');
});
