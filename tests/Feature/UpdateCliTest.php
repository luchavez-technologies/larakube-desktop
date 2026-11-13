<?php

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\LaraKube\CliInstaller;
use App\Services\LaraKube\GlobalSettings;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;

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
