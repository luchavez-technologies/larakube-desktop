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

test('passes the token via the environment, pins the host context, and handles NUL-padded output safely', function () {
    $capturedExtraEnv = null;
    $capturedCommand = null;
    app()->bind(ToolLocator::class, function () use (&$capturedExtraEnv, &$capturedCommand) {
        $mock = Mockery::mock(ToolLocator::class);
        $mock->shouldReceive('find')->with('larakube')->andReturn('C:\\Users\\Demo\\.larakube\\bin\\larakube.exe');
        $mock->shouldReceive('isolate')->andReturnUsing(function ($cmd, $extraEnv = []) use (&$capturedExtraEnv, &$capturedCommand) {
            $capturedExtraEnv = $extraEnv;
            $capturedCommand = $cmd;

            return ['command' => $cmd, 'environment' => $extraEnv];
        });

        return $mock;
    });

    $json = json_encode([
        'valid' => true,
        'status' => 'active',
        'zones' => ['example.com'],
        'checks' => [
            'token_active' => true,
            'zones_accessible' => true,
            'dns_edit' => true,
            'ssl_read' => true,
        ],
        'errors' => [],
    ]);

    Process::fake([
        '*dns:verify*' => Process::result(output: implode("\0", str_split((string) $json))),
    ]);

    $response = $this->postJson(route('cloudflare.verify_token'), ['token' => 'good-token']);

    $response->assertOk()->assertJson(['valid' => true]);
    expect($capturedExtraEnv)->toBe(['LARAKUBE_EXECUTION_CONTEXT' => 'host', 'LARAKUBE_CLOUDFLARE_TOKEN' => 'good-token'])
        ->and(implode(' ', $capturedCommand))->not->toContain('good-token');
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
    expect((string) $response->json('error'))->toContain('Fatal error occurred');
});

test('surfaces CLI update hint when WSL dispatch error occurs on Windows', function () {
    Process::fake([
        '*dns:verify*' => Process::result(errorOutput: "W\0s\0l\0/\0S\0e\0r\0v\0i\0c\0e\0/\0C\0r\0e\0a\0t\0e\0I\0n\0s\0t\0a\0n\0c\0e\0 \0f\0a\0i\0l\0e\0d\0", exitCode: 1),
    ]);

    $response = $this->postJson(route('cloudflare.verify_token'), ['token' => 'good-token']);

    $response->assertStatus(500)
        ->assertJson([
            'valid' => false,
            'code' => 'invalid_response',
        ]);
    expect((string) $response->json('error'))->toContain('Update the LaraKube CLI in Setup');
});
