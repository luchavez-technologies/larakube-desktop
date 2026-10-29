<?php

use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\LaraKube\ToolLocator;
use App\Services\Runtime\WslDistro;
use Illuminate\Support\Facades\Process;
use Native\Desktop\Events\ChildProcess\StartupError;
use Native\Desktop\Facades\ChildProcess;

function windowsLocator(): ToolLocator
{
    // wslFeatureEnabled: true — every test in this file exercises actual
    // distro-lookup behavior (wsl.exe running, succeeding, or failing with
    // a distro-level error), not the "WSL optional component itself isn't
    // on" case, which would otherwise short-circuit before wsl.exe ever runs.
    return new ToolLocator(windows: true, wslFeatureEnabled: true);
}

test('on Windows a command runs inside the larakube-ubuntu distro as its own user, from an empty environment', function (): void {
    putenv('SystemRoot=C:\\Windows');

    $isolated = windowsLocator()->isolate(['/usr/local/bin/larakube', 'cloud:stacks', '--json']);

    expect(array_slice($isolated['command'], 0, 5))->toBe(['C:\\Windows\\System32\\wsl.exe', '-d', 'larakube-ubuntu', '--user', 'larakube'])
        ->and(array_slice($isolated['command'], 5, 4))->toBe(['--cd', '~', '--exec', '/usr/bin/env'])
        ->and(array_slice($isolated['command'], -3))->toBe(['/usr/local/bin/larakube', 'cloud:stacks', '--json'])
        ->and($isolated['command'])->toContain('HOME=/home/larakube')
        ->and($isolated['command'])->not->toContain('/bin/sh')
        ->and($isolated['cwd'])->toBeNull()
        ->and($isolated['environment'])->toBe([]);
});

test('a secret reaches the distro by name through WSLENV and never appears in a command line', function (): void {
    $isolated = windowsLocator()->isolate(['/usr/local/bin/larakube', 'devbox:create'], ['TF_VAR_do_token' => 'dop_v1_secret']);

    expect($isolated['environment'])->toBe(['TF_VAR_do_token' => 'dop_v1_secret', 'WSLENV' => 'TF_VAR_do_token'])
        ->and(implode(' ', $isolated['command']))->not->toContain('dop_v1_secret')
        ->and($isolated['command'])->not->toContain('TF_VAR_do_token');
});

test('a folder is given to the distro as a Linux path, whichever way Windows names it', function (string $given, string $expected): void {
    $isolated = windowsLocator()->isolate(['ls'], [], $given);

    expect($isolated['command'][array_search('--cd', $isolated['command'], true) + 1])->toBe($expected);
})->with([
    'a Linux path' => ['/home/larakube/projects/shop', '/home/larakube/projects/shop'],
    'a drive path' => ['C:\\Users\\Mia\\shop', '/mnt/c/Users/Mia/shop'],
    'through the distro share' => ['\\\\wsl.localhost\\larakube-ubuntu\\home\\larakube\\projects\\shop', '/home/larakube/projects/shop'],
]);

test('Windows paths and distro paths are written in each other\'s terms', function (): void {
    expect(WslDistro::unc('/home/larakube/projects/shop'))->toBe('\\\\wsl.localhost\\larakube-ubuntu\\home\\larakube\\projects\\shop')
        ->and(WslDistro::toLinux('D:\\work'))->toBe('/mnt/d/work')
        ->and(WslDistro::toLinux('\\\\wsl$\\larakube-ubuntu\\home\\larakube'))->toBe('/home/larakube')
        ->and(WslDistro::toLinux('\\\\wsl.localhost\\larakube-ubuntu'))->toBe('/')
        ->and(WslDistro::toLinux('/etc/hosts'))->toBe('/etc/hosts')
        ->and(WslDistro::toWindows('/mnt/c/Users/Mia/Downloads/alice.kubeconfig'))->toBe('C:\\Users\\Mia\\Downloads\\alice.kubeconfig')
        ->and(WslDistro::toWindows('/home/larakube/test.txt'))->toBe('\\\\wsl.localhost\\larakube-ubuntu\\home\\larakube\\test.txt');
});

