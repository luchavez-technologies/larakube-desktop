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
