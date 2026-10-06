<?php

use App\Services\Wsl;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Process;

function wslHome(): string
{
    $path = sys_get_temp_dir().'/larakube-wsl-'.bin2hex(random_bytes(6));
    mkdir($path, 0777, true);
    putenv('LOCALAPPDATA='.$path);

    return $path;
}

function wslUtf16(string $text): string
{
    return "\xFF\xFE".mb_convert_encoding($text, 'UTF-16LE', 'UTF-8');
}

function wslListing(string ...$lines): string
{
    return wslUtf16("  NAME            STATE           VERSION\n".implode("\n", $lines)."\n");
}

test('a Windows computer without WSL is offered to turn it on', function () {
    Process::fake(['*' => Process::result(errorOutput: 'not recognized', exitCode: 1)]);

    $result = (new Wsl(windows: true))->check();

    expect($result['state'])->toBe('missing')
        ->and($result['command'])->toBe('wsl --install --no-distribution');
});

test('a user\'s own distribution does not count as LaraKube Linux', function () {
    Process::fake([
        '*--status*' => Process::result(output: wslUtf16('Default Version: 2')),
        '*--list*' => Process::result(output: wslListing('* Ubuntu           Running   2')),
    ]);

    expect((new Wsl(windows: true))->check()['state'])->toBe('no-distro');
});

test('a WSL 1 distribution is asked to be converted', function () {
    Process::fake([
        '*--status*' => Process::result(output: wslUtf16('Default Version: 2')),
        '*--list*' => Process::result(output: wslListing('* larakube-ubuntu Stopped   1')),
    ]);

    $result = (new Wsl(windows: true))->check();

    expect($result['state'])->toBe('old-version')
        ->and($result['command'])->toBe('wsl --set-version larakube-ubuntu 2');
});

test('a stopped WSL 2 distribution counts as ready once it answers a command', function () {
    Process::fake([
        '*--status*' => Process::result(output: wslUtf16('Default Version: 2')),
        '*--list*' => Process::result(output: wslListing('  docker-desktop   Running   2', '* larakube-ubuntu Stopped   2')),
        '*echo*' => Process::result(output: "ok\n"),
    ]);

    $result = (new Wsl(windows: true))->check();

    expect($result)->toMatchArray(['state' => 'ready', 'distro' => 'larakube-ubuntu', 'version' => 2]);
    Process::assertRan(fn ($process) => in_array('larakube-ubuntu', (array) $process->command, true) && in_array('echo', (array) $process->command, true));
});

test('a distribution that will not start is reported as broken', function () {
    Process::fake([
        '*--status*' => Process::result(output: wslUtf16('Default Version: 2')),
        '*--list*' => Process::result(output: wslListing('* larakube-ubuntu Stopped   2')),
        '*echo*' => Process::result(errorOutput: 'WSL 2 requires an update', exitCode: 1),
    ]);

    expect((new Wsl(windows: true))->check()['state'])->toBe('broken');
});

test('the image is downloaded, checked against its published checksum, and kept only when it matches', function () {
    $home = wslHome();
    $body = 'rootfs bytes';

    Http::fake([
        '*.sha256' => Http::response(hash('sha256', $body).'  larakube-ubuntu-amd64.tar.gz'),
        '*' => Http::response($body),
    ]);

    $result = (new Wsl(windows: true))->download();

    expect($result['ok'])->toBeTrue()
        ->and(file_get_contents($home.'/LaraKube/wsl/larakube-ubuntu.tar.gz'))->toBe($body);
});

test('a download that does not match its checksum is deleted', function () {
    $home = wslHome();

    Http::fake([
        '*.sha256' => Http::response(str_repeat('a', 64)),
        '*' => Http::response('tampered'),
    ]);

    $result = (new Wsl(windows: true))->download();

    expect($result['ok'])->toBeFalse()
        ->and(file_exists($home.'/LaraKube/wsl/larakube-ubuntu.tar.gz'))->toBeFalse();
});

test('importing creates the distro once and restarts it, and a second run does not import again', function () {
    $home = wslHome();
    mkdir($home.'/LaraKube/wsl', 0777, true);
    file_put_contents($home.'/LaraKube/wsl/larakube-ubuntu.tar.gz', 'x');

    Process::fake([
        '*--list*' => Process::sequence()
            ->push(Process::result(output: wslListing()))
            ->push(Process::result(output: wslListing('* larakube-ubuntu Stopped   2'))),
        '*' => Process::result(),
    ]);

    expect((new Wsl(windows: true))->import()['ok'])->toBeTrue()
        ->and((new Wsl(windows: true))->import()['ok'])->toBeTrue();

    Process::assertRanTimes(fn ($process) => in_array('--import', (array) $process->command, true), 1);
    Process::assertRanTimes(fn ($process) => in_array('--terminate', (array) $process->command, true), 2);
});

test('resetting removes only the LaraKube distro, and is harmless when it is already gone', function () {
    Process::fake([
        '*--list*' => Process::sequence()
            ->push(Process::result(output: wslListing('* Ubuntu           Stopped   2', '  larakube-ubuntu   Stopped   2')))
            ->push(Process::result(output: wslListing('* Ubuntu           Stopped   2'))),
        '*' => Process::result(),
    ]);

    expect((new Wsl(windows: true))->reset()['ok'])->toBeTrue()
        ->and((new Wsl(windows: true))->reset()['ok'])->toBeTrue();

    Process::assertRanTimes(fn ($process) => in_array('--unregister', (array) $process->command, true), 1);
    Process::assertNotRan(fn ($process) => in_array('Ubuntu', (array) $process->command, true));
});

test('terminate stops the larakube distro or a custom distro', function () {
    Process::fake();

    $wsl = new Wsl(windows: true);
    expect($wsl->terminate())->toBeTrue();
    expect($wsl->terminate('custom-distro'))->toBeTrue();

    Process::assertRan(fn ($process) => (array) $process->command === ['wsl.exe', '--terminate', 'larakube-ubuntu']);
    Process::assertRan(fn ($process) => (array) $process->command === ['wsl.exe', '--terminate', 'custom-distro']);
});

test('shutdown shuts down the entire wsl virtual machine', function () {
    Process::fake();

    $wsl = new Wsl(windows: true);
    expect($wsl->shutdown())->toBeTrue();

    Process::assertRan(fn ($process) => (array) $process->command === ['wsl.exe', '--shutdown']);
});

test('terminate and shutdown do nothing on non-windows computers', function () {
    Process::fake();

    $wsl = new Wsl(windows: false);
    expect($wsl->terminate())->toBeFalse();
    expect($wsl->shutdown())->toBeFalse();

    Process::assertNothingRan();
});
