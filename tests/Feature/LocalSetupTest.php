<?php

use App\Enums\RunKind;
use App\Models\Run;
use App\Services\Elevation;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Native\Desktop\Facades\ChildProcess;

function localSetupCli(): string
{
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);
    File::put("{$directory}/larakube", "#!/bin/sh\n");
    chmod("{$directory}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$directory]));

    return $directory;
}

test('inside WSL, root comes from Windows and the sudoers entry is written for the user', function () {
    Process::fake(['*' => Process::result(output: '/mnt/c/Windows/System32/wsl.exe')]);

    $elevation = new Elevation(user: 'student', distro: 'Ubuntu');

    expect($elevation->method())->toBe('wsl')
        ->and($elevation->grant())->toBeTrue();

    Process::assertRan(fn ($process) => array_slice($process->command, 0, 6) === ['wsl.exe', '-d', 'Ubuntu', '-u', 'root', '--']
        && str_contains(implode(' ', $process->command), 'student ALL=(ALL) NOPASSWD:ALL')
        && str_contains(implode(' ', $process->command), Elevation::SUDOERS_FILE));
});

test('revoking removes the sudoers entry', function () {
    Process::fake(['*' => Process::result(output: '/mnt/c/Windows/System32/wsl.exe')]);

    expect((new Elevation(user: 'student', distro: 'Ubuntu'))->revoke())->toBeTrue();

    Process::assertRan(fn ($process) => in_array('rm', $process->command, true) && in_array(Elevation::SUDOERS_FILE, $process->command, true));
});

test('an account name that is not a plain username is never written into sudoers', function () {
    Process::fake(['*' => Process::result(output: '/mnt/c/Windows/System32/wsl.exe')]);

    expect((new Elevation(user: "bad\nuser ALL=(ALL) NOPASSWD:ALL", distro: 'Ubuntu'))->grant())->toBeFalse();

    Process::assertNotRan(fn ($process) => str_contains(implode(' ', (array) $process->command), 'NOPASSWD'));
});

test('local setup starts the CLI setup once administrator access is granted', function () {
    $directory = localSetupCli();
    $fake = ChildProcess::fake();
    $elevation = mock(Elevation::class);
    $elevation->shouldReceive('method')->andReturn('wsl');
    $elevation->shouldReceive('grant')->andReturn(true);
    app()->instance(Elevation::class, $elevation);

    $this->post(route('setup.local'))->assertRedirect(route('runs.show', Run::sole()));

    expect(Run::sole()->kind)->toBe(RunKind::SetupLocal);
    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === ["{$directory}/larakube", 'setup', '--profile=local', '--runtime=podman', '--no-interaction']);

    File::deleteDirectory($directory);
});

test('local setup falls back to the manual command when administrator access is not available', function () {
    localSetupCli();
    $elevation = mock(Elevation::class);
    $elevation->shouldReceive('method')->andReturn(null);
    app()->instance(Elevation::class, $elevation);

    $this->post(route('setup.local'))->assertSessionHasErrors('local');

    expect(Run::count())->toBe(0);
});
