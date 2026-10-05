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
    return new ToolLocator(windows: true);
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
        ->and(WslDistro::toLinux('/etc/hosts'))->toBe('/etc/hosts');
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
