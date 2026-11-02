<?php

use App\Enums\RunKind;
use App\Models\Run;
use App\Services\LaraKube\OpenBaoStatus;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Native\Desktop\Facades\ChildProcess;

function openBaoTestServer(): string
{
    $bin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    $stacks = mock(StackCatalog::class);
    $stacks->shouldReceive('all')->andReturn([
        [
            'name' => 'prod-vps',
            'provider' => 'digitalocean',
            'kind' => 'vps',
            'region' => 'ams3',
            'ip' => '1.2.3.4',
            'context' => 'larakube-do-ams3',
            'status' => 'ready',
        ],
    ]);
    $stacks->shouldReceive('find')->with('prod-vps')->andReturn([
        'name' => 'prod-vps',
        'provider' => 'digitalocean',
        'kind' => 'vps',
        'region' => 'ams3',
        'ip' => '1.2.3.4',
        'context' => 'larakube-do-ams3',
        'status' => 'ready',
    ]);
    $stacks->shouldReceive('find')->with('non-existent')->andReturn(null);
    app()->instance(StackCatalog::class, $stacks);

    return "{$bin}/larakube";
}

test('/openbao redirects to the first ready server', function () {
    openBaoTestServer();

    $this->get('/openbao')
        ->assertRedirect(route('servers.openbao.index', 'prod-vps'));
});

test('viewing openbao page for unready server returns 404', function () {
    openBaoTestServer();

    $this->get(route('servers.openbao.index', 'non-existent'))
        ->assertNotFound();
});

test('viewing openbao page renders openbao/index with installation status', function () {
    openBaoTestServer();

    $status = mock(OpenBaoStatus::class);
    $status->shouldReceive('isInstalled')->with('larakube-do-ams3')->andReturn(true);
    $status->shouldReceive('status')->with('larakube-do-ams3')->andReturn([
        'installed' => true,
        'bootstrapped' => true,
        'sealed' => false,
        'staticRoles' => [],
        'customEnv' => [],
    ]);
    $status->shouldReceive('syncState')->with('larakube-do-ams3')->andReturn([
        'status' => 'fresh', 'lastSyncedAt' => now()->toAtomString(), 'error' => null,
    ]);
    app()->instance(OpenBaoStatus::class, $status);

    $this->get(route('servers.openbao.index', 'prod-vps'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('openbao/index')
            ->where('server.name', 'prod-vps')
            ->where('isInstalled', true)
        );
});

test('sealing OpenBao starts an openbao-seal run', function () {
    $bin = openBaoTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.openbao.seal', 'prod-vps'))
        ->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'secrets:seal', 'production', '--context=larakube-do-ams3', '--force', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::OpenBaoSeal);
});

test('unsealing OpenBao starts an openbao-unseal run', function () {
    $bin = openBaoTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.openbao.unseal', 'prod-vps'))
        ->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'secrets:unseal', 'production', '--context=larakube-do-ams3', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::OpenBaoUnseal);
});

test('rotating a tool starts an openbao-rotate run', function () {
    $bin = openBaoTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.openbao.rotate', 'prod-vps'), [
        'tool' => 'forgejo',
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'secrets:rotate', 'production', '--context=larakube-do-ams3', '--tool=forgejo', '--force', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::OpenBaoRotate)
        ->and($run->subject)->toBe('forgejo');
});

test('granting access starts an openbao-grant run', function () {
    $bin = openBaoTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.openbao.grant', 'prod-vps'), [
        'app' => 'blog',
        'email' => 'dev@example.com',
        'role' => 'viewer',
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'secrets:grant', 'production', '--context=larakube-do-ams3',
            '--app=blog', '--email=dev@example.com', '--role=viewer', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::OpenBaoGrant)
        ->and($run->subject)->toBe('dev@example.com');
});

test('revoking access starts an openbao-revoke run', function () {
    $bin = openBaoTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.openbao.revoke', 'prod-vps'), [
        'app' => 'blog',
        'email' => 'dev@example.com',
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'secrets:revoke', 'production', '--context=larakube-do-ams3',
            '--app=blog', '--email=dev@example.com', '--force', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::OpenBaoRevoke);
});

test('exporting secrets starts an openbao-export run', function () {
    $bin = openBaoTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.openbao.export', 'prod-vps'))
        ->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'secrets:export', 'production', '--context=larakube-do-ams3', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::OpenBaoExport);
});

test('importing secrets starts an openbao-import run when the retyped server name matches', function () {
    $bin = openBaoTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.openbao.import', 'prod-vps'), [
        'path' => '/tmp/secrets-export.json',
        'confirm' => 'prod-vps',
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'secrets:import', 'production', '--context=larakube-do-ams3',
            '--input=/tmp/secrets-export.json', '--force', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::OpenBaoImport);
});

test('importing secrets refuses when the retyped server name does not match', function () {
    openBaoTestServer();
    ChildProcess::fake();

    $this->post(route('servers.openbao.import', 'prod-vps'), [
        'path' => '/tmp/secrets-export.json',
        'confirm' => 'not-prod-vps',
    ])->assertStatus(422);

    expect(Run::count())->toBe(0);
});
