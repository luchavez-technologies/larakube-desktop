<?php

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\LaraKube\CliInstaller;
use App\Services\LaraKube\GlobalSettings;
use App\Services\Wsl;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Process;

test('on Windows the CLI is updated directly via CliInstaller on the canary channel', function () {
    $tempBin = storage_path('framework/testing/update-cli-canary-'.bin2hex(random_bytes(4)));
    File::ensureDirectoryExists($tempBin);
    File::put("{$tempBin}/larakube.exe", 'old-binary');
    app()->instance(
        CliInstaller::class,
        new CliInstaller(app(GlobalSettings::class), binDir: $tempBin, os: 'windows', arch: 'x64'),
    );
    Http::fake([
        'https://github.com/luchavez-technologies/larakube-cli/releases/*' => Http::response('canary binary '.str_repeat('A', 2048), 200),
    ]);

    $this->post('/setup/cli/update', ['channel' => 'canary'])->assertRedirect();

    $run = Run::query()->latest('id')->first();
    expect($run->kind)->toBe(RunKind::InstallTool)
        ->and($run->status)->toBe(RunStatus::Succeeded)
        ->and($run->command)->toBe(['cli:install', '--channel=canary']);
    Http::assertSent(fn ($request) => $request->url() === 'https://github.com/luchavez-technologies/larakube-cli/releases/download/canary/larakube-windows-x64.exe');

    File::deleteDirectory($tempBin);
});

test('the stable channel updates from the latest release URL', function () {
    $tempBin = storage_path('framework/testing/update-cli-stable-'.bin2hex(random_bytes(4)));
    File::ensureDirectoryExists($tempBin);
    File::put("{$tempBin}/larakube.exe", 'old-binary');
    app()->instance(
        CliInstaller::class,
        new CliInstaller(app(GlobalSettings::class), binDir: $tempBin, os: 'windows', arch: 'x64'),
    );
    Http::fake([
        'https://github.com/luchavez-technologies/larakube-cli/releases/*' => Http::response('stable binary '.str_repeat('A', 2048), 200),
    ]);

    $this->post('/setup/cli/update', ['channel' => 'stable'])->assertRedirect();

    $run = Run::query()->latest('id')->first();
    expect($run->status)->toBe(RunStatus::Succeeded)
        ->and($run->command)->toBe(['cli:install', '--channel=stable']);
    Http::assertSent(fn ($request) => $request->url() === 'https://github.com/luchavez-technologies/larakube-cli/releases/latest/download/larakube-windows-x64.exe');

    File::deleteDirectory($tempBin);
});

test('on Windows larakube-wsl installs the Linux binary into larakube-ubuntu on the canary channel', function () {
    $tempBin = storage_path('framework/testing/install-wsl-cli-canary-'.bin2hex(random_bytes(4)));
    File::ensureDirectoryExists($tempBin);
    app()->instance(
        CliInstaller::class,
        new CliInstaller(app(GlobalSettings::class), binDir: $tempBin, os: 'windows', arch: 'x64'),
    );
    app()->instance(Wsl::class, new Wsl(windows: true, featureEnabled: true));
    Http::fake([
        'https://github.com/luchavez-technologies/larakube-cli/releases/*' => Http::response('wsl canary binary '.str_repeat('A', 2048), 200),
    ]);
    Process::fake([
        '*--list*--verbose*' => Process::result(output: "  NAME            STATE           VERSION\n* larakube-ubuntu Running         2\n"),
        '*wsl.exe*install*' => Process::result(output: ''),
    ]);

    $this->post(route('setup.tools.install', 'larakube-wsl'), ['channel' => 'canary'])->assertRedirect();

    $run = Run::query()->latest('id')->first();
    expect($run->kind)->toBe(RunKind::InstallTool)
        ->and($run->status)->toBe(RunStatus::Succeeded)
        ->and($run->label)->toBe('Install LaraKube CLI (WSL) (canary)')
        ->and($run->subject)->toBe('larakube-wsl')
        ->and($run->command)->toBe(['cli:install', '--wsl', '--channel=canary']);

    Http::assertSent(fn ($request) => $request->url() === 'https://github.com/luchavez-technologies/larakube-cli/releases/download/canary/larakube-linux-x64');
    Process::assertRan(fn ($process) => in_array('install', (array) $process->command, true) && in_array('/usr/local/bin/larakube', (array) $process->command, true));

    File::deleteDirectory($tempBin);
});

test('on Windows larakube-wsl updates the Linux binary inside larakube-ubuntu on the stable channel', function () {
    $tempBin = storage_path('framework/testing/update-wsl-cli-stable-'.bin2hex(random_bytes(4)));
    File::ensureDirectoryExists($tempBin);
    app()->instance(
        CliInstaller::class,
        new CliInstaller(app(GlobalSettings::class), binDir: $tempBin, os: 'windows', arch: 'x64'),
    );
    app()->instance(Wsl::class, new Wsl(windows: true, featureEnabled: true));
    Http::fake([
        'https://github.com/luchavez-technologies/larakube-cli/releases/*' => Http::response('wsl stable binary '.str_repeat('A', 2048), 200),
    ]);
    Process::fake([
        '*--list*--verbose*' => Process::result(output: "  NAME            STATE           VERSION\n* larakube-ubuntu Running         2\n"),
        '*wsl.exe*install*' => Process::result(output: ''),
    ]);

    $this->post(route('setup.tools.update', 'larakube-wsl'), ['channel' => 'stable'])->assertRedirect();

    $run = Run::query()->latest('id')->first();
    expect($run->kind)->toBe(RunKind::InstallTool)
        ->and($run->status)->toBe(RunStatus::Succeeded)
        ->and($run->label)->toBe('Update LaraKube CLI (WSL) (stable)')
        ->and($run->subject)->toBe('larakube-wsl')
        ->and($run->command)->toBe(['cli:install', '--wsl', '--channel=stable']);

    Http::assertSent(fn ($request) => $request->url() === 'https://github.com/luchavez-technologies/larakube-cli/releases/latest/download/larakube-linux-x64');
    Process::assertRan(fn ($process) => in_array('install', (array) $process->command, true) && in_array('/usr/local/bin/larakube', (array) $process->command, true));

    File::deleteDirectory($tempBin);
});
