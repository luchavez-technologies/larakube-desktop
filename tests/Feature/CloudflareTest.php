<?php

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

test('returns 422 if token is empty', function () {
    $response = $this->postJson(route('cloudflare.verify_token'), ['token' => '   ']);

    $response->assertStatus(422)
        ->assertJson([
            'valid' => false,
            'code' => 'missing_token',
        ]);
});

test('returns invalid when token is rejected by Cloudflare', function () {
    Http::fake([
        'https://api.cloudflare.com/client/v4/user/tokens/verify' => Http::response([
            'success' => false,
            'errors' => [['code' => 1000, 'message' => 'Invalid API Token']],
        ], 401),
    ]);

    $response = $this->postJson(route('cloudflare.verify_token'), ['token' => 'bad-token']);

    $response->assertOk()
        ->assertJson([
            'valid' => false,
            'code' => 'invalid_token',
            'error' => 'Invalid API Token',
        ]);
});

test('returns error when token is missing zone read permission', function () {
    Http::fake([
        'https://api.cloudflare.com/client/v4/user/tokens/verify' => Http::response([
            'success' => true,
            'result' => ['id' => 'tok-1', 'status' => 'active'],
        ], 200),
        'https://api.cloudflare.com/client/v4/zones*' => Http::response([
            'success' => false,
            'errors' => [['code' => 9109, 'message' => 'Unauthorized to access requested resource']],
        ], 403),
    ]);

    $response = $this->postJson(route('cloudflare.verify_token'), ['token' => 'valid-token']);

    $response->assertOk()
        ->assertJson([
            'valid' => false,
            'code' => 'missing_zone_read',
        ]);
});

test('returns error when token is missing dns edit permission', function () {
    Http::fake([
        'https://api.cloudflare.com/client/v4/user/tokens/verify' => Http::response([
            'success' => true,
            'result' => ['id' => 'tok-1', 'status' => 'active'],
        ], 200),
        'https://api.cloudflare.com/client/v4/zones?per_page=10' => Http::response([
            'success' => true,
            'result' => [
                ['id' => 'zone-1', 'name' => 'example.com'],
            ],
        ], 200),
        'https://api.cloudflare.com/client/v4/zones/zone-1/dns_records*' => Http::response([
            'success' => false,
            'errors' => [['code' => 9109, 'message' => 'Unauthorized']],
        ], 403),
    ]);

    $response = $this->postJson(route('cloudflare.verify_token'), ['token' => 'missing-dns-token']);

    $response->assertOk()
        ->assertJson([
            'valid' => false,
            'code' => 'missing_dns_edit',
            'zones' => ['example.com'],
        ]);
});

test('returns error when token is missing zone settings read permission', function () {
    Http::fake([
        'https://api.cloudflare.com/client/v4/user/tokens/verify' => Http::response([
            'success' => true,
            'result' => ['id' => 'tok-1', 'status' => 'active'],
        ], 200),
        'https://api.cloudflare.com/client/v4/zones?per_page=10' => Http::response([
            'success' => true,
            'result' => [
                ['id' => 'zone-1', 'name' => 'example.com'],
            ],
        ], 200),
        'https://api.cloudflare.com/client/v4/zones/zone-1/dns_records*' => Http::response([
            'success' => true,
            'result' => [],
        ], 200),
        'https://api.cloudflare.com/client/v4/zones/zone-1/settings/ssl' => Http::response([
            'success' => false,
            'errors' => [['code' => 9109, 'message' => 'Unauthorized']],
        ], 403),
    ]);

    $response = $this->postJson(route('cloudflare.verify_token'), ['token' => 'missing-settings-token']);

    $response->assertOk()
        ->assertJson([
            'valid' => false,
            'code' => 'missing_zone_settings_read',
            'zones' => ['example.com'],
        ]);
});

test('returns valid when all required permissions are present', function () {
    Http::fake([
        'https://api.cloudflare.com/client/v4/user/tokens/verify' => Http::response([
            'success' => true,
            'result' => ['id' => 'tok-1', 'status' => 'active'],
        ], 200),
        'https://api.cloudflare.com/client/v4/zones?per_page=10' => Http::response([
            'success' => true,
            'result' => [
                ['id' => 'zone-1', 'name' => 'example.com'],
                ['id' => 'zone-2', 'name' => 'larakube.app'],
            ],
        ], 200),
        'https://api.cloudflare.com/client/v4/zones/zone-1/dns_records*' => Http::response([
            'success' => true,
            'result' => [],
        ], 200),
        'https://api.cloudflare.com/client/v4/zones/zone-1/settings/ssl' => Http::response([
            'success' => true,
            'result' => ['value' => 'full'],
        ], 200),
    ]);

    $response = $this->postJson(route('cloudflare.verify_token'), ['token' => 'good-token']);

    $response->assertOk()
        ->assertJson([
            'valid' => true,
            'zones' => ['example.com', 'larakube.app'],
            'permissions' => [
                'token' => true,
                'zone_read' => true,
                'dns_edit' => true,
                'zone_settings_read' => true,
            ],
        ]);
});

test('handles network failure gracefully', function () {
    Http::fake([
        'https://api.cloudflare.com/client/v4/user/tokens/verify' => function () {
            throw new ConnectionException('Network down');
        },
    ]);

    $response = $this->postJson(route('cloudflare.verify_token'), ['token' => 'any-token']);

    $response->assertOk()
        ->assertJson([
            'valid' => false,
            'code' => 'connection_failed',
        ]);
});
