<?php

use App\Services\Wsl;
use Illuminate\Support\Facades\Cache;

test('the Windows setup steps do not exist outside Windows', function () {
    $this->post('/setup/wsl/download')->assertNotFound();
});

test('only the known setup steps are routed', function () {
    $this->post('/setup/wsl/format-disk')->assertNotFound();
});

test('a step that throws reports its reason instead of a bare server error', function () {
    $wsl = Mockery::mock(Wsl::class)->makePartial();
    $wsl->shouldReceive('isWindows')->andReturn(true);
    $wsl->shouldReceive('download')->andThrow(new RuntimeException('cURL error 60: SSL certificate problem'));
    app()->instance(Wsl::class, $wsl);

    $this->post('/setup/wsl/download')
        ->assertOk()
        ->assertJson(['ok' => false, 'message' => 'download failed: cURL error 60: SSL certificate problem']);
});

test('a finished import clears what Setup remembered about the tools', function () {
    Cache::put('readiness.tool.larakube', ['installed' => false, 'path' => null, 'version' => null]);

    $wsl = Mockery::mock(Wsl::class)->makePartial();
    $wsl->shouldReceive('isWindows')->andReturn(true);
    $wsl->shouldReceive('import')->andReturn(['ok' => true, 'message' => 'done']);
    app()->instance(Wsl::class, $wsl);

    $this->post('/setup/wsl/import')->assertOk();

    expect(Cache::has('readiness.tool.larakube'))->toBeFalse();
});
