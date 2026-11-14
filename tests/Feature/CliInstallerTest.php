<?php

use App\Models\Run;
use App\Services\LaraKube\CliInstaller;
use App\Services\LaraKube\GlobalSettings;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;

beforeEach(function () {
    $this->tempBin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($this->tempBin);
    $this->installer = new CliInstaller(app(GlobalSettings::class), binDir: $this->tempBin);
    app()->instance(CliInstaller::class, $this->installer);
});

afterEach(function () {
    if (isset($this->tempBin) && is_dir($this->tempBin)) {
        File::deleteDirectory($this->tempBin);
    }
});

test('cli installer resolves canary and stable release URLs', function () {
    expect($this->installer->downloadUrl('canary'))->toContain('/download/canary/larakube-')
        ->and($this->installer->downloadUrl('stable'))->toContain('/latest/download/larakube-')
        ->and($this->installer->channel())->toBe('canary');
});

test('cli installer switches release channels', function () {
    $this->post(route('setup.cli.channel'), ['channel' => 'stable'])
        ->assertRedirect()
        ->assertSessionHas('success');

    expect($this->installer->channel())->toBe('stable');
});

test('tool install controller installs larakube directly in app', function () {
    Http::fake([
        'https://github.com/luchavez-technologies/larakube-cli/releases/*' => Http::response('fake binary content longer than 1024 bytes '.str_repeat('A', 2048), 200),
    ]);

    $response = $this->post(route('setup.tools.install', 'larakube'), [
        'channel' => 'canary',
    ]);

    $run = Run::sole();
    $response->assertRedirect(route('runs.show', $run));

    expect($run->label)->toContain('Install LaraKube CLI (canary)')
        ->and($run->subject)->toBe('larakube')
        ->and(file_exists("{$this->tempBin}/larakube"))->toBeTrue();
});

test('cli installer resolves windows binary name and download url on windows', function () {
    $installer = new CliInstaller(app(GlobalSettings::class), binDir: $this->tempBin, os: 'windows');

    expect($installer->os())->toBe('windows')
        ->and($installer->binaryName())->toBe('larakube-windows-x64.exe')
        ->and($installer->downloadUrl('canary'))->toContain('/download/canary/larakube-windows-x64.exe')
        ->and($installer->downloadUrl('stable'))->toContain('/latest/download/larakube-windows-x64.exe');
});

test('cli installer installs only larakube.exe on Windows without redownloading the Linux WSL binary', function () {
    Http::fake([
        'https://github.com/luchavez-technologies/larakube-cli/releases/*' => fn () => Http::response('fake binary content longer than 1024 bytes '.str_repeat('A', 2048), 200),
    ]);

    $installer = new CliInstaller(app(GlobalSettings::class), binDir: $this->tempBin, os: 'windows');
    $result = $installer->install('canary');

    expect($result['success'])->toBeTrue()
        ->and(file_exists("{$this->tempBin}/larakube.exe"))->toBeTrue()
        ->and(file_exists("{$this->tempBin}/larakube-linux-x64"))->toBeFalse();
});

test('cli installer rejects a truncated download when Content-Length mismatches and succeeds on retry', function () {
    $fullPayload = str_repeat('B', 4096);
    $truncatedPayload = str_repeat('X', 2048);

    Http::fake([
        'https://github.com/luchavez-technologies/larakube-cli/releases/*' => Http::sequence()
            ->push($truncatedPayload, 200, ['Content-Length' => '4096'])
            ->push($fullPayload, 200, ['Content-Length' => '4096']),
    ]);

    $installer = new CliInstaller(app(GlobalSettings::class), binDir: $this->tempBin, os: 'windows');
    $result = $installer->install('canary');

    expect($result['success'])->toBeTrue()
        ->and(file_get_contents("{$this->tempBin}/larakube.exe"))->toBe($fullPayload);
});

test('cli installer preserves existing binary and returns an error if every download attempt is truncated', function () {
    File::put("{$this->tempBin}/larakube.exe", 'previous-working-binary');

    Http::fake([
        'https://github.com/luchavez-technologies/larakube-cli/releases/*' => Http::response(str_repeat('X', 2048), 200, ['Content-Length' => '8192']),
    ]);

    $installer = new CliInstaller(app(GlobalSettings::class), binDir: $this->tempBin, os: 'windows');
    $result = $installer->install('canary');

    expect($result['success'])->toBeFalse()
        ->and($result['error'])->toContain('Incomplete download')
        ->and(file_get_contents("{$this->tempBin}/larakube.exe"))->toBe('previous-working-binary');
});
