<?php

use App\Enums\RunKind;
use App\Models\Run;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Native\Desktop\Facades\ChildProcess;
use Native\Desktop\Facades\Shell;

function clusterAccessSandbox(): array
{
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    $bin = "{$home}/bin";
    $downloads = "{$home}/Downloads";
    File::ensureDirectoryExists($bin);
    File::ensureDirectoryExists($downloads);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    $_SERVER['HOME'] = realpath($home);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    return ['home' => realpath($home), 'bin' => $bin, 'downloads' => realpath($downloads)];
}

test('cluster grant access starts run with scope, role, and output arguments', function () {
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
    $kubePath = "{$sandbox['downloads']}/alice.kubeconfig";
    $rbacPath = "{$sandbox['downloads']}/alice-rbac.yaml";

    $this->post(route('servers.access.grant', ['server' => 'prod-vps']), [
        'name' => 'alice',
        'role' => 'edit',
        'scope' => 'production',
    ])->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'cluster:grant', '--name=alice', '--context=larakube-do-ams3', '--edit', "--output={$kubePath}", "--export-rbac={$rbacPath}", '--namespaces=production', '--no-interaction',
    ]);
    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::ClusterGrant)
        ->and($run->meta['kubeconfigPath'])->toBe($kubePath)
        ->and($run->meta['rbacPath'])->toBe($rbacPath);

    File::deleteDirectory($sandbox['home']);
});

test('cluster grant access defaults to production namespace when scope is omitted', function () {
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
    $kubePath = "{$sandbox['downloads']}/alice.kubeconfig";
    $rbacPath = "{$sandbox['downloads']}/alice-rbac.yaml";

    $this->post(route('servers.access.grant', ['server' => 'prod-vps']), [
        'name' => 'alice',
        'role' => 'edit',
    ])->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'cluster:grant', '--name=alice', '--context=larakube-do-ams3', '--edit', "--output={$kubePath}", "--export-rbac={$rbacPath}", '--namespaces=production', '--no-interaction',
    ]);

    File::deleteDirectory($sandbox['home']);
});

test('cluster grant access passes --cluster flag when cluster is true', function () {
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
    $kubePath = "{$sandbox['downloads']}/alice.kubeconfig";
    $rbacPath = "{$sandbox['downloads']}/alice-rbac.yaml";

    $this->post(route('servers.access.grant', ['server' => 'prod-vps']), [
        'name' => 'alice',
        'role' => 'admin',
        'cluster' => true,
    ])->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'cluster:grant', '--name=alice', '--context=larakube-do-ams3', '--admin', "--output={$kubePath}", "--export-rbac={$rbacPath}", '--cluster', '--no-interaction',
    ]);

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

test('runs.reveal shows kubeconfig in folder', function () {
    $sandbox = clusterAccessSandbox();
    $kube = "{$sandbox['downloads']}/test.kubeconfig";
    File::put($kube, 'content');

    $run = Run::create([
        'label' => 'Grant access',
        'kind' => RunKind::ClusterGrant,
        'command' => ['larakube'],
        'meta' => ['kubeconfigPath' => $kube],
    ]);

    Shell::shouldReceive('showInFolder')->once()->with($kube);

    $this->post(route('runs.reveal', $run), ['type' => 'kubeconfig'])
        ->assertRedirect();

    File::deleteDirectory($sandbox['home']);
});

test('runs.file returns file content as json', function () {
    $sandbox = clusterAccessSandbox();
    $kube = "{$sandbox['downloads']}/test.kubeconfig";
    File::put($kube, 'secret-kubeconfig-content');

    $run = Run::create([
        'label' => 'Grant access',
        'kind' => RunKind::ClusterGrant,
        'command' => ['larakube'],
        'meta' => ['kubeconfigPath' => $kube],
    ]);

    $this->get(route('runs.file', ['run' => $run, 'type' => 'kubeconfig']))
        ->assertOk()
        ->assertJson([
            'type' => 'kubeconfig',
            'path' => $kube,
            'content' => 'secret-kubeconfig-content',
        ]);

    File::deleteDirectory($sandbox['home']);
});
