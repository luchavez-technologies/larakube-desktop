<?php

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Native\Desktop\Facades\ChildProcess;

test('runtime diagnostics endpoint returns child processes, pending jobs, and failed jobs', function () {
    ChildProcess::fake();

    $uuid = (string) Str::uuid();
    DB::table('jobs')->insert([
        'queue' => 'sync',
        'payload' => json_encode(['displayName' => 'App\\Jobs\\Sync\\SyncCloudProvidersJob']),
        'attempts' => 1,
        'reserved_at' => null,
        'available_at' => time(),
        'created_at' => time(),
    ]);
    DB::table('failed_jobs')->insert([
        'uuid' => $uuid,
        'connection' => 'database',
        'queue' => 'default',
        'payload' => json_encode(['displayName' => 'App\\Jobs\\Sync\\SyncServersJob']),
        'exception' => "RuntimeException: database is locked\n#0 stack",
        'failed_at' => now()->toDateTimeString(),
    ]);

    $response = $this->getJson('/diagnostics/runtime')->assertOk();

    $processes = collect($response->json('processes'))->pluck('alias')->all();
    expect($processes)->toContain('queue_default', 'queue_sync', 'scheduler')
        ->and($response->json('pending.total'))->toBe(1)
        ->and($response->json('pending.items.0.name'))->toBe('App\\Jobs\\Sync\\SyncCloudProvidersJob')
        ->and($response->json('failed.total'))->toBe(1)
        ->and($response->json('failed.items.0.uuid'))->toBe($uuid)
        ->and($response->json('failed.items.0.summary'))->toBe('RuntimeException: database is locked');
});

test('runtime diagnostics can retry and flush failed jobs', function () {
    $uuid = (string) Str::uuid();

    Artisan::shouldReceive('call')
        ->once()
        ->with('queue:retry', ['id' => [$uuid]])
        ->andReturn(0);

    $this->postJson("/diagnostics/queues/retry/{$uuid}")
        ->assertOk()
        ->assertJson(['ok' => true]);

    Artisan::shouldReceive('call')
        ->once()
        ->with('queue:flush')
        ->andReturn(0);

    $this->postJson('/diagnostics/queues/flush')
        ->assertOk()
        ->assertJson(['ok' => true]);
});

test('runtime diagnostics restricts restart to system workers and stop to non-system processes', function () {
    ChildProcess::fake();

    $this->postJson('/diagnostics/processes/queue_sync/restart')
        ->assertOk()
        ->assertJson(['ok' => true]);

    $this->postJson('/diagnostics/processes/run-42/restart')
        ->assertStatus(422)
        ->assertJson(['ok' => false]);

    $this->postJson('/diagnostics/processes/queue_sync/stop')
        ->assertStatus(422)
        ->assertJson(['ok' => false]);

    $this->postJson('/diagnostics/processes/run-42/stop')
        ->assertOk()
        ->assertJson(['ok' => true]);
});
