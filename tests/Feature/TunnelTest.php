<?php

use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Native\Desktop\Facades\ChildProcess;

function tunnelSandbox(): array
{
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    $bin = "{$home}/bin";
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/kubectl", "#!/bin/sh\n");
    chmod("{$bin}/kubectl", 0755);
    $_SERVER['HOME'] = realpath($home);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    return ['home' => realpath($home), 'bin' => $bin];
}

test('tunnels index returns empty list by default', function () {
    $response = $this->getJson(route('tunnels.index'));

    $response->assertOk()
        ->assertJson([
            'success' => true,
            'tunnels' => [],
        ]);
});

test('tunnels start validates required fields and port ranges', function () {
    $this->postJson(route('tunnels.start'), [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['namespace', 'service', 'localPort', 'remotePort']);

    $this->postJson(route('tunnels.start'), [
        'namespace' => 'larakube-plex',
        'service' => 'postgres',
        'localPort' => 99999,
        'remotePort' => 0,
    ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['localPort', 'remotePort']);
});

test('tunnels start launches kubectl port-forward child process', function () {
    $sandbox = tunnelSandbox();
    $fake = ChildProcess::fake();

    $response = $this->postJson(route('tunnels.start'), [
        'namespace' => 'larakube-plex',
        'service' => 'postgres',
        'localPort' => 5432,
        'remotePort' => 5432,
    ]);

    $response->assertOk()
        ->assertJsonPath('success', true);

    $fake->assertStarted(function (array|string $cmd, string $alias, mixed ...$rest): bool {
        return $alias === 'tunnel:larakube-plex_postgres_5432'
            && in_array('port-forward', (array) $cmd, true)
            && in_array('svc/postgres', (array) $cmd, true)
            && in_array('5432:5432', (array) $cmd, true);
    });

    File::deleteDirectory($sandbox['home']);
});

test('tunnels stop terminates child process and removes from active list', function () {
    $sandbox = tunnelSandbox();
    $fake = ChildProcess::fake();

    $this->postJson(route('tunnels.start'), [
        'namespace' => 'larakube-plex',
        'service' => 'postgres',
        'localPort' => 5432,
        'remotePort' => 5432,
    ])->assertOk();

    $response = $this->postJson(route('tunnels.stop'), [
        'namespace' => 'larakube-plex',
        'service' => 'postgres',
        'localPort' => 5432,
    ]);

    $response->assertOk()
        ->assertJsonPath('success', true)
        ->assertJsonMissingPath('tunnels.larakube-plex_postgres_5432');

    File::deleteDirectory($sandbox['home']);
});
