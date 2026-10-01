<?php

use App\Enums\RunKind;
use App\Models\Run;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Native\Desktop\Facades\ChildProcess;

function clusterAccessSandbox(): array
{
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    $bin = "{$home}/bin";
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    $_SERVER['HOME'] = realpath($home);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    return ['home' => realpath($home), 'bin' => $bin];
}

test('cluster grant access starts run with scope and role arguments', function () {
    $sandbox = clusterAccessSandbox();
    $stacks = mock(StackCatalog::class);
    $stacks->shouldReceive('find')->with('prod-vps')->andReturn([
        'name' => 'prod-vps',
        'provider' => 'digitalocean',
        'context' => 'larakube-do-ams3',
        'status' => 'ready',
    ]);
    app()->instance(StackCatalog::class, $stacks);

    $fake = ChildProcess::fake();
    $bin = "{$sandbox['bin']}/larakube";

    $this->post(route('servers.access.grant', ['server' => 'prod-vps']), [
        'name' => 'alice',
        'role' => 'edit',
        'scope' => 'production',
    ])->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'cluster:grant', '--name=alice', '--context=larakube-do-ams3', '--edit', '--namespaces=production', '--no-interaction',
    ]);
    expect(Run::sole()->kind)->toBe(RunKind::ClusterGrant);

    File::deleteDirectory($sandbox['home']);
});

test('cluster revoke access starts run with user argument', function () {
    $sandbox = clusterAccessSandbox();
    $stacks = mock(StackCatalog::class);
    $stacks->shouldReceive('find')->with('prod-vps')->andReturn([
        'name' => 'prod-vps',
        'provider' => 'digitalocean',
        'context' => 'larakube-do-ams3',
        'status' => 'ready',
    ]);
    app()->instance(StackCatalog::class, $stacks);

    $fake = ChildProcess::fake();
    $bin = "{$sandbox['bin']}/larakube";

    $this->post(route('servers.access.revoke', ['server' => 'prod-vps']), [
        'name' => 'bob',
    ])->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'cluster:revoke', 'bob', '--context=larakube-do-ams3', '--no-interaction',
    ]);
    expect(Run::sole()->kind)->toBe(RunKind::ClusterRevoke);

    File::deleteDirectory($sandbox['home']);
});
