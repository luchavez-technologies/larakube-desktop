<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Http\Requests\Mail\ConfigureMailRelayRequest;
use App\Http\Requests\Mail\DeleteMailAccountRequest;
use App\Http\Requests\Mail\DeployMailRequest;
use App\Http\Requests\Mail\DestroyMailDomainRequest;
use App\Http\Requests\Mail\ResetMailPasswordRequest;
use App\Http\Requests\Mail\SendTestMailRequest;
use App\Http\Requests\Mail\StoreMailAccountRequest;
use App\Http\Requests\Mail\StoreMailDomainRequest;
use App\Models\MailAccount;
use App\Models\MailDomain;
use App\Models\Server;
use App\Services\CurrentServer;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\MailStatus;
use App\Services\LaraKube\StackCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
        $info = $isInstalled ? $status->serverInfo($context) : null;

        return Inertia::render('mail/index', [
            'server' => $stack,
            'servers' => $servers,
            'isInstalled' => $isInstalled,
            'serverInfo' => $info,
            'hasSso' => $isInstalled && (bool) ($info['sso']['installed'] ?? false),
            'domains' => $isInstalled ? $status->domains($context) : [],
            'accounts' => $isInstalled ? $status->accounts($context) : ['accounts' => [], 'queue' => 0],
            'wiredTools' => $isInstalled ? $status->wiredTools($context) : [],
            'mailSync' => $status->syncState($context),
        ]);
    }

    /**
     * Force an immediate re-sync of Stalwart mail domains, accounts, and status.
     */
    public function refresh(string $server, MailStatus $status): RedirectResponse
    {
        $context = (string) $this->readyServer($server)['context'];
        $status->forget($context);

        return back();
    }

    /**
     * Deploy Stalwart Mail Server on the server.
     */
    public function deploy(DeployMailRequest $request, string $server, CliRunner $runner): RedirectResponse
    {
        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];

        $domain = (string) $request->validated('domain', '');
        $adminEmail = (string) $request->validated('admin_email', '');

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
    public function createAccount(StoreMailAccountRequest $request, string $server, CliRunner $runner): RedirectResponse
    {
        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $email = (string) $request->validated('email');

        $args = ['mail:create', 'production', "--context={$context}", "--email={$email}"];
        if ($request->filled('password')) {
            $args[] = '--password='.$request->string('password')->toString();
        }
        if ($request->filled('name')) {
            $args[] = '--name='.(string) $request->validated('name');
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
    public function resetPassword(ResetMailPasswordRequest $request, string $server, CliRunner $runner): RedirectResponse
    {
        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $email = (string) $request->validated('email');

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
     *
     * Optimistically drops the mirrored SQLite row so Inertia's immediate `back()`
     * removes the row without waiting on background `SyncMailJob`; `RecordRunOutput`
     * re-syncs from the cluster on completion/failure to reconcile truth.
     */
    public function deleteAccount(DeleteMailAccountRequest $request, string $server, CliRunner $runner): RedirectResponse
    {
        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $email = (string) $request->validated('email');

        $this->optimisticallyDeleteAccount($context, $email);

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
    public function addDomain(StoreMailDomainRequest $request, string $server, CliRunner $runner): RedirectResponse
    {
        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $domain = (string) $request->validated('domain');

        $args = ['mail:domain', 'production', "--context={$context}", "--zone={$domain}", '--force'];
        if ($request->filled('cloudflare_token')) {
            $args[] = '--cloudflare-token='.(string) $request->validated('cloudflare_token');
        }
        if ($request->filled('acme_email')) {
            $args[] = '--acme-email='.(string) $request->validated('acme_email');
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
     * Permanently remove a domain and everything under it (accounts, DKIM
     * signatures, its DNS automation). Deliberately requires the operator to
     * retype the domain name server-side (CLI's own retype-confirmation,
     * `mail:domain-delete`) rather than trusting a single checkbox click here
     * — this destroys real mailboxes and cannot be undone.
     */
    public function removeDomain(DestroyMailDomainRequest $request, string $server, CliRunner $runner): RedirectResponse
    {
        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $domain = (string) $request->validated('domain');
        $confirm = (string) $request->validated('confirm');

        abort_unless($confirm === $domain, 422, 'Type the domain name to confirm.');

        $this->optimisticallyDeleteDomain($context, $domain);

        $args = ['mail:domain-delete', 'production', "--context={$context}", "--domain={$domain}"];
        if ($request->boolean('with_sso')) {
            $args[] = '--with-sso';
        }
        $args[] = '--force';

        $run = $runner->start(
            label: "Remove mail domain {$domain} on {$server}",
            arguments: $args,
            kind: RunKind::MailRemoveDomain,
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
    public function configureRelay(ConfigureMailRelayRequest $request, string $server, CliRunner $runner): RedirectResponse
    {
        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $provider = (string) $request->validated('provider');

        if ($provider === 'remove') {
            $args = ['mail:relay', 'production', "--context={$context}", '--remove'];
        } else {
            $args = ['mail:relay', 'production', "--context={$context}", "--provider={$provider}"];
            if ($request->filled('username')) {
                $args[] = '--username='.(string) $request->validated('username');
            }
            if ($request->filled('api_key')) {
                $args[] = '--api-key='.(string) $request->validated('api_key');
            }
            if ($request->filled('region')) {
                $args[] = '--region='.(string) $request->validated('region');
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
    public function sendTest(SendTestMailRequest $request, string $server, CliRunner $runner): RedirectResponse
    {
        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $to = (string) $request->validated('to');

        $args = ['mail:test', 'production', "--context={$context}", "--to={$to}"];
        if ($request->filled('from')) {
            $args[] = '--from='.(string) $request->validated('from');
        }
        if ($request->filled('password')) {
            $args[] = '--password='.$request->string('password')->toString();
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

    private function optimisticallyDeleteAccount(string $context, string $email): void
    {
        $serverModel = Server::firstWhere('context', $context);
        if ($serverModel === null) {
            return;
        }

        DB::transaction(function () use ($serverModel, $email): void {
            /** @var list<MailAccount> $accounts */
            $accounts = $serverModel->mailAccounts()
                ->whereRaw('LOWER(email) = ?', [$email])
                ->get()
                ->all();

            foreach ($accounts as $account) {
                $domainId = $account->mail_domain_id;
                $account->delete();

                if ($domainId !== null) {
                    $domain = MailDomain::query()->find($domainId);
                    if ($domain !== null && $domain->accounts_count > 0) {
                        $domain->update(['accounts_count' => $domain->accounts_count - 1]);
                    }
                }
            }
        });
    }

    private function optimisticallyDeleteDomain(string $context, string $domainName): void
    {
        $serverModel = Server::firstWhere('context', $context);
        if ($serverModel === null) {
            return;
        }

        DB::transaction(function () use ($serverModel, $domainName): void {
            /** @var MailDomain|null $domain */
            $domain = $serverModel->mailDomains()
                ->whereRaw('LOWER(name) = ?', [$domainName])
                ->first();

            $serverModel->mailAccounts()
                ->where(function ($query) use ($domain, $domainName): void {
                    if ($domain !== null) {
                        $query->where('mail_domain_id', $domain->id)
                            ->orWhereRaw('LOWER(email) LIKE ?', ['%@'.$domainName]);
                    } else {
                        $query->whereRaw('LOWER(email) LIKE ?', ['%@'.$domainName]);
                    }
                })
                ->delete();

            $domain?->delete();
        });
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
