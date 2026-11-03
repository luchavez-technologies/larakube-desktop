<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Services\CurrentServer;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\SsoStatus;
use App\Services\LaraKube\StackCatalog;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class SsoController extends Controller
{
    public function __construct(
        private StackCatalog $stacks,
        private SsoStatus $status,
    ) {}

    /** Entry route from sidebar: redirects to last browsed server or first ready server. */
    public function entry(CurrentServer $current): RedirectResponse
    {
        $ready = array_values(array_filter($this->stacks->all() ?? [], fn (array $stack): bool => $stack['status'] === 'ready' && $stack['context'] !== null));
        $names = array_column($ready, 'name');
        $resolved = $current->resolve($names);

        return $resolved === null ? to_route('servers.index') : to_route('servers.sso.index', $resolved);
    }

    /** SSO overview for the selected server. */
    public function index(string $server, CliRunner $runner, CurrentServer $current): Response
    {
        $stack = $this->readyServer($server);
        $current->remember($server);

        $context = (string) $stack['context'];
        $isInstalled = $this->status->isInstalled($context);
        $servers = array_values(array_filter($this->stacks->all() ?? [], fn (array $s): bool => $s['status'] === 'ready'));

        return Inertia::render('sso/index', [
            'server' => $stack,
            'servers' => $servers,
            'isInstalled' => $isInstalled,
            'status' => $isInstalled
                ? Inertia::defer(fn (): array => $this->status->status($context), 'status')
                : ['installed' => false],
            'grants' => $isInstalled
                ? Inertia::defer(fn (): array => $this->status->grants($context), 'grants')
                : [],
            'ssoSync' => $this->status->syncState($context),
        ]);
    }

    /** Force an immediate re-sync, bypassing the cached row's freshness window. */
    public function refresh(string $server, SsoStatus $status): RedirectResponse
    {
        $context = (string) $this->readyServer($server)['context'];
        $status->forget($context);

        return back();
    }

    /** Wire a tool's authentication to Zitadel SSO. */
    public function wire(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $request->validate([
            'tool' => ['required', 'string'],
            'domain' => ['required', 'string'],
            'admin_email' => ['nullable', 'email'],
        ]);

        $context = (string) $this->readyServer($server)['context'];
        $tool = $request->string('tool')->toString();
        $domain = $request->string('domain')->toString();

        $args = ['sso:wire', 'production', "--context={$context}", "--tool={$tool}", "--domain={$domain}"];
        if ($request->filled('admin_email')) {
            $adminEmail = $request->string('admin_email')->trim()->lower()->toString();
            $args[] = "--admin-email={$adminEmail}";
        }

        $run = $runner->start(
            label: "Wire {$tool} SSO on {$server}",
            arguments: $args,
            kind: RunKind::SsoWire,
            subject: $tool,
            meta: ['server' => $server, 'context' => $context],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /** Unwire a tool's authentication from Zitadel SSO. */
    public function unwire(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $request->validate([
            'tool' => ['required', 'string'],
            'domain' => ['required', 'string'],
        ]);

        $context = (string) $this->readyServer($server)['context'];
        $tool = $request->string('tool')->toString();
        $domain = $request->string('domain')->toString();

        $run = $runner->start(
            label: "Unwire {$tool} SSO on {$server}",
            arguments: ['sso:unwire', 'production', "--context={$context}", "--tool={$tool}", "--domain={$domain}"],
            kind: RunKind::SsoUnwire,
            subject: $tool,
            meta: ['server' => $server, 'context' => $context],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /** Grant a user access to a wired tool. */
    public function grant(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $request->validate([
            'email' => ['required', 'email'],
            'tool' => ['required', 'string'],
            'domain' => ['required', 'string'],
            'role' => ['nullable', 'string'],
        ]);

        $context = (string) $this->readyServer($server)['context'];
        $email = $request->string('email')->trim()->lower()->toString();
        $tool = $request->string('tool')->toString();
        $domain = $request->string('domain')->toString();

        $args = ['sso:grant', 'production', "--context={$context}", "--email={$email}", "--tool={$tool}", "--domain={$domain}"];
        if ($request->filled('role')) {
            $role = $request->string('role')->toString();
            $args[] = "--role={$role}";
        }

        $run = $runner->start(
            label: "Grant {$email} SSO access to {$tool} on {$server}",
            arguments: $args,
            kind: RunKind::SsoGrant,
            subject: $email,
            meta: ['server' => $server, 'context' => $context],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /** Revoke a user's access to a wired tool. */
    public function revoke(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $request->validate([
            'email' => ['required', 'email'],
            'role' => ['required', 'string'],
            'domain' => ['nullable', 'string'],
        ]);

        $context = (string) $this->readyServer($server)['context'];
        $email = $request->string('email')->trim()->lower()->toString();
        $role = $request->string('role')->toString();

        $args = ['sso:revoke', 'production', "--context={$context}", "--email={$email}", "--role={$role}"];
        if ($request->filled('domain')) {
            $args[] = '--domain='.$request->string('domain')->toString();
        }
        $args[] = '--force';

        $run = $runner->start(
            label: "Revoke {$email}'s SSO access on {$server}",
            arguments: $args,
            kind: RunKind::SsoRevoke,
            subject: $email,
            meta: ['server' => $server, 'context' => $context],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /** Create a new user in Zitadel SSO. */
    public function create(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $request->validate([
            'email' => ['required', 'email'],
            'name' => ['nullable', 'string'],
            'password' => ['nullable', 'string'],
        ]);

        $context = (string) $this->readyServer($server)['context'];
        $email = $request->string('email')->trim()->lower()->toString();

        $args = ['sso:create', 'production', "--context={$context}", "--email={$email}"];
        if ($request->filled('name')) {
            $args[] = '--name='.$request->string('name')->toString();
        }
        if ($request->filled('password')) {
            $args[] = '--password='.$request->string('password')->toString();
        }

        $run = $runner->start(
            label: "Create SSO user {$email} on {$server}",
            arguments: $args,
            kind: RunKind::SsoCreate,
            subject: $email,
            meta: ['server' => $server, 'context' => $context],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /** Configure an organization for Zitadel SSO. */
    public function org(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $request->validate([
            'zone' => ['required', 'string'],
            'cloudflare_token' => ['nullable', 'string'],
            'org_name' => ['nullable', 'string'],
            'admin_email' => ['nullable', 'email'],
        ]);

        $context = (string) $this->readyServer($server)['context'];
        $zone = $request->string('zone')->toString();

        $args = ['sso:org', 'production', "--context={$context}", "--zone={$zone}"];
        if ($request->filled('cloudflare_token')) {
            $args[] = '--cloudflare-token='.$request->string('cloudflare_token')->toString();
        }
        if ($request->filled('org_name')) {
            $args[] = '--org-name='.$request->string('org_name')->toString();
        }
        if ($request->filled('admin_email')) {
            $args[] = '--admin-email='.$request->string('admin_email')->trim()->lower()->toString();
        }
        $args[] = '--force';

        $run = $runner->start(
            label: "Configure SSO organization on {$server}",
            arguments: $args,
            kind: RunKind::SsoOrg,
            subject: $zone,
            meta: ['server' => $server, 'context' => $context],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /** Grant organization-level access in Zitadel SSO. */
    public function orgGrant(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $request->validate([
            'org' => ['required', 'string'],
            'tool' => ['required', 'string'],
            'domain' => ['required', 'string'],
            'project' => ['required', 'string'],
            'role' => ['required', 'array', 'min:1'],
            'role.*' => ['required', 'string'],
        ]);

        $context = (string) $this->readyServer($server)['context'];
        $org = $request->string('org')->toString();
        $tool = $request->string('tool')->toString();
        $domain = $request->string('domain')->toString();
        $project = $request->string('project')->toString();
        /** @var list<string> $roles */
        $roles = (array) $request->input('role');

        $args = ['sso:org-grant', 'production', "--context={$context}", "--org={$org}", "--tool={$tool}", "--domain={$domain}", "--project={$project}"];
        foreach ($roles as $role) {
            $args[] = "--role={$role}";
        }

        $run = $runner->start(
            label: "Grant {$org} SSO access to {$tool} on {$server}",
            arguments: $args,
            kind: RunKind::SsoOrgGrant,
            subject: $org,
            meta: ['server' => $server, 'context' => $context],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /** Prune unused SSO projects. */
    public function prune(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $request->validate([
            'project' => ['required', 'array', 'min:1'],
            'project.*' => ['required', 'string'],
        ]);

        $context = (string) $this->readyServer($server)['context'];
        /** @var list<string> $projects */
        $projects = (array) $request->input('project');

        $args = ['sso:prune', 'production', "--context={$context}"];
        foreach ($projects as $project) {
            $args[] = "--project={$project}";
        }
        $args[] = '--force';

        $run = $runner->start(
            label: "Prune SSO projects on {$server}",
            arguments: $args,
            kind: RunKind::SsoPrune,
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
     * Resolve a server that is ready and has a valid Kubernetes context.
     *
     * @return array{name: string, provider: string, kind: string, region: ?string, ip: ?string, context: ?string, status: string, account?: ?string}
     */
    private function readyServer(string $server): array
    {
        $stack = $this->stacks->find($server);

        abort_if($stack === null || $stack['status'] !== 'ready' || $stack['context'] === null, 404);

        /** @var array{name: string, provider: string, kind: string, region: ?string, ip: ?string, context: ?string, status: string, account?: ?string} $stack */
        return $stack;
    }
}
