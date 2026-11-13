<?php

use App\Providers\AppServiceProvider;
use Illuminate\Support\Facades\DB;

test('nativephp sqlite connection gets WAL mode and busy_timeout', function () {
    config([
        'database.connections.nativephp' => [
            'driver' => 'sqlite',
            'database' => ':memory:',
            'prefix' => '',
            'foreign_key_constraints' => true,
        ],
    ]);

    app()->register(AppServiceProvider::class, true);
    app()->boot();

    $conn = config('database.connections.nativephp');

    expect($conn['busy_timeout'] ?? null)->toBe(10000)
        ->and($conn['journal_mode'] ?? null)->toBe('WAL')
        ->and($conn['synchronous'] ?? null)->toBe('NORMAL')
        ->and($conn['transaction_mode'] ?? null)->toBe('DEFERRED');

    DB::purge('nativephp');
});
