<?php

use App\Enums\RunKind;
use App\Jobs\Sync\SyncClusterToolsJob;
use App\Jobs\Sync\SyncSsoJob;
use App\Models\Run;
use App\Models\Server;
use App\Services\LaraKube\SsoStatus;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Queue;
use Native\Desktop\Events\ChildProcess\ProcessExited;
use Native\Desktop\Facades\ChildProcess;
use Symfony\Component\Process\Exception\ProcessTimedOutException as SymfonyTimedOut;
use Symfony\Component\Process\Process as SymfonyProcess;

function ssoTestServer(): string
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

test('/sso redirects to the first ready server', function () {
    ssoTestServer();

    $this->get('/sso')
        ->assertRedirect(route('servers.sso.index', 'prod-vps'));
});

test('viewing sso page for unready server returns 404', function () {
    ssoTestServer();

    $this->get(route('servers.sso.index', 'non-existent'))
        ->assertNotFound();
});

test('viewing sso page renders sso/index with installation status', function () {
    ssoTestServer();

    $status = mock(SsoStatus::class);
    $status->shouldReceive('isInstalled')->with('larakube-do-ams3')->andReturn(true);
    $status->shouldReceive('status')->with('larakube-do-ams3')->andReturn([
        'installed' => true,
    ]);
    $status->shouldReceive('syncState')->with('larakube-do-ams3')->andReturn([
        'status' => 'fresh', 'lastSyncedAt' => now()->toAtomString(), 'error' => null,
    ]);
    app()->instance(SsoStatus::class, $status);

    $this->get(route('servers.sso.index', 'prod-vps'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('sso/index', false)
            ->where('server.name', 'prod-vps')
            ->where('isInstalled', true)
        );
});

test('refreshing SSO calls forget on SsoStatus and redirects back', function () {
    ssoTestServer();

    $status = mock(SsoStatus::class);
    $status->shouldReceive('forget')->with('larakube-do-ams3')->once();
    app()->instance(SsoStatus::class, $status);

    $this->post(route('servers.sso.refresh', 'prod-vps'))
        ->assertRedirect();
});

test('refreshing SSO marks the row stale and dispatches SyncSsoJob', function () {
    Queue::fake();

    $server = Server::create([
        'name' => 'prod-vps',
        'context' => 'larakube-do-ams3',
        'provider' => 'digitalocean',
        'kind' => 'vps',
        'status' => 'ready',
    ]);
    $tool = $server->clusterTools()->create([
        'tool' => 'sso',
        'installed' => true,
        'data' => ['status' => ['installed' => true]],
        'sync_status' => 'fresh',
        'last_synced_at' => now()->subMinutes(20),
    ]);

    ssoTestServer();

    $this->post(route('servers.sso.refresh', 'prod-vps'))
        ->assertRedirect();

    $tool->refresh();
    expect($tool->sync_status)->toBe('stale');

    Queue::assertPushed(SyncSsoJob::class, fn (SyncSsoJob $job) => $job->serverId === $server->id);
});

test('wiring a tool starts an sso-wire run', function () {
    $bin = ssoTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.sso.wire', 'prod-vps'), [
        'tool' => 'forgejo',
        'domain' => 'git.example.com',
        'admin_email' => 'admin@example.com',
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'sso:wire', 'production', '--context=larakube-do-ams3',
            '--tool=forgejo', '--domain=git.example.com', '--admin-email=admin@example.com', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::SsoWire)
        ->and($run->subject)->toBe('forgejo');
});

test('unwiring a tool starts an sso-unwire run', function () {
    $bin = ssoTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.sso.unwire', 'prod-vps'), [
        'tool' => 'forgejo',
        'domain' => 'git.example.com',
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'sso:unwire', 'production', '--context=larakube-do-ams3',
            '--tool=forgejo', '--domain=git.example.com', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::SsoUnwire)
        ->and($run->subject)->toBe('forgejo');
});

