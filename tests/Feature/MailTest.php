<?php

use App\Enums\RunKind;
use App\Jobs\Sync\SyncClusterToolsJob;
use App\Jobs\Sync\SyncMailJob;
use App\Models\ClusterTool;
use App\Models\MailAccount;
use App\Models\MailDomain;
use App\Models\Run;
use App\Models\Server;
use App\Services\LaraKube\MailStatus;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Queue;
use Native\Desktop\Events\ChildProcess\ProcessExited;
use Native\Desktop\Facades\ChildProcess;

/** Fakes the real CLI calls behind MailStatus/SyncClusterToolsJob/SyncMailJob, for tests that don't mock MailStatus. */
function mailRealFakes(array $accounts = [['email' => 'admin@example.com', 'name' => 'Admin', 'role' => 'admin', 'quota' => '1 GB', 'quotaBytes' => 1_000_000, 'used' => '0 MB', 'usedBytes' => 0]], array $domains = [['id' => 'd1', 'name' => 'example.com', 'accounts' => 1]]): void
{
    Process::fake([
        '*tool:list*' => Process::result(output: json_encode([
            ['tool' => 'stalwart', 'instance' => '', 'brand' => 'Stalwart', 'installed' => true, 'host' => 'mail.example.com', 'multiInstance' => false],
        ])),
        '*mail:show*' => Process::result(output: json_encode(['installed' => true, 'host' => 'mail.example.com'])),
        '*mail:domains*' => Process::result(output: json_encode(['domains' => $domains])),
        '*mail:accounts*' => Process::result(output: json_encode(['accounts' => $accounts, 'queue' => 0])),
    ]);
}

function mailTestServer(): string
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

test('/mail redirects to the first ready server', function () {
    mailTestServer();

    $this->get('/mail')
        ->assertRedirect(route('servers.mail.index', 'prod-vps'));
});

test('viewing mail page for unready server returns 404', function () {
    mailTestServer();

    $this->get(route('servers.mail.index', 'non-existent'))
        ->assertNotFound();
});

test('viewing mail page renders mail/index with installation status', function () {
    mailTestServer();

    $mailStatus = mock(MailStatus::class);
    $mailStatus->shouldReceive('isInstalled')->with('larakube-do-ams3')->andReturn(true);
    $mailStatus->shouldReceive('serverInfo')->with('larakube-do-ams3')->andReturn([
        'installed' => true,
        'host' => 'mail.example.com',
        'adminUrl' => 'https://mail.example.com/admin',
        'adminLogin' => 'admin',
        'adminPassword' => 's3cret',
        'webmailUrl' => 'https://mail.example.com/webmail',
        'imap' => ['host' => 'mail.example.com', 'port' => 993, 'tls' => true],
        'smtp' => ['host' => 'mail.example.com', 'port' => 465, 'tls' => true],
        'queue' => 0,
    ]);
    $mailStatus->shouldReceive('domains')->with('larakube-do-ams3')->andReturn([
        ['id' => 'd1', 'name' => 'example.com', 'accounts' => 2],
    ]);
    $mailStatus->shouldReceive('accounts')->with('larakube-do-ams3')->andReturn([
        'accounts' => [
            ['email' => 'admin@example.com', 'name' => 'Admin', 'role' => 'Admin', 'quota' => 'Unlimited', 'used' => '0 MB'],
        ],
        'queue' => 0,
    ]);
    $mailStatus->shouldReceive('syncState')->with('larakube-do-ams3')->andReturn([
        'status' => 'fresh', 'lastSyncedAt' => now()->toAtomString(), 'error' => null,
    ]);
    app()->instance(MailStatus::class, $mailStatus);

    $this->get(route('servers.mail.index', 'prod-vps'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('mail/index')
            ->where('server.name', 'prod-vps')
            ->where('isInstalled', true)
        );
});

test('deploying Stalwart mail server starts a mail-deploy run', function () {
    $bin = mailTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.mail.deploy', 'prod-vps'), [
        'domain' => 'mail.example.com',
        'admin_email' => 'postmaster@example.com',
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'tool:init', '--tool=stalwart', 'production', '--context=larakube-do-ams3',
            '--domain=mail.example.com', '--admin-email=postmaster@example.com', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::MailDeploy);
});

