<?php

use App\Services\LaraKube\TerminalIntegration;
use Illuminate\Support\Facades\File;

beforeEach(function () {
    $this->tempHome = storage_path('framework/testing/home-uninstall-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($this->tempHome);
    $_SERVER['HOME'] = realpath($this->tempHome);
    putenv('HOME='.realpath($this->tempHome));
});

afterEach(function () {
    File::deleteDirectory($this->tempHome);
});

test('post /uninstall validates required boolean flags', function () {
    $this->postJson(route('uninstall.execute'), [])
        ->assertStatus(422)
        ->assertJsonValidationErrors([
            'removeCli',
            'removeShellPath',
            'purgeClusterData',
            'removeWsl',
            'purgeAppData',
            'trashAppBundle',
        ]);
});

test('post /uninstall executes selected options and returns action list', function () {
    $binDir = $this->tempHome.'/.larakube/bin';
    File::ensureDirectoryExists($binDir);
    File::put($binDir.'/larakube', '#!/bin/sh');

    $configDir = $this->tempHome.'/.larakube/config';
    File::ensureDirectoryExists($configDir);
    File::put($configDir.'/settings.json', '{}');

    $terminal = new TerminalIntegration;
    $profile = $terminal->profilePath();
    File::put($profile, "export OTHER=1\n");
    $terminal->install();

    $response = $this->postJson(route('uninstall.execute'), [
        'removeCli' => true,
        'removeShellPath' => true,
        'purgeClusterData' => true,
        'removeWsl' => false,
        'purgeAppData' => true,
        'trashAppBundle' => false,
    ]);

    $response->assertOk()
        ->assertJson([
            'success' => true,
        ]);

    expect(File::exists($binDir))->toBeFalse()
        ->and(File::exists($configDir))->toBeFalse()
        ->and($terminal->isConfigured())->toBeFalse();
});

test('post /uninstall preserves cli tools and cluster data when flags are false', function () {
    $binDir = $this->tempHome.'/.larakube/bin';
    File::ensureDirectoryExists($binDir);
    File::put($binDir.'/larakube', '#!/bin/sh');

    $configDir = $this->tempHome.'/.larakube/config';
    File::ensureDirectoryExists($configDir);
    File::put($configDir.'/settings.json', '{}');

    $response = $this->postJson(route('uninstall.execute'), [
        'removeCli' => false,
        'removeShellPath' => false,
        'purgeClusterData' => false,
        'removeWsl' => false,
        'purgeAppData' => false,
        'trashAppBundle' => false,
    ]);

    $response->assertOk()
        ->assertJson([
            'success' => true,
        ]);

    expect(File::exists($binDir.'/larakube'))->toBeTrue()
        ->and(File::exists($configDir.'/settings.json'))->toBeTrue();
});