test('on Windows the CLI is looked for inside the distro, once', function (): void {
    putenv('SystemRoot=C:\\Windows');
    Process::fake(['*' => Process::result(output: "/usr/local/bin/larakube\n")]);
    $locator = windowsLocator();

    expect($locator->find('larakube'))->toBe('/usr/local/bin/larakube')
        ->and($locator->find('larakube'))->toBe('/usr/local/bin/larakube');

    Process::assertRanTimes(fn ($process): bool => str_contains(implode(' ', (array) $process->command), 'wsl.exe') && str_contains(implode(' ', (array) $process->command), 'larakube'), 1);
});

test('a tool the distro does not have is not found, and the reason is kept', function (): void {
    Process::fake(['*' => Process::result(errorOutput: 'no such distro', exitCode: 1)]);
    $locator = windowsLocator();

    expect($locator->find('nope'))->toBeNull()
        ->and($locator->lastFailure())->toBe('wsl.exe exited 1: no such distro');
});

test('the lookup in the distro has no shell script to quote', function (): void {
    putenv('SystemRoot=C:\\Windows');
    Process::fake(['*' => Process::result(output: "/usr/local/bin/larakube\n")]);

    windowsLocator()->find('larakube');

    Process::assertRan(fn ($process): bool => in_array('--exec', (array) $process->command, true)
        && in_array('/usr/bin/which', (array) $process->command, true)
        && ! in_array('/bin/sh', (array) $process->command, true));
});

test('run and start go through the same isolation, here and in the distro', function (): void {
    putenv('SystemRoot=C:\\Windows');
    Process::fake(['*' => Process::result(output: 'ok')]);
    $fake = ChildProcess::fake();

    $result = windowsLocator()->run(['/usr/local/bin/larakube', 'x'], 5, ['A_SECRET' => 's3cret'], '/home/larakube/projects/shop');
    windowsLocator()->start(['/usr/local/bin/larakube', 'up'], 'run-1', [], '/home/larakube/projects/shop');

    expect(trim($result->output()))->toBe('ok');

    Process::assertRan(fn ($process): bool => ($process->command[0] ?? '') === 'C:\\Windows\\System32\\wsl.exe'
        && in_array('--cd', $process->command, true)
        && ($process->environment['WSLENV'] ?? '') === 'A_SECRET'
        && $process->environment['A_SECRET'] === 's3cret');

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => ($cmd[0] ?? '') === 'C:\\Windows\\System32\\wsl.exe' && in_array('/home/larakube/projects/shop', (array) $cmd, true));
});

test('the PATH given to the distro is a Linux one, whatever separator this computer uses', function (): void {
    $path = windowsLocator()->path();

    expect($path)->not->toContain(';')
        ->and(explode(':', $path))->toContain('/usr/local/bin', '/usr/bin');
});

test('tools the CLI installs in the distro are found where it puts them', function (): void {
    expect(explode(':', windowsLocator()->path()))->toContain('/home/larakube/google-cloud-sdk/bin', '/home/larakube/.local/bin', '/snap/bin');
});

test('on a Mac or Linux nothing about a command changes', function (): void {
    $isolated = (new ToolLocator(['/usr/bin', '/bin'], windows: false))->isolate(['/usr/bin/env'], ['T' => 'v'], '/tmp');

    expect($isolated['command'][0])->toBe('/bin/sh')
        ->and($isolated['cwd'])->toBe('/tmp')
        ->and($isolated['environment'])->toMatchArray(['T' => 'v', 'PATH' => '/usr/bin:/bin']);
});

test('a run whose process never started ends as failed, with the reason on its log', function (): void {
    $run = Run::create(['label' => 'x', 'command' => ['wsl.exe']]);

    event(new StartupError($run->alias(), 'Startup timeout exceeded'));

    $run->refresh();

    expect($run->status)->toBe(RunStatus::Failed)
        ->and($run->output)->toContain('The command could not be started: Startup timeout exceeded');
});

