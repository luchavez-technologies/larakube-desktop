<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Http\Requests\InstallClusterToolRequest;
use App\Http\Requests\RemoveClusterToolRequest;
use App\Models\Run;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ClusterStatus;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ClusterToolController extends Controller
{
    public function __construct(private StackCatalog $stacks, private ToolCatalog $tools) {}

    /** The sidebar's Tools entry: the server last browsed, else the first ready one, else Servers. */
    public function entry(): RedirectResponse
    {
        $ready = array_values(array_filter($this->stacks->all() ?? [], fn (array $stack): bool => $stack['status'] === 'ready' && $stack['context'] !== null));
        $names = array_column($ready, 'name');
        $last = session('tools.server');

        if (is_string($last) && in_array($last, $names, true)) {
            return to_route('servers.tools.index', $last);
        }

        return $names === [] ? to_route('servers.index') : to_route('servers.tools.index', $names[0]);
    }

    public function index(string $server, ClusterStatus $status): Response
    {
        $stack = $this->readyServer($server);
        session(['tools.server' => $server]);

        $context = (string) $stack['context'];
        $last = $this->tools->lastVerified($context);

        // A fresh verified list renders at once. Otherwise the last one (or,
        // on a first visit, the registry) shows while the live check runs.
        return Inertia::render('tools/index', [
            'server' => $stack,
            'servers' => array_values(array_filter($this->stacks->all() ?? [], fn (array $s): bool => $s['status'] === 'ready')),
            'lastVerified' => $last['tools'] ?? null,
            'checkedAt' => isset($last['checkedAt']) ? date(DATE_ATOM, $last['checkedAt']) : null,
            ...($last === null ? ['registered' => Inertia::defer(fn (): ?array => $this->tools->registered($context), 'registered')] : []),
            'tools' => $last !== null && $this->tools->isFresh($last)
                ? $last['tools']
                : Inertia::defer(fn (): ?array => $this->tools->forContext($context), 'tools'),
            'installing' => $this->installingTools($server),
            'companions' => Inertia::defer(fn (): array => app(CompanionController::class)->all(app(ToolLocator::class), app(GlobalSettings::class)), 'companions'),
            'domains' => Inertia::defer(fn (): array => $status->domains($context), 'domains'),
        ]);
    }

    public function checkDns(Request $request, string $server, ClusterStatus $status): JsonResponse
    {
        $stack = $this->readyServer($server);
        $domain = $request->string('domain')->trim()->lower()->toString();
        $serverIp = $stack['ip'] ?? null;

        if ($domain === '' || $serverIp === null) {
            return response()->json([
                'matches' => false,
                'resolvedIp' => null,
                'serverIp' => $serverIp ?? '',
                'isWildcard' => false,
            ]);
        }

        return response()->json($status->checkDns($domain, $serverIp));
    }

    public function show(Request $request, string $server, string $tool): Response
    {
        $stack = $this->readyServer($server);
        $domain = $request->string('domain')->toString() ?: $request->string('host')->toString() ?: $request->string('instance')->toString();
        $row = $this->tools->find((string) $stack['context'], $tool, $domain);

        abort_if($row === null, 404);

        return Inertia::render('tools/show', [
            'server' => $stack,
            'tool' => $row,
        ]);
    }

    public function store(InstallClusterToolRequest $request, string $server, string $tool): RedirectResponse
    {
        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $row = $this->tools->find($context, $tool);

        abort_if($row === null, 404);

        $domain = $request->string('domain')->trim()->lower()->toString();

        $adminEmail = $request->string('admin_email')->trim()->toString();
        $needsAdminEmail = (bool) ($row['requiresAdminEmail'] ?? false) || in_array($tool, [
            'pocketbase', 'directus', 'data', 'sso', 'zitadel', 'mail', 'stalwart', 'notes',
            'outline', 'support', 'chatwoot', 'errors', 'glitchtip', 'metabase', 'git',
            'forgejo', 'design', 'penpot', 'vpn', 'netbird',
        ], true);

        if ($adminEmail === '' && $needsAdminEmail) {
            $adminEmail = is_string($stack['account'] ?? null) && str_contains((string) $stack['account'], '@')
                ? (string) $stack['account']
                : "admin@{$domain}";
        }

        $displayName = $this->displayName($row);
        $label = 'Install '.$displayName." on {$server}";

        $run = app(CliRunner::class)->start(
            label: $label,
            arguments: [
                'tool:add',
                "--tool={$tool}",
                "--context={$context}",
                "--domain={$domain}",
                ...($adminEmail !== '' ? ["--admin-email={$adminEmail}"] : []),
                $request->boolean('wire_sso') ? '--wire-sso' : '--no-wire-sso',
                $request->boolean('wire_mail') ? '--wire-mail' : '--no-wire-mail',
                '--force',
            ],
            kind: RunKind::InstallClusterTool,
            subject: $tool,
            meta: [
                'server' => $server,
                'context' => $context,
                'tool' => $tool,
                ...($adminEmail !== '' ? ['admin_email' => $adminEmail] : []),
            ],
            targetType: 'tool',
            targetName: $displayName,
            serverName: $server,
            context: $context,
            tool: $tool,
        );

        return to_route('runs.show', $run);
    }

    public function destroy(RemoveClusterToolRequest $request, string $server, string $tool): RedirectResponse
    {
        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $domain = $request->string('domain')->toString() ?: $request->string('host')->toString() ?: $request->string('instance')->toString();
        $row = $this->tools->find($context, $tool, $domain);

        abort_if($row === null || ! $row['installed'], 404);

        // The host is an instance's identity, so --domain removes exactly this one.
        $host = is_string($row['host'] ?? null) && $row['host'] !== '' ? $row['host'] : null;
        $displayName = $this->displayName($row);

        $run = app(CliRunner::class)->start(
            label: 'Remove '.$displayName." from {$server}",
            arguments: ["{$tool}:remove", 'production', "--context={$context}", ...($host !== null ? ["--domain={$host}"] : []), '--force'],
            kind: RunKind::RemoveClusterTool,
            subject: $tool,
            meta: ['server' => $server, 'context' => $context, 'tool' => $tool],
            targetType: 'tool',
            targetName: $displayName,
            serverName: $server,
            context: $context,
            tool: $tool,
        );

        return to_route('runs.show', $run);
    }

    public function refresh(string $server, ClusterStatus $status): RedirectResponse
    {
        $context = (string) $this->readyServer($server)['context'];
        $this->tools->forget($context);
        $status->forgetDomains($context);
        $status->forgetDns($context);
        $status->forgetTls($context);

        return to_route('servers.tools.index', $server);
    }

    /**
     * The tool's name without the "[instance]" suffix the CLI appends.
     *
     * @param  array<string, mixed>  $row
     */
    private function displayName(array $row): string
    {
        return (string) preg_replace('/\s*\[[^\]]*\]$/', '', (string) $row['brand']);
    }

    /**
     * @return array<string, mixed>
     */
    private function readyServer(string $server): array
    {
        $stack = $this->stacks->find($server);

        abort_if($stack === null || $stack['status'] !== 'ready' || $stack['context'] === null, 404);

        return $stack;
    }

    /**
     * Tool slug => run id, for installs still running on this server.
     *
     * @return array<string, int>
     */
    private function installingTools(string $server): array
    {
        return Run::query()
            ->where('kind', RunKind::InstallClusterTool)
            ->where('status', RunStatus::Running)
            ->where(fn ($q) => $q->where('server_name', $server)->orWhere('meta->server', $server))
            ->get()
            ->mapWithKeys(fn (Run $run): array => [(string) ($run->tool ?? $run->subject) => $run->id])
            ->all();
    }
}
