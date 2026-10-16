<?php

use App\Services\LaraKube\TerminalIntegration;
use Illuminate\Support\Facades\File;

beforeEach(function () {
    $this->tempHome = storage_path('framework/testing/home-terminal-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($this->tempHome);
    $_SERVER['HOME'] = realpath($this->tempHome);
    putenv('HOME='.realpath($this->tempHome));
});

afterEach(function () {
    File::deleteDirectory($this->tempHome);
});

test('isConfigured returns false when shell profile does not contain larakube bin', function () {
    $terminal = new TerminalIntegration;

    expect($terminal->isConfigured())->toBeFalse();
});

test('install appends export line to profile and marks configured', function () {
    $terminal = new TerminalIntegration;
    $profile = $terminal->profilePath();

    $result = $terminal->install();

    expect($result['success'])->toBeTrue()
        ->and(File::exists($profile))->toBeTrue()
        ->and((string) File::get($profile))->toContain(TerminalIntegration::EXPORT_LINE)
        ->and($terminal->isConfigured())->toBeTrue();
});

test('install is idempotent and does not duplicate export line', function () {
    $terminal = new TerminalIntegration;
    $profile = $terminal->profilePath();

    $terminal->install();
    $terminal->install();

    $content = (string) File::get($profile);
    expect(substr_count($content, TerminalIntegration::EXPORT_LINE))->toBe(1);
});

test('setup terminal install route executes installation and redirects back', function () {
    $this->post(route('setup.terminal.install'))
        ->assertRedirect()
        ->assertSessionHas('success');

    $terminal = new TerminalIntegration;
    expect($terminal->isConfigured())->toBeTrue();
});

test('uninstall removes export line from profile file and preserves other content', function () {
    $terminal = new TerminalIntegration;
    $profile = $terminal->profilePath();

    File::put($profile, "export OTHER_VAR=1\n");
    $terminal->install();

    expect($terminal->isConfigured())->toBeTrue();

    $result = $terminal->uninstall();

    expect($result['success'])->toBeTrue()
        ->and($result['files'])->toContain($profile)
        ->and($terminal->isConfigured())->toBeFalse()
        ->and(File::get($profile))->toContain('export OTHER_VAR=1')
        ->and(File::get($profile))->not->toContain(TerminalIntegration::EXPORT_LINE);
});

test('uninstall is safe and idempotent when profile does not contain export line', function () {
    $terminal = new TerminalIntegration;
    $profile = $terminal->profilePath();

    File::put($profile, "export OTHER_VAR=1\n");

    $result = $terminal->uninstall();

    expect($result['success'])->toBeTrue()
        ->and($result['files'])->toBeEmpty()
        ->and($terminal->isConfigured())->toBeFalse();
});