test('granting access starts an sso-grant run', function () {
    $bin = ssoTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.sso.grant', 'prod-vps'), [
        'email' => 'dev@example.com',
        'tool' => 'forgejo',
        'domain' => 'git.example.com',
        'role' => 'admin',
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'sso:grant', 'production', '--context=larakube-do-ams3',
            '--email=dev@example.com', '--tool=forgejo', '--domain=git.example.com', '--role=admin', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::SsoGrant)
        ->and($run->subject)->toBe('dev@example.com');
});

test('revoking access starts an sso-revoke run', function () {
    $bin = ssoTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.sso.revoke', 'prod-vps'), [
        'email' => 'dev@example.com',
        'role' => 'admin',
        'domain' => 'git.example.com',
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'sso:revoke', 'production', '--context=larakube-do-ams3',
            '--email=dev@example.com', '--role=admin', '--domain=git.example.com', '--force', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::SsoRevoke)
        ->and($run->subject)->toBe('dev@example.com');
});

test('creating a user starts an sso-create run', function () {
    $bin = ssoTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.sso.create', 'prod-vps'), [
        'email' => 'dev@example.com',
        'name' => 'Alice',
        'password' => 'secret123',
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'sso:create', 'production', '--context=larakube-do-ams3',
            '--email=dev@example.com', '--name=Alice', '--password=secret123', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::SsoCreate)
        ->and($run->subject)->toBe('dev@example.com');
});

test('configuring an organization starts an sso-org run', function () {
    $bin = ssoTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.sso.org', 'prod-vps'), [
        'zone' => 'example.com',
        'cloudflare_token' => 'cf-token-123',
        'org_name' => 'My Org',
        'admin_email' => 'admin@example.com',
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'sso:org', 'production', '--context=larakube-do-ams3',
            '--zone=example.com', '--cloudflare-token=cf-token-123', '--org-name=My Org',
            '--admin-email=admin@example.com', '--force', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::SsoOrg)
        ->and($run->subject)->toBe('example.com');
});

test('granting organization access starts an sso-org-grant run', function () {
    $bin = ssoTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.sso.org-grant', 'prod-vps'), [
        'org' => 'my-org',
        'tool' => 'forgejo',
        'domain' => 'git.example.com',
        'project' => 'my-proj',
        'role' => ['admin', 'viewer'],
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'sso:org-grant', 'production', '--context=larakube-do-ams3',
            '--org=my-org', '--tool=forgejo', '--domain=git.example.com',
            '--project=my-proj', '--role=admin', '--role=viewer', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::SsoOrgGrant)
        ->and($run->subject)->toBe('my-org');
});

test('pruning projects starts an sso-prune run', function () {
    $bin = ssoTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.sso.prune', 'prod-vps'), [
        'project' => ['proj-1', 'proj-2'],
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'sso:prune', 'production', '--context=larakube-do-ams3',
            '--project=proj-1', '--project=proj-2', '--force', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::SsoPrune);
});

test('a run that changes SSO dispatches SyncSsoJob on completion', function () {
    Queue::fake();

    $server = Server::create([
        'name' => 'prod-vps',
        'provider' => 'digitalocean',
        'kind' => 'vps',
        'context' => 'larakube-do-ams3',
        'status' => 'ready',
    ]);

    $run = Run::create([
        'label' => 'Wire forgejo SSO on prod-vps',
        'command' => ['larakube', 'sso:wire'],
        'kind' => RunKind::SsoWire,
        'meta' => ['server' => 'prod-vps', 'context' => 'larakube-do-ams3'],
    ]);

    event(new ProcessExited($run->alias(), 0));

    Queue::assertPushed(SyncSsoJob::class, fn (SyncSsoJob $job) => $job->serverId === $server->id);
});

