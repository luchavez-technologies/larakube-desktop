<?php

use Illuminate\Support\Facades\Http;

beforeEach(function () {
    $this->metaPath = storage_path('app/branding/current.json');
    if (file_exists($this->metaPath)) {
        @unlink($this->metaPath);
    }
});

test('icon:sync command processes a local image file successfully', function () {
    $this->artisan('icon:sync', [
        '--file' => 'LuchTech-Logo.png',
        '--theme' => 'luchtech-test',
        '--force' => true,
    ])
        ->assertSuccessful();

    expect(file_exists($this->metaPath))->toBeTrue();

    $meta = json_decode((string) file_get_contents($this->metaPath), true);
    expect($meta['theme'])->toBe('luchtech-test')
        ->and($meta['sha256'])->not->toBeEmpty();

    expect(file_exists(public_path('icon.png')))->toBeTrue()
        ->and(file_exists(public_path('IconTemplate.png')))->toBeTrue()
        ->and(file_exists(public_path('IconTemplate@2x.png')))->toBeTrue();
});

test('icon:sync is idempotent and skips unchanged icon without --force', function () {
    $this->artisan('icon:sync', [
        '--file' => 'LuchTech-Logo.png',
        '--theme' => 'luchtech-idempotent',
        '--force' => true,
    ])
        ->assertSuccessful();

    $this->artisan('icon:sync', [
        '--file' => 'LuchTech-Logo.png',
    ])
        ->expectsOutputToContain('App icons are already synchronized')
        ->assertSuccessful();
});

test('icon:sync downloads from remote URL and generates icons', function () {
    Http::fake([
        'https://example.com/seasonal-icon.png' => Http::response(
            file_get_contents(base_path('LuchTech-Logo.png')),
            200
        ),
    ]);

    $this->artisan('icon:sync', [
        '--url' => 'https://example.com/seasonal-icon.png',
        '--theme' => 'remote-autumn',
        '--force' => true,
    ])
        ->assertSuccessful();

    $meta = json_decode((string) file_get_contents($this->metaPath), true);
    expect($meta['theme'])->toBe('remote-autumn');
});

test('icon:sync fails gracefully when local file does not exist', function () {
    $this->artisan('icon:sync', [
        '--file' => 'non-existent-logo.png',
    ])
        ->expectsOutputToContain('Specified file not found')
        ->assertFailed();
});
