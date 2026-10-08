<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Models\Server;
use App\Services\CurrentServer;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\MailStatus;
use App\Services\LaraKube\StackCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class MailController extends Controller
{
    public function __construct(private StackCatalog $stacks) {}

    /**
     * Entry route from sidebar: redirects to last browsed server or first ready server.
     */
    public function entry(CurrentServer $current): RedirectResponse
    {
        $ready = array_values(array_filter($this->stacks->all() ?? [], fn (array $stack): bool => $stack['status'] === 'ready' && $stack['context'] !== null));
        $names = array_column($ready, 'name');
        $resolved = $current->resolve($names);

        return $resolved === null ? to_route('servers.index') : to_route('servers.mail.index', $resolved);
    }

    /**
     * Mail management overview for the selected server.
     */
    public function index(string $server, MailStatus $status, CurrentServer $current): Response
    {
        $stack = $this->readyServer($server);
        $current->remember($server);

        $context = (string) $stack['context'];
        $isInstalled = $status->isInstalled($context);
        $servers = array_values(array_filter($this->stacks->all() ?? [], fn (array $s): bool => $s['status'] === 'ready'));

        return Inertia::render('mail/index', [
            'server' => $stack,
            'servers' => $servers,
            'isInstalled' => $isInstalled,
            'serverInfo' => $isInstalled
                ? Inertia::defer(fn (): ?array => $status->serverInfo($context), 'serverInfo')
                : null,
            'hasSso' => $isInstalled
                ? Inertia::defer(fn (): bool => (bool) ($status->serverInfo($context)['sso']['installed'] ?? false), 'hasSso')
                : false,
            'domains' => $isInstalled
                ? Inertia::defer(fn (): array => $status->domains($context), 'domains')
                : [],
            'accounts' => $isInstalled
                ? Inertia::defer(fn (): array => $status->accounts($context), 'accounts')
                : ['accounts' => [], 'queue' => 0],
            'mailSync' => $status->syncState($context),
        ]);
    }

    /**
     * Deploy Stalwart Mail Server on the server.
     */
    public function deploy(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];

        $domain = $request->string('domain')->trim()->lower()->toString();
        $adminEmail = $request->string('admin_email')->trim()->toString();

        $args = ['tool:init', '--tool=stalwart', 'production', "--context={$context}"];
        if ($domain !== '') {
            $args[] = "--domain={$domain}";
        }
        if ($adminEmail !== '') {
            $args[] = "--admin-email={$adminEmail}";
        }

        $run = $runner->start(
            label: "Deploy Stalwart mail server on {$server}",
            arguments: $args,
            kind: RunKind::MailDeploy,
            subject: $server,
            meta: ['server' => $server, 'context' => $context, 'tool' => 'stalwart'],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /**
     * Create a new mailbox.
     */
    public function createAccount(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $request->validate([
            'email' => ['required', 'email'],
            'password' => ['nullable', 'string', 'min:8'],
            'name' => ['nullable', 'string', 'max:255'],
            'quota' => ['nullable', 'integer', 'min:1'],
            'sso' => ['nullable', 'boolean'],
        ]);

        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $email = $request->string('email')->trim()->lower()->toString();

        $args = ['mail:create', 'production', "--context={$context}", "--email={$email}"];
        if ($request->filled('password')) {
            $args[] = '--password='.$request->string('password')->toString();
        }
        if ($request->filled('name')) {
            $args[] = '--name='.$request->string('name')->trim()->toString();
        }
        if ($request->filled('quota')) {
            $args[] = '--quota='.$request->integer('quota');
        }
        if ($request->has('sso')) {
            $args[] = $request->boolean('sso') ? '--sso' : '--no-sso';
        }

        $run = $runner->start(
            label: "Create mailbox {$email} on {$server}",
            arguments: $args,
            kind: RunKind::MailCreateAccount,
            subject: $email,
            meta: ['server' => $server, 'context' => $context],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /**
     * Reset password for an existing mailbox.
     */
    public function resetPassword(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $request->validate([
            'email' => ['required', 'email'],
            'password' => ['nullable', 'string', 'min:8'],
            'sso' => ['nullable', 'boolean'],
        ]);

        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $email = $request->string('email')->trim()->lower()->toString();

        $args = ['mail:password', 'production', "--context={$context}", "--email={$email}", '--force'];
        if ($request->filled('password')) {
            $args[] = '--password='.$request->string('password')->toString();
        }
        if ($request->has('sso')) {
            $args[] = $request->boolean('sso') ? '--sso' : '--no-sso';
        }

        $run = $runner->start(
            label: "Reset password for {$email} on {$server}",
            arguments: $args,
            kind: RunKind::MailResetPassword,
            subject: $email,
            meta: ['server' => $server, 'context' => $context],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /**
     * Sync existing Stalwart mail accounts to Zitadel SSO.
     */
    public function syncSso(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];

        $run = $runner->start(
            label: "Sync mail accounts to Zitadel SSO on {$server}",
            arguments: ['mail:sync-sso', 'production', "--context={$context}"],
            kind: RunKind::MailSyncSso,
            subject: "mail:sso:{$server}",
            meta: ['server' => $server, 'context' => $context],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /**
     * Delete an existing mailbox.
     */
    public function deleteAccount(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $request->validate([
            'email' => ['required', 'email'],
        ]);

        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $email = $request->string('email')->trim()->lower()->toString();

        $args = ['mail:delete', 'production', "--context={$context}", "--email={$email}", '--force'];

        $run = $runner->start(
            label: "Delete mailbox {$email} on {$server}",
            arguments: $args,
            kind: RunKind::MailDeleteAccount,
            subject: $email,
            meta: ['server' => $server, 'context' => $context],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /**
     * Onboard an additional domain.
     */
    public function addDomain(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $request->validate([
            'domain' => ['required', 'string', 'max:255'],
            'cloudflare_token' => ['nullable', 'string'],
            'acme_email' => ['nullable', 'email'],
        ]);

        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $domain = $request->string('domain')->trim()->lower()->toString();

        $args = ['mail:domain', 'production', "--context={$context}", "--zone={$domain}", '--force'];
        if ($request->filled('cloudflare_token')) {
            $args[] = '--cloudflare-token='.$request->string('cloudflare_token')->trim();
        }
        if ($request->filled('acme_email')) {
            $args[] = '--acme-email='.$request->string('acme_email')->trim();
        }

        $run = $runner->start(
            label: "Add mail domain {$domain} on {$server}",
            arguments: $args,
            kind: RunKind::MailAddDomain,
            subject: $domain,
            meta: ['server' => $server, 'context' => $context],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /**
     * Configure outbound mail relay or revert to direct MX.
     */
    public function configureRelay(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $request->validate([
            'provider' => ['required', 'in:brevo,ses,remove'],
            'username' => ['nullable', 'string'],
            'api_key' => ['nullable', 'string'],
            'region' => ['nullable', 'string'],
            'port' => ['nullable', 'integer'],
        ]);

        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $provider = $request->string('provider')->toString();

        if ($provider === 'remove') {
            $args = ['mail:relay', 'production', "--context={$context}", '--remove'];
        } else {
            $args = ['mail:relay', 'production', "--context={$context}", "--provider={$provider}"];
            if ($request->filled('username')) {
                $args[] = '--username='.$request->string('username')->trim();
            }
            if ($request->filled('api_key')) {
                $args[] = '--api-key='.$request->string('api_key')->trim();
            }
            if ($request->filled('region')) {
                $args[] = '--region='.$request->string('region')->trim();
            }
            if ($request->filled('port')) {
                $args[] = '--port='.$request->integer('port');
            }
        }

        $run = $runner->start(
            label: "Configure outbound mail relay ({$provider}) on {$server}",
            arguments: $args,
            kind: RunKind::MailConfigureRelay,
            subject: $server,
            meta: ['server' => $server, 'context' => $context],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /**
     * Send test email to verify delivery.
     */
    public function sendTest(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $request->validate([
            'to' => ['required', 'email'],
            'from' => ['nullable', 'email'],
            'password' => ['nullable', 'string'],
        ]);

        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $to = $request->string('to')->trim()->lower()->toString();

        $args = ['mail:test', 'production', "--context={$context}", "--to={$to}"];
        if ($request->filled('from')) {
            $args[] = '--from='.$request->string('from')->trim()->lower();
        }
        if ($request->filled('password')) {
            $args[] = '--password='.$request->string('password');
        }

        $run = $runner->start(
            label: "Send test email to {$to} via {$server}",
            arguments: $args,
            kind: RunKind::MailSendTest,
            subject: $to,
            meta: ['server' => $server, 'context' => $context],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /**
     * Live DNS and reachability verification for a domain.
     */
    public function checkDns(Request $request, string $server, MailStatus $status): JsonResponse
    {
        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $domain = $request->query('domain');

        $result = $status->checkDns($context, is_string($domain) && $domain !== '' ? $domain : null);

        return response()->json($result ?? ['installed' => false, 'error' => 'Could not run DNS check.']);
    }

    /**
     * Resolve a server that is ready and has a valid Kubernetes context.
     *
     * @return array{name: string, provider: string, kind: string, region: ?string, ip: ?string, context: ?string, status: string, account?: ?string}
     */
    private function readyServer(string $server): array
    {
        $stack = $this->stacks->find($server);

        abort_if($stack === null || $stack['status'] !== 'ready' || $stack['context'] === null, 404);

        Server::syncFromStack($stack);

        /** @var array{name: string, provider: string, kind: string, region: ?string, ip: ?string, context: ?string, status: string, account?: ?string} $stack */
        return $stack;
    }
}