test('forget dispatches SyncClusterToolsJob when sso tool row is missing', function () {
    Queue::fake();

    $server = Server::create([
        'name' => 'prod-vps',
        'provider' => 'digitalocean',
        'kind' => 'vps',
        'context' => 'larakube-do-ams3',
        'status' => 'ready',
    ]);

    app(SsoStatus::class)->forget('larakube-do-ams3');

    Queue::assertPushed(SyncClusterToolsJob::class, fn (SyncClusterToolsJob $job) => $job->serverId === $server->id);
    Queue::assertNotPushed(SyncSsoJob::class);
});

test('an SSO tool mid-sync is left alone instead of triggering another sync', function () {
    Queue::fake();

    $server = Server::create([
        'name' => 'prod-vps',
        'provider' => 'digitalocean',
        'kind' => 'vps',
        'context' => 'larakube-do-ams3',
        'status' => 'ready',
    ]);
    $tool = $server->clusterTools()->create([
        'tool' => 'sso',
        'installed' => true,
        'data' => ['status' => ['installed' => true]],
        'sync_status' => 'syncing',
        'last_synced_at' => now()->subMinutes(20),
    ]);

    $status = app(SsoStatus::class);
    expect($status->isInstalled('larakube-do-ams3'))->toBeTrue()
        ->and($status->status('larakube-do-ams3'))->toBe(['installed' => true]);

    Queue::assertNotPushed(SyncSsoJob::class);
    Queue::assertNotPushed(SyncClusterToolsJob::class);
});

test('a stale or partially-synced SSO tool triggers SyncSsoJob', function () {
    Queue::fake();

    $server = Server::create([
        'name' => 'prod-vps',
        'provider' => 'digitalocean',
        'kind' => 'vps',
        'context' => 'larakube-do-ams3',
        'status' => 'ready',
    ]);
    $server->clusterTools()->create([
        'tool' => 'sso',
        'installed' => true,
        'data' => ['status' => ['installed' => true]],
        'sync_status' => 'fresh',
        'last_synced_at' => now()->subSeconds(SyncSsoJob::FRESH_SECONDS + 10),
    ]);

    $status = app(SsoStatus::class);
    $status->isInstalled('larakube-do-ams3');

    Queue::assertPushed(SyncSsoJob::class, fn (SyncSsoJob $job) => $job->serverId === $server->id);
    Queue::assertNotPushed(SyncClusterToolsJob::class);
});

test('a fresh SSO tool does not trigger any sync jobs', function () {
    Queue::fake();

    $server = Server::create([
        'name' => 'prod-vps',
        'provider' => 'digitalocean',
        'kind' => 'vps',
        'context' => 'larakube-do-ams3',
        'status' => 'ready',
    ]);
    $server->clusterTools()->create([
        'tool' => 'sso',
        'installed' => true,
        'data' => ['status' => ['installed' => true, 'version' => '1.0']],
        'sync_status' => 'fresh',
        'last_synced_at' => now()->subSeconds(10),
    ]);

    $status = app(SsoStatus::class);
    expect($status->isInstalled('larakube-do-ams3'))->toBeTrue()
        ->and($status->status('larakube-do-ams3'))->toBe(['installed' => true, 'version' => '1.0']);

    Queue::assertNotPushed(SyncSsoJob::class);
    Queue::assertNotPushed(SyncClusterToolsJob::class);
});

test('a missing or non-fresh SSO tool triggers SyncClusterToolsJob', function () {
    Queue::fake();

    $server = Server::create([
        'name' => 'prod-vps',
        'provider' => 'digitalocean',
        'kind' => 'vps',
        'context' => 'larakube-do-ams3',
        'status' => 'ready',
    ]);

    $status = app(SsoStatus::class);
    expect($status->isInstalled('larakube-do-ams3'))->toBeFalse();

    Queue::assertPushed(SyncClusterToolsJob::class, fn (SyncClusterToolsJob $job) => $job->serverId === $server->id);
    Queue::assertNotPushed(SyncSsoJob::class);
});