test('creating a mailbox starts a mail-create-account run', function () {
    $bin = mailTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.mail.accounts.store', 'prod-vps'), [
        'email' => 'alice@example.com',
        'password' => 'secret1234',
        'name' => 'Alice Smith',
        'quota' => 5,
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'mail:create', 'production', '--context=larakube-do-ams3',
            '--email=alice@example.com', '--password=secret1234', '--name=Alice Smith',
            '--quota=5', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::MailCreateAccount)
        ->and($run->subject)->toBe('alice@example.com');
});

test('creating a mailbox with sso forwards --sso flag', function () {
    $bin = mailTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.mail.accounts.store', 'prod-vps'), [
        'email' => 'alice@example.com',
        'password' => 'secret1234',
        'sso' => true,
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'mail:create', 'production', '--context=larakube-do-ams3',
            '--email=alice@example.com', '--password=secret1234',
            '--sso', '--no-interaction',
        ];
    });
});

test('resetting a mailbox password starts a mail-reset-password run', function () {
    $bin = mailTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.mail.accounts.password', 'prod-vps'), [
        'email' => 'alice@example.com',
        'password' => 'new-secret-999',
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'mail:password', 'production', '--context=larakube-do-ams3',
            '--email=alice@example.com', '--force', '--password=new-secret-999',
            '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::MailResetPassword);
});

test('resetting a mailbox password with sso forwards --sso flag', function () {
    $bin = mailTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.mail.accounts.password', 'prod-vps'), [
        'email' => 'alice@example.com',
        'password' => 'new-secret-999',
        'sso' => true,
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'mail:password', 'production', '--context=larakube-do-ams3',
            '--email=alice@example.com', '--force', '--password=new-secret-999',
            '--sso', '--no-interaction',
        ];
    });
});

test('syncing mail accounts to sso starts a mail-sync-sso run', function () {
    $bin = mailTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.mail.sync-sso', 'prod-vps'))
        ->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'mail:sync-sso', 'production', '--context=larakube-do-ams3',
            '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::MailSyncSso)
        ->and($run->subject)->toBe('mail:sso:prod-vps');
});

test('deleting a mailbox starts a mail-delete-account run', function () {
    $bin = mailTestServer();
    $fake = ChildProcess::fake();

    $this->delete(route('servers.mail.accounts.destroy', 'prod-vps'), [
        'email' => 'alice@example.com',
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'mail:delete', 'production', '--context=larakube-do-ams3',
            '--email=alice@example.com', '--force', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::MailDeleteAccount);
});

test('adding a domain starts a mail-add-domain run', function () {
    $bin = mailTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.mail.domains.store', 'prod-vps'), [
        'domain' => 'client.com',
        'cloudflare_token' => 'cf-tok-123',
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'mail:domain', 'production', '--context=larakube-do-ams3',
            '--zone=client.com', '--force', '--cloudflare-token=cf-tok-123',
            '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::MailAddDomain)
        ->and($run->subject)->toBe('client.com');
});

test('configuring outbound relay starts a mail-configure-relay run', function () {
    $bin = mailTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.mail.relay.store', 'prod-vps'), [
        'provider' => 'brevo',
        'username' => 'brevo-user',
        'api_key' => 'xsmtpsib-key',
        'port' => 2525,
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'mail:relay', 'production', '--context=larakube-do-ams3',
            '--provider=brevo', '--username=brevo-user', '--api-key=xsmtpsib-key',
            '--port=2525', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::MailConfigureRelay);
});

test('sending test email starts a mail-send-test run', function () {
    $bin = mailTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.mail.test', 'prod-vps'), [
        'to' => 'user@gmail.com',
        'from' => 'admin@example.com',
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'mail:test', 'production', '--context=larakube-do-ams3',
            '--to=user@gmail.com', '--from=admin@example.com', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::MailSendTest);
});

