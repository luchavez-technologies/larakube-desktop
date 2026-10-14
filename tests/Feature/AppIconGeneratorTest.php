<?php

use App\Services\Branding\AppIconGenerator;
use Illuminate\Support\Facades\File;

beforeEach(function () {
    $this->tempDir = storage_path('framework/testing/icons_'.uniqid());
    File::ensureDirectoryExists($this->tempDir);
});

afterEach(function () {
    if (File::isDirectory($this->tempDir)) {
        File::deleteDirectory($this->tempDir);
    }
});

test('AppIconGenerator generates all required icon assets from a source image', function () {
    $generator = new AppIconGenerator;
    $sourcePath = base_path('LuchTech-Logo.png');

    expect(file_exists($sourcePath))->toBeTrue();

    $generated = $generator->generateAll($sourcePath, $this->tempDir);

    expect(file_exists($generated['icon']))->toBeTrue()
        ->and(file_exists($generated['logo']))->toBeTrue()
        ->and(file_exists($generated['template']))->toBeTrue()
        ->and(file_exists($generated['template_2x']))->toBeTrue()
        ->and(file_exists($generated['ico']))->toBeTrue();

    // Verify 1024x1024 icon
    $im1024 = imagecreatefrompng($generated['icon']);
    expect(imagesx($im1024))->toBe(1024)
        ->and(imagesy($im1024))->toBe(1024);
    imagedestroy($im1024);

    // Verify 512x512 logo
    $imLogo = imagecreatefrompng($generated['logo']);
    expect(imagesx($imLogo))->toBe(512)
        ->and(imagesy($imLogo))->toBe(512);
    imagedestroy($imLogo);

    // Verify 16x16 MenuBar template
    $im16 = imagecreatefrompng($generated['template']);
    expect(imagesx($im16))->toBe(16)
        ->and(imagesy($im16))->toBe(16);
    // Background corner must be transparent
    $c16 = imagecolorat($im16, 0, 0);
    $a16 = ($c16 >> 24) & 0x7F;
    expect($a16)->toBe(127); // 127 is 100% transparent in GD
    imagedestroy($im16);

    // Verify 32x32 MenuBar template @2x
    $im32 = imagecreatefrompng($generated['template_2x']);
    expect(imagesx($im32))->toBe(32)
        ->and(imagesy($im32))->toBe(32);
    $c32 = imagecolorat($im32, 0, 0);
    $a32 = ($c32 >> 24) & 0x7F;
    expect($a32)->toBe(127);
    imagedestroy($im32);

    // Verify Windows ICO binary header (6 images)
    $icoData = file_get_contents($generated['ico']);
    expect(substr($icoData, 0, 4))->toBe("\x00\x00\x01\x00");
});

test('AppIconGenerator reports whether image manipulation is supported', function () {
    $generator = new AppIconGenerator;
    expect($generator->isSupported())->toBe(extension_loaded('gd') || extension_loaded('imagick'));
});
