<?php

use App\Enums\RunKind;
use App\Models\Run;
use App\Services\LaraKube\MailStatus;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Native\Desktop\Facades\ChildProcess;

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