test('checking DNS returns JSON results from MailStatus', function () {
    mailTestServer();

    $mailStatus = mock(MailStatus::class);
    $mailStatus->shouldReceive('checkDns')
        ->with('larakube-do-ams3', 'example.com')
        ->andReturn([
            'installed' => true,
            'domain' => 'example.com',
            'summary' => ['pass' => 4, 'warn' => 0, 'fail' => 0],
            'checks' => [],
        ]);
    app()->instance(MailStatus::class, $mailStatus);

    $this->get(route('servers.mail.check-dns', ['server' => 'prod-vps', 'domain' => 'example.com']))
        ->assertOk()
        ->assertJson([
            'installed' => true,
            'domain' => 'example.com',
        ]);
});

test('viewing the mail page syncs real mail accounts and domains into the database', function () {
    mailTestServer();
    mailRealFakes();

    $this->get(route('servers.mail.index', 'prod-vps'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('mail/index')
            ->where('isInstalled', true)
            ->loadDeferredProps(fn ($reload) => $reload
                ->where('accounts.accounts.0.email', 'admin@example.com')
                ->where('domains.0.name', 'example.com')));

    expect(MailAccount::where('email', 'admin@example.com')->exists())->toBeTrue()
        ->and(MailDomain::where('name', 'example.com')->exists())->toBeTrue();
});

test('a finished mailbox-create run re-syncs mail accounts for that server', function () {
    mailTestServer();
    mailRealFakes();

    // Prime the mail tool row and initial accounts the way a real page visit would.
    $this->get(route('servers.mail.index', 'prod-vps'));

    $run = Run::create([
        'label' => 'Create mailbox jane@example.com on prod-vps', 'command' => ['larakube', 'mail:create'],
        'kind' => RunKind::MailCreateAccount, 'meta' => ['server' => 'prod-vps', 'context' => 'larakube-do-ams3'],
    ]);

    mailRealFakes(accounts: [
        ['email' => 'admin@example.com', 'name' => 'Admin', 'role' => 'admin', 'quota' => '1 GB', 'quotaBytes' => 1_000_000, 'used' => '0 MB', 'usedBytes' => 0],
        ['email' => 'jane@example.com', 'name' => 'Jane', 'role' => 'user', 'quota' => '1 GB', 'quotaBytes' => 1_000_000, 'used' => '0 MB', 'usedBytes' => 0],
    ], domains: [['id' => 'd1', 'name' => 'example.com', 'accounts' => 2]]);

    event(new ProcessExited($run->alias(), 0));

    expect(MailAccount::where('email', 'jane@example.com')->exists())->toBeTrue();
});

test('a server with genuinely zero mailboxes does not get re-synced on every check', function () {
    Queue::fake();
    $server = Server::create(['name' => 'prod-vps', 'provider' => 'do', 'kind' => 'vps', 'context' => 'larakube-do-ams3', 'status' => 'ready']);
    ClusterTool::create([
        'server_id' => $server->id, 'tool' => 'stalwart', 'host' => null, 'installed' => true,
        'data' => ['tool' => 'stalwart', 'serverInfo' => ['installed' => true], 'queue' => 0],
        'sync_status' => 'fresh', 'last_synced_at' => now(),
    ]);

    $status = app(MailStatus::class);
    $status->isInstalled('larakube-do-ams3');
    $status->accounts('larakube-do-ams3');
    $status->domains('larakube-do-ams3');

    Queue::assertNotPushed(SyncMailJob::class);
    Queue::assertNotPushed(SyncClusterToolsJob::class);
});

test('a mail tool mid-sync is left alone instead of triggering another sync', function () {
    Queue::fake();
    $server = Server::create(['name' => 'prod-vps', 'provider' => 'do', 'kind' => 'vps', 'context' => 'larakube-do-ams3', 'status' => 'ready']);
    ClusterTool::create([
        'server_id' => $server->id, 'tool' => 'stalwart', 'host' => null, 'installed' => true,
        'data' => ['tool' => 'stalwart'], 'sync_status' => 'syncing', 'last_synced_at' => now()->subMinutes(20),
    ]);

    app(MailStatus::class)->isInstalled('larakube-do-ams3');

    Queue::assertNotPushed(SyncMailJob::class);
    Queue::assertNotPushed(SyncClusterToolsJob::class);
});
