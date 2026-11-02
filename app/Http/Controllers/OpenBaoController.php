<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Services\CurrentServer;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\OpenBaoStatus;
use App\Services\LaraKube\StackCatalog;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class OpenBaoController extends Controller
{
    public function __construct(private StackCatalog $stacks) {}

    /** Entry route from sidebar: redirects to last browsed server or first ready server. */
    public function entry(CurrentServer $current): RedirectResponse
    {
        $ready = array_values(array_filter($this->stacks->all() ?? [], fn (array $stack): bool => $stack['status'] === 'ready' && $stack['context'] !== null));
        $names = array_column($ready, 'name');
        $resolved = $current->resolve($names);

        return $resolved === null ? to_route('servers.index') : to_route('servers.openbao.index', $resolved);
    }

    /** OpenBao overview for the selected server. */
    public function index(string $server, OpenBaoStatus $status, CurrentServer $current): Response
    {
        $stack = $this->readyServer($server);
        $current->remember($server);

        $context = (string) $stack['context'];
        $isInstalled = $status->isInstalled($context);
        $servers = array_values(array_filter($this->stacks->all() ?? [], fn (array $s): bool => $s['status'] === 'ready'));

        return Inertia::render('openbao/index', [
            'server' => $stack,
            'servers' => $servers,
            'isInstalled' => $isInstalled,
            'status' => $isInstalled
                ? Inertia::defer(fn (): array => $status->status($context), 'status')
                : ['installed' => false],
            'openBaoSync' => $status->syncState($context),
        ]);
    }

    /** Seal OpenBao immediately — blocks all secret access cluster-wide until unsealed. */
    public function seal(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $context = (string) $this->readyServer($server)['context'];

        $run = $runner->start(
            label: "Seal OpenBao on {$server}",
            arguments: ['secrets:seal', 'production', "--context={$context}", '--force'],
            kind: RunKind::OpenBaoSeal,
            subject: $server,
            meta: ['server' => $server, 'context' => $context],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /** Unseal OpenBao using its stored unseal key. */
    public function unseal(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $context = (string) $this->readyServer($server)['context'];

        $run = $runner->start(
            label: "Unseal OpenBao on {$server}",
            arguments: ['secrets:unseal', 'production', "--context={$context}"],
            kind: RunKind::OpenBaoUnseal,
            subject: $server,
            meta: ['server' => $server, 'context' => $context],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /** Immediately rotate one tool's Commons DB password in OpenBao. */
    public function rotate(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $request->validate([
            'tool' => ['required', 'string'],
        ]);

        $context = (string) $this->readyServer($server)['context'];
        $tool = $request->string('tool')->toString();

        $run = $runner->start(
            label: "Rotate {$tool}'s DB password in OpenBao on {$server}",
            arguments: ['secrets:rotate', 'production', "--context={$context}", "--tool={$tool}", '--force'],
            kind: RunKind::OpenBaoRotate,
            subject: $tool,
            meta: ['server' => $server, 'context' => $context],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /** Grant a user app-scoped OpenBao secrets access. */
    public function grant(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $request->validate([
            'app' => ['required', 'string'],
            'email' => ['required', 'email'],
            'role' => ['nullable', 'string'],
        ]);

        $context = (string) $this->readyServer($server)['context'];
        $app = $request->string('app')->toString();
        $email = $request->string('email')->trim()->lower()->toString();

        $args = ['secrets:grant', 'production', "--context={$context}", "--app={$app}", "--email={$email}"];
        if ($request->filled('role')) {
            $args[] = '--role='.$request->string('role')->toString();
        }

        $run = $runner->start(
            label: "Grant {$email} OpenBao access to {$app} on {$server}",
            arguments: $args,
            kind: RunKind::OpenBaoGrant,
            subject: $email,
            meta: ['server' => $server, 'context' => $context],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /** Revoke a previously granted app-scoped OpenBao secrets access. */
    public function revoke(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $request->validate([
            'app' => ['required', 'string'],
            'email' => ['required', 'email'],
        ]);

        $context = (string) $this->readyServer($server)['context'];
        $app = $request->string('app')->toString();
        $email = $request->string('email')->trim()->lower()->toString();

        $run = $runner->start(
            label: "Revoke {$email}'s OpenBao access to {$app} on {$server}",
            arguments: ['secrets:revoke', 'production', "--context={$context}", "--app={$app}", "--email={$email}", '--force'],
            kind: RunKind::OpenBaoRevoke,
            subject: $email,
            meta: ['server' => $server, 'context' => $context],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /** Export every OpenBao secret to a local JSON file on this computer. */
    public function export(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $context = (string) $this->readyServer($server)['context'];

        $args = ['secrets:export', 'production', "--context={$context}"];
        if ($request->filled('output')) {
            $args[] = '--output='.$request->string('output')->trim()->toString();
        }

        $run = $runner->start(
            label: "Export OpenBao secrets on {$server}",
            arguments: $args,
            kind: RunKind::OpenBaoExport,
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
     * Import secrets from a local JSON export file, overwriting live values
     * — requires retyping the server name to confirm, same pattern as
     * mail:domain-delete's destructive confirmation.
     */
    public function import(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $request->validate([
            'path' => ['required', 'string'],
            'confirm' => ['required', 'string'],
        ]);

        $context = (string) $this->readyServer($server)['context'];
        $path = $request->string('path')->trim()->toString();
        $confirm = $request->string('confirm')->trim()->toString();

        abort_unless($confirm === $server, 422, 'Type the server name to confirm.');

        $run = $runner->start(
            label: "Import OpenBao secrets on {$server}",
            arguments: ['secrets:import', 'production', "--context={$context}", "--input={$path}", '--force'],
            kind: RunKind::OpenBaoImport,
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
