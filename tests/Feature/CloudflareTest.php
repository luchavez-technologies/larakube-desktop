<?php

use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\Process;

beforeEach(function () {
    app()->bind(ToolLocator::class, function () {
        $mock = Mockery::mock(ToolLocator::class);
        $mock->shouldReceive('find')->with('larakube')->andReturn('/usr/local/bin/larakube');
        $mock->shouldReceive('isolate')->andReturnUsing(function ($cmd) {
            return ['command' => $cmd, 'environment' => []];
        });

        return $mock;
    });
});

test('returns 422 if token is empty', function () {
    $response = $this->postJson(route('cloudflare.verify_token'), ['token' => '   ']);

    $response->assertStatus(422)
        ->assertJson([
            'valid' => false,
            'code' => 'missing_token',
        ]);
});

test('returns valid when CLI verification succeeds', function () {
    Process::fake([
        '*dns:verify*' => Process::result(output: json_encode([
            'valid' => true,
            'status' => 'active',
            'zones' => ['example.com', 'larakube.app'],
            'checks' => [
                'token_active' => true,
                'zones_accessible' => true,
                'dns_edit' => true,
                'ssl_read' => true,
            ],
            'errors' => [],
        ])),
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

test('returns invalid when CLI verification flags missing permissions', function () {
    Process::fake([
        '*dns:verify*' => Process::result(output: json_encode([
            'valid' => false,
            'status' => 'active',
            'zones' => ['example.com'],
            'checks' => [
                'token_active' => true,
                'zones_accessible' => true,
                'dns_edit' => false,
                'ssl_read' => true,
            ],
            'errors' => ['Token is missing "Zone -> DNS -> Edit" permissions.'],
        ]), exitCode: 1),
    ]);

    $response = $this->postJson(route('cloudflare.verify_token'), ['token' => 'missing-dns-edit']);

    $response->assertOk()
        ->assertJson([
            'valid' => false,
            'error' => 'Token is missing "Zone -> DNS -> Edit" permissions.',
            'zones' => ['example.com'],
            'permissions' => [
                'token' => true,
                'dns_edit' => false,
            ],
        ]);
});

test('returns 500 when CLI output is not valid json', function () {
    Process::fake([
        '*dns:verify*' => Process::result(output: 'Fatal error occurred', exitCode: 1),
    ]);

    $response = $this->postJson(route('cloudflare.verify_token'), ['token' => 'bad-token']);

    $response->assertStatus(500)
        ->assertJson([
            'valid' => false,
            'code' => 'invalid_response',
        ]);
});