test('WslDistro correctly identifies system directories that must be blocked', function (): void {
    expect(WslDistro::isSystemDirectory('C:\\Windows\\System32'))->toBeTrue()
        ->and(WslDistro::isSystemDirectory('C:\\Program Files'))->toBeTrue()
        ->and(WslDistro::isSystemDirectory('C:\\Program Files (x86)'))->toBeTrue()
        ->and(WslDistro::isSystemDirectory('C:\\'))->toBeTrue()
        ->and(WslDistro::isSystemDirectory('/etc'))->toBeTrue()
        ->and(WslDistro::isSystemDirectory('/tmp'))->toBeTrue()
        ->and(WslDistro::isSystemDirectory('/var/log'))->toBeTrue()
        ->and(WslDistro::isSystemDirectory('C:\\Users\\John\\Projects'))->toBeFalse()
        ->and(WslDistro::isSystemDirectory('/home/larakube/projects'))->toBeFalse()
        ->and(WslDistro::isSystemDirectory('\\\\wsl.localhost\\larakube-ubuntu\\home\\larakube\\projects'))->toBeFalse()
        ->and(WslDistro::isSystemDirectory('D:\\Development\\app'))->toBeFalse();
});

test('ToolLocator resolves default projects path and host profile', function (): void {
    expect(ToolLocator::defaultProjectsPath(true))->toBe('/home/larakube/projects')
        ->and(ToolLocator::defaultProjectsPath(false))->toBe(ToolLocator::home())
        ->and(windowsLocator()->defaultProjectsDirectory())->toBe('/home/larakube/projects');
});

test('on Windows find(larakube) resolves to the native host larakube.exe when present, while non-larakube tools stay in WSL', function (): void {
    $tempProfile = sys_get_temp_dir().'/larakube-win-profile-'.bin2hex(random_bytes(4));
    mkdir($tempProfile.'/.larakube/bin', 0777, true);
    $nativeExe = $tempProfile.'/.larakube/bin/larakube.exe';
    file_put_contents($nativeExe, 'MZ-fake-exe');

    $prevEnv = getenv('USERPROFILE');
    $prevServer = $_SERVER['USERPROFILE'] ?? null;
    putenv('USERPROFILE='.$tempProfile);
    $_SERVER['USERPROFILE'] = $tempProfile;

    Process::fake([
        '*which*kubectl*' => Process::result(output: "/usr/local/bin/kubectl\n"),
    ]);

    try {
        $locator = windowsLocator();

        expect($locator->find('larakube'))->toBe($nativeExe);
        Process::assertNotRan(fn ($p) => str_contains(implode(' ', (array) $p->command), 'which') && str_contains(implode(' ', (array) $p->command), 'larakube'));

        expect($locator->find('kubectl'))->toBe('/usr/local/bin/kubectl');
        Process::assertRan(fn ($p) => str_contains(implode(' ', (array) $p->command), 'kubectl'));
    } finally {
        @unlink($nativeExe);
        @rmdir($tempProfile.'/.larakube/bin');
        @rmdir($tempProfile.'/.larakube');
        @rmdir($tempProfile);
        if ($prevEnv === false) {
            putenv('USERPROFILE');
        } else {
            putenv('USERPROFILE='.$prevEnv);
        }
        if ($prevServer === null) {
            unset($_SERVER['USERPROFILE']);
        } else {
            $_SERVER['USERPROFILE'] = $prevServer;
        }
    }
});

test('on Windows isolate() runs native larakube.exe directly without wsl.exe wrapper, bridges secrets via WSLENV, scrubs Desktop cache vars, and translates cwd to Windows UNC', function (): void {
    $nativeExe = 'C:\\Users\\Mia\\.larakube\\bin\\larakube.exe';

    $isolated = windowsLocator()->isolate(
        [$nativeExe, 'up', '--no-test'],
        ['TF_VAR_do_token' => 'dop_v1_secret'],
        '/home/larakube/projects/shop',
    );

    expect($isolated['command'])->toBe([$nativeExe, 'up', '--no-test'])
        ->and($isolated['cwd'])->toBe('\\\\wsl.localhost\\larakube-ubuntu\\home\\larakube\\projects\\shop')
        ->and($isolated['environment']['TF_VAR_do_token'])->toBe('dop_v1_secret')
        ->and($isolated['environment']['WSLENV'])->toBe('TF_VAR_do_token')
        ->and($isolated['environment']['CACHE_STORE'])->toBe('file')
        ->and($isolated['environment']['CACHE_DRIVER'])->toBe('file')
        ->and($isolated['environment']['APP_CONFIG_CACHE'])->toBe('')
        ->and(implode(' ', $isolated['command']))->not->toContain('dop_v1_secret')
        ->and(implode(' ', $isolated['command']))->not->toContain('wsl.exe');
});
