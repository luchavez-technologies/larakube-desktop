<?php

use App\Services\Wsl;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
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
        '*which*dnsmasq*' => Process::result(output: "/usr/sbin/dnsmasq\n"),
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

test('a running distribution is reported as ready', function () {
    Process::fake([
        '*--status*' => Process::result(output: wslUtf16('Default Version: 2')),
        '*--list*' => Process::result(output: wslListing('* larakube-ubuntu Running   2')),
        '*echo*' => Process::result(output: "ok\n"),
    ]);

    expect((new Wsl(windows: true))->check()['state'])->toBe('ready');
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

test('download progress returns default state when no download is in progress', function () {
    Cache::forget('wsl.download.progress');

    $wsl = new Wsl(windows: true);
    expect($wsl->downloadProgress())->toBe([
        'total' => 0,
        'downloaded' => 0,
        'percent' => 0,
        'formatted' => null,
    ]);
});

test('download progress reads cached progress values', function () {
    Cache::put('wsl.download.progress', [
        'total' => 500000000,
        'downloaded' => 250000000,
        'percent' => 50,
        'formatted' => '238.4 MB / 476.8 MB',
    ]);

    $wsl = new Wsl(windows: true);
    expect($wsl->downloadProgress())->toBe([
        'total' => 500000000,
        'downloaded' => 250000000,
        'percent' => 50,
        'formatted' => '238.4 MB / 476.8 MB',
    ]);
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

test('updating runs larakube update --yes inside the distro without touching projects', function () {
    Process::fake([
        '*--list*' => Process::result(output: wslListing('* larakube-ubuntu Running   2')),
        '*update*' => Process::result(output: "✅ LaraKube updated successfully!\n"),
    ]);

    $wsl = new Wsl(windows: true);
    $result = $wsl->update();

    expect($result['ok'])->toBeTrue()
        ->and($result['message'])->toContain('updated successfully');

    Process::assertRan(fn ($process) => in_array('larakube-ubuntu', (array) $process->command, true)
        && in_array('update', (array) $process->command, true)
        && in_array('--yes', (array) $process->command, true));
});

test('updating falls back to root if larakube user update fails', function () {
    Process::fake([
        '*--list*' => Process::result(output: wslListing('* larakube-ubuntu Running   2')),
        '*which*dnsmasq*' => Process::result(output: "/usr/sbin/dnsmasq\n"),
        '*' => Process::sequence()
            ->push(Process::result(errorOutput: 'permission denied', exitCode: 1))
            ->push(Process::result(output: "✅ LaraKube updated successfully!\n")),
    ]);

    $wsl = new Wsl(windows: true);
    $result = $wsl->update();

    expect($result['ok'])->toBeTrue();
    Process::assertRan(fn ($process) => in_array('--user', (array) $process->command, true) && in_array('root', (array) $process->command, true));
});

test('backupUserHome archives student projects to the local backups directory', function () {
    $home = wslHome();

    Process::fake([
        '*--list*' => Process::result(output: wslListing('* larakube-ubuntu Running   2')),
        '*tar*' => Process::result(),
    ]);

    $wsl = new Wsl(windows: true);
    $result = $wsl->backupUserHome();

    expect($result['ok'])->toBeTrue()
        ->and($result['path'])->not->toBeNull();
    Process::assertRan(fn ($process) => in_array('tar', (array) $process->command, true)
        && in_array('projects', (array) $process->command, true));

    File::deleteDirectory($home);
});

test('resetting automatically creates a safety backup before unregistering the distro', function () {
    $home = wslHome();

    Process::fake([
        '*--list*' => Process::sequence()
            ->push(Process::result(output: wslListing('* larakube-ubuntu Stopped   2')))
            ->push(Process::result(output: wslListing())),
        '*tar*' => Process::result(),
        '*--unregister*' => Process::result(),
        '*' => Process::result(),
    ]);

    $wsl = new Wsl(windows: true);
    $result = $wsl->reset();

    expect($result['ok'])->toBeTrue()
        ->and($result['message'])->toContain('backed up');

    Process::assertRan(fn ($process) => in_array('tar', (array) $process->command, true));
    Process::assertRan(fn ($process) => in_array('--unregister', (array) $process->command, true));

    File::deleteDirectory($home);
});

test('restoreUserHome extracts a backup produced by backupUserHome back into the distro', function () {
    $home = wslHome();
    $backupDir = $home.'/LaraKube/backups';
    mkdir($backupDir, 0777, true);
    $backupPath = $backupDir.'/home-backup-20261017-010203.tar.gz';
    file_put_contents($backupPath, 'fake archive bytes');

    Process::fake([
        '*--list*' => Process::result(output: wslListing('* larakube-ubuntu Running   2')),
        '*tar*' => Process::result(),
    ]);

    $wsl = new Wsl(windows: true);
    $result = $wsl->restoreUserHome($backupPath);

    expect($result['ok'])->toBeTrue()
        ->and($result['message'])->toContain('restored');

    Process::assertRan(fn ($process) => in_array('tar', (array) $process->command, true)
        && in_array('-xzf', (array) $process->command, true));

    File::deleteDirectory($home);
});

test('restoreUserHome refuses a path outside the LaraKube backups directory', function () {
    $home = wslHome();

    Process::fake([
        '*--list*' => Process::result(output: wslListing('* larakube-ubuntu Running   2')),
    ]);

    $wsl = new Wsl(windows: true);
    $result = $wsl->restoreUserHome('C:\\Users\\student\\Documents\\anything.tar.gz');

    expect($result['ok'])->toBeFalse()
        ->and($result['message'])->toContain('not recognized');

    Process::assertNotRan(fn ($process) => in_array('tar', (array) $process->command, true));

    File::deleteDirectory($home);
});

test('ensureDnsmasq succeeds immediately if dnsmasq is already on path', function () {
    Process::fake([
        '*which*dnsmasq*' => Process::result(output: "/usr/sbin/dnsmasq\n"),
    ]);

    $wsl = new Wsl(windows: true);
    expect($wsl->ensureDnsmasq())->toBeTrue();
    Process::assertNotRan(fn ($process) => in_array('apt-get', (array) $process->command, true));
});

test('ensureDnsmasq installs dnsmasq via apt if missing', function () {
    Process::fake([
        '*which*dnsmasq*' => Process::result(output: '', exitCode: 1),
        '*apt-get*install*' => Process::result(output: "Setting up dnsmasq...\n"),
    ]);

    $wsl = new Wsl(windows: true);
    expect($wsl->ensureDnsmasq())->toBeTrue();
    Process::assertRan(fn ($process) => in_array('apt-get', (array) $process->command, true)
        && in_array('dnsmasq', (array) $process->command, true));
});

test('ensureMirroredNetworking creates .wslconfig if missing', function () {
    $temp = sys_get_temp_dir().'/userprofile-'.bin2hex(random_bytes(4));
    mkdir($temp, 0777, true);
    putenv('USERPROFILE='.$temp);

    try {
        $wsl = new Wsl(windows: true);
        expect($wsl->ensureMirroredNetworking())->toBeTrue();

        $content = file_get_contents($temp.'/.wslconfig');
        expect($content)->toContain('[wsl2]')
            ->and($content)->toContain('networkingMode=mirrored');
    } finally {
        File::deleteDirectory($temp);
        putenv('USERPROFILE');
    }
});

test('ensureMirroredNetworking updates existing .wslconfig in place', function () {
    $temp = sys_get_temp_dir().'/userprofile-'.bin2hex(random_bytes(4));
    mkdir($temp, 0777, true);
    putenv('USERPROFILE='.$temp);
    file_put_contents($temp.'/.wslconfig', "[wsl2]\nnetworkingMode=nat\nmemory=8GB\n");

    try {
        $wsl = new Wsl(windows: true);
        expect($wsl->ensureMirroredNetworking())->toBeTrue();

        $content = file_get_contents($temp.'/.wslconfig');
        expect($content)->toContain('networkingMode=mirrored')
            ->and($content)->not->toContain('networkingMode=nat')
            ->and($content)->toContain('memory=8GB');
    } finally {
        File::deleteDirectory($temp);
        putenv('USERPROFILE');
    }
});
