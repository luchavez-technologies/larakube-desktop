<?php

use App\Services\QrCode\QrCodeService;

test('qr code service reports whether image extensions are supported', function () {
    $service = new QrCodeService;

    expect($service->isSupported())->toBe(extension_loaded('gd') || extension_loaded('imagick'));
});

test('qr code service can render PNG bytes with valid header', function () {
    $service = new QrCodeService;

    if (! extension_loaded('gd')) {
        $this->markTestSkipped('GD extension is required for PNG rendering test');
    }

    $png = $service->renderPng('https://larakube.app');

    expect($png)->toBeString()
        ->and(str_starts_with($png, "\x89PNG\r\n\x1a\n"))->toBeTrue();
});

test('qr code service can render SVG string', function () {
    $service = new QrCodeService;

    $svg = $service->renderSvg('https://larakube.app');

    expect($svg)->toBeString()
        ->and($svg)->toContain('<svg')
        ->and($svg)->toContain('</svg>');
});

test('api qr endpoint streams PNG image by default', function () {
    if (! extension_loaded('gd')) {
        $this->markTestSkipped('GD extension is required for PNG test');
    }

    $response = $this->get('/api/qr?url=https://test.dev.test');

    $response->assertOk()
        ->assertHeader('Content-Type', 'image/png');

    expect(str_starts_with($response->getContent(), "\x89PNG\r\n\x1a\n"))->toBeTrue();
});

test('api qr endpoint streams SVG markup when format is svg', function () {
    $response = $this->get('/api/qr?url=https://test.dev.test&format=svg');

    $response->assertOk()
        ->assertHeader('Content-Type', 'image/svg+xml');

    expect($response->getContent())
        ->toContain('<svg')
        ->toContain('</svg>');
});

test('api qr endpoint sets attachment content disposition when download requested', function () {
    if (! extension_loaded('gd')) {
        $this->markTestSkipped('GD extension is required for PNG test');
    }

    $response = $this->get('/api/qr?url=https://my-app.dev.test&download=1');

    $response->assertOk()
        ->assertHeader('Content-Type', 'image/png')
        ->assertHeader('Content-Disposition', 'attachment; filename="qr-my-app-dev-test.png"');
});

test('api qr endpoint validates required url parameter', function () {
    $response = $this->getJson('/api/qr');

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['url']);
});
