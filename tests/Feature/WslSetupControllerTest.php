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

test('the update step runs wsl update and clears tool status cache on success', function () {
    Cache::put('readiness.tool.larakube', ['installed' => true, 'path' => '/usr/local/bin/larakube', 'version' => '0.34.0']);

    $wsl = Mockery::mock(Wsl::class)->makePartial();
    $wsl->shouldReceive('isWindows')->andReturn(true);
    $wsl->shouldReceive('update')->andReturn(['ok' => true, 'message' => 'LaraKube Linux updated successfully.']);
    app()->instance(Wsl::class, $wsl);

    $this->post('/setup/wsl/update')
        ->assertOk()
        ->assertJson(['ok' => true, 'message' => 'LaraKube Linux updated successfully.']);

    expect(Cache::has('readiness.tool.larakube'))->toBeFalse();
});

test('the backup step runs user home backup without clearing tool cache', function () {
    Cache::put('readiness.tool.larakube', ['installed' => true, 'path' => '/usr/local/bin/larakube', 'version' => '0.34.0']);

    $wsl = Mockery::mock(Wsl::class)->makePartial();
    $wsl->shouldReceive('isWindows')->andReturn(true);
    $wsl->shouldReceive('backupUserHome')->andReturn(['ok' => true, 'path' => 'C:\\backup.tar.gz', 'message' => 'Backed up']);
    app()->instance(Wsl::class, $wsl);

    $this->post('/setup/wsl/backup')
        ->assertOk()
        ->assertJson(['ok' => true, 'path' => 'C:\\backup.tar.gz']);

    expect(Cache::has('readiness.tool.larakube'))->toBeTrue();
});

test('the restore step passes the given path through to restoreUserHome', function () {
    $wsl = Mockery::mock(Wsl::class)->makePartial();
    $wsl->shouldReceive('isWindows')->andReturn(true);
    $wsl->shouldReceive('restoreUserHome')->once()->with('C:\\backups\\home-backup-x.tar.gz')
        ->andReturn(['ok' => true, 'message' => 'Your projects were restored.']);
    app()->instance(Wsl::class, $wsl);

    $this->postJson('/setup/wsl/restore', ['path' => 'C:\\backups\\home-backup-x.tar.gz'])
        ->assertOk()
        ->assertJson(['ok' => true, 'message' => 'Your projects were restored.']);
});

test('the restore step requires a path', function () {
    $wsl = Mockery::mock(Wsl::class)->makePartial();
    $wsl->shouldReceive('isWindows')->andReturn(true);
    app()->instance(Wsl::class, $wsl);

    $this->postJson('/setup/wsl/restore', [])->assertStatus(422);
});
