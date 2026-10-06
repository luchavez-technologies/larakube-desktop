<?php

use App\Services\LaraKube\HealthPing;
use Illuminate\Support\Facades\Http;

test('health ping measures 200 OK latency and tracks history', function () {
    Http::fake([
        'https://my-app.test/up' => Http::response('OK', 200),
    ]);

    $pinger = new HealthPing;
    $result = $pinger->check('my-app.test');

    expect($result['isUp'])->toBeTrue()
        ->and($result['status'])->toBe(200)
        ->and($result['latencyMs'])->toBeInt()
        ->and(count($result['history']))->toBe(1);

    // Second ping should add to history
    $second = $pinger->check('my-app.test');
    expect(count($second['history']))->toBe(2);
});

test('health ping handles unreachable endpoint gracefully', function () {
    Http::fake([
        '*' => function () {
            throw new Exception('Connection refused');
        },
    ]);

    $pinger = new HealthPing;
    $result = $pinger->check('unreachable.test');

    expect($result['isUp'])->toBeFalse()
        ->and($result['status'])->toBeNull()
        ->and($result['latencyMs'])->toBeNull();
});

test('health ping returns false for empty url', function () {
    $pinger = new HealthPing;
    $result = $pinger->check(null);

    expect($result['isUp'])->toBeFalse()
        ->and($result['status'])->toBeNull()
        ->and($result['history'])->toBeEmpty();
});