test('syncState returns tool sync details or stale default when missing', function () {
    $server = Server::create([
        'name' => 'prod-vps',
        'provider' => 'digitalocean',
        'kind' => 'vps',
        'context' => 'larakube-do-ams3',
        'status' => 'ready',
    ]);

    $status = app(SsoStatus::class);
    expect($status->syncState('unknown-context'))->toBe([
        'status' => 'stale',
        'lastSyncedAt' => null,
        'error' => null,
    ]);

    $syncedAt = now();
    $server->clusterTools()->create([
        'tool' => 'sso',
        'installed' => true,
        'data' => ['status' => ['installed' => true]],
        'sync_status' => 'fresh',
        'last_synced_at' => $syncedAt,
        'last_sync_error' => null,
    ]);

    expect($status->syncState('larakube-do-ams3'))->toBe([
        'status' => 'fresh',
        'lastSyncedAt' => $syncedAt->toAtomString(),
        'error' => null,
    ]);
});

test('SyncSsoJob updates tool data and marks it fresh on success', function () {
    $bin = ssoTestServer();
    $server = Server::create([
        'name' => 'prod-vps',
        'provider' => 'digitalocean',
        'kind' => 'vps',
        'context' => 'larakube-do-ams3',
        'status' => 'ready',
    ]);
    $tool = $server->clusterTools()->create([
        'tool' => 'sso',
        'installed' => true,
        'data' => ['initial' => 'value'],
        'sync_status' => 'stale',
    ]);

    Process::fake([
        '*sso:status*' => Process::result(output: json_encode(['installed' => true, 'orgs' => []])),
    ]);

    SyncSsoJob::dispatchSync($server->id);

    $tool->refresh();
    expect($tool->sync_status)->toBe('fresh')
        ->and($tool->last_synced_at)->not->toBeNull()
        ->and($tool->last_sync_error)->toBeNull()
        ->and($tool->data)->toBe([
            'initial' => 'value',
            'status' => ['installed' => true, 'orgs' => []],
        ]);

    File::deleteDirectory(dirname($bin));
});

test('SyncSsoJob handles timeout gracefully and records error', function () {
    $bin = ssoTestServer();
    $server = Server::create([
        'name' => 'prod-vps',
        'provider' => 'digitalocean',
        'kind' => 'vps',
        'context' => 'larakube-do-ams3',
        'status' => 'ready',
    ]);
    $tool = $server->clusterTools()->create([
        'tool' => 'sso',
        'installed' => true,
        'data' => [],
        'sync_status' => 'stale',
    ]);

    Process::fake([
        '*sso:status*' => fn () => throw new ProcessTimedOutException(
            new SymfonyTimedOut(new SymfonyProcess(['larakube']), SymfonyTimedOut::TYPE_GENERAL),
            Process::result(),
        ),
    ]);

    SyncSsoJob::dispatchSync($server->id);

    $tool->refresh();
    expect($tool->sync_status)->toBe('error')
        ->and($tool->last_sync_error)->toBe('Timed out waiting for Zitadel SSO.');

    File::deleteDirectory(dirname($bin));
});

test('SyncSsoJob handles failure response and records error', function () {
    $bin = ssoTestServer();
    $server = Server::create([
        'name' => 'prod-vps',
        'provider' => 'digitalocean',
        'kind' => 'vps',
        'context' => 'larakube-do-ams3',
        'status' => 'ready',
    ]);
    $tool = $server->clusterTools()->create([
        'tool' => 'sso',
        'installed' => true,
        'data' => [],
        'sync_status' => 'stale',
    ]);

    Process::fake([
        '*sso:status*' => Process::result(output: 'not json', exitCode: 1),
    ]);

    SyncSsoJob::dispatchSync($server->id);

    $tool->refresh();
    expect($tool->sync_status)->toBe('error')
        ->and($tool->last_sync_error)->toBe('Could not reach Zitadel SSO.');

    File::deleteDirectory(dirname($bin));
});
