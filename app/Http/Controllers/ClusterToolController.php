<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Http\Requests\InstallClusterToolRequest;
use App\Http\Requests\RebindClusterToolRequest;
use App\Http\Requests\RemoveClusterToolRequest;
use App\Jobs\Sync\SyncPlexJob;
use App\Models\Run;
use App\Models\Server;
use App\Services\CurrentServer;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ClusterStatus;
use App\Services\LaraKube\DomainCatalog;
use App\Services\LaraKube\FrameworkForm;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolCatalog;
use App\Services\LaraKube\ToolCommons;
use App\Services\LaraKube\ToolCredentials;
use Carbon\CarbonInterface;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ClusterToolController extends Controller
{
    public function __construct(private StackCatalog $stacks, private ToolCatalog $tools) {}

    /** The sidebar's Apps entry: the server last browsed (shared with Mail), else the first ready one, else Servers. */
    public function entry(CurrentServer $current): RedirectResponse
    {
        $ready = array_values(array_filter($this->stacks->all() ?? [], fn (array $stack): bool => $stack['status'] === 'ready' && $stack['context'] !== null));
        $names = array_column($ready, 'name');
        $resolved = $current->resolve($names);

        return $resolved === null ? to_route('servers.index') : to_route('servers.apps.index', $resolved);
    }

    public function index(string $server, ClusterStatus $status, DomainCatalog $domains, CurrentServer $current): Response
    {
        $stack = $this->readyServer($server);
        $current->remember($server);

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
            // An instant DB read — domains used to block on a live CLI
            // round-trip (ExternalDNS + TLS + kubectl) the first time a
            // server's cache went cold, same class of problem the rest of
            // this page already solved for tools.
            'domains' => $domains->forContext($context) ?? [],
            'activeCommonsServices' => Inertia::defer(fn (): array => $this->activeServices($status, $context), 'activeCommonsServices'),
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

    /**
     * A freshly-installed tool's bootstrap credentials, fetched live — so a
     * caller (Quick Launch, the install drawer) can show the admin login
     * right after a Run succeeds, instead of sending someone to the Activity
     * Log to read it out of plain-text CLI output.
     */
    public function credentials(Request $request, string $server, string $tool, ToolCredentials $credentials): JsonResponse
    {
        $stack = $this->readyServer($server);
        $domain = $request->string('domain')->trim()->lower()->toString();

        return response()->json([
            'credentials' => $credentials->fetch((string) $stack['context'], $tool, $domain),
        ]);
    }

    public function domains(string $server, ClusterStatus $status, DomainCatalog $domains, GlobalSettings $settings): JsonResponse
    {
        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $isLocal = Server::isStackLocal($stack);
        $localTld = $settings->getLocalTld();

        $serverDomains = $domains->forContext($context) ?? [];

        if ($isLocal && ! collect($serverDomains)->contains('domain', $localTld)) {
            array_unshift($serverDomains, [
                'domain' => $localTld,
                'externalDns' => false,
                'dnsProvider' => null,
                'tls' => true,
                'inUse' => true,
            ]);
        }

        return response()->json([
            'domains' => $serverDomains,
            'activeCommonsServices' => $this->activeServices($status, $context),
            'localTld' => $localTld,
            'isLocal' => $isLocal,
        ]);
    }

    /**
     * @return list<string>
     */
    private function activeServices(ClusterStatus $status, string $context): array
    {
        $active = [];
        $plex = $this->plexData($context, $status);
        if ($plex !== null && $plex['initialized']) {
            foreach ($plex['services'] as $name => $svc) {
                if (! empty($svc['enabled'])) {
                    $active[] = $name;
                    if ($name === 'postgres') {
                        $active[] = 'postgresql';
                    }
                    if ($name === 'mysql') {
                        $active[] = 'mariadb';
                    }
                    if (in_array($name, ['minio', 'garage'], true)) {
                        $active[] = 's3';
                    }
                }
            }
        }
        $verified = $this->tools->lastVerified($context);
        $toolList = $verified['tools'] ?? $this->tools->registered($context) ?? [];
        foreach ($toolList as $t) {
            if (! empty($t['installed'])) {
                $toolSlug = $t['tool'] ?? '';
                if (in_array($toolSlug, ['sso', 'zitadel'], true)) {
                    $active[] = 'oidc';
                    $active[] = 'sso';
                    $active[] = 'zitadel';
                }
                if (in_array($toolSlug, ['mail', 'stalwart'], true)) {
                    $active[] = 'smtp';
                    $active[] = 'mail';
                }
            }
        }

        return array_values(array_unique($active));
    }

    public function show(Request $request, string $server, string $tool): Response
    {
        $stack = $this->readyServer($server);
        $domain = $request->string('domain')->toString() ?: $request->string('host')->toString() ?: $request->string('instance')->toString();
        $row = $this->tools->find((string) $stack['context'], $tool, $domain);

        abort_if($row === null, 404);

        $context = (string) $stack['context'];

        return Inertia::render('tools/show', [
            'server' => $stack,
            'tool' => $row,
            // What the tool holds on the shared Commons, drawn by the same card as a project's services.
            'backing' => Inertia::defer(fn (): ?array => app(ToolCommons::class)->describe($row, $this->plexData($context, app(ClusterStatus::class)))),
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
        // Whether the tool takes an admin email is the CLI's answer: its install fields
        // name it. A CLI too old to send fields falls back to its older flag.
        $needsAdminEmail = is_array($row['initFields'] ?? null)
            ? collect($row['initFields'])->contains('key', 'adminEmail')
            : (bool) ($row['requiresAdminEmail'] ?? false);

        if ($adminEmail === '' && $needsAdminEmail) {
            $adminEmail = is_string($stack['account'] ?? null) && str_contains((string) $stack['account'], '@')
                ? (string) $stack['account']
                : "admin@{$domain}";
        }

        // The CLI's own options for this tool (an app name, whether to share the
        // Commons...), turned into flags the way a new app's answers are.
        $resolved = app(FrameworkForm::class)->resolve(
            $this->optionFields($row, Server::isStackLocal($stack)),
            (array) $request->input('options', []),
        );

        if ($resolved['errors'] !== []) {
            return back()->withErrors(collect($resolved['errors'])->mapWithKeys(fn (string $error, string $key): array => ["options.{$key}" => $error])->all());
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
                ...$resolved['flags'],
                ...($request->boolean('confirm_commons_restart') ? ['--confirm-commons-restart'] : []),
                '--force',
            ],
            kind: RunKind::InstallClusterTool,
            subject: $tool,
            meta: [
                'server' => $server,
                'context' => $context,
                'tool' => $tool,
                'host' => $domain,
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
        // Only a tool that can run more than once takes --domain; the others refuse it. A CLI too
        // old to say is treated as multi-instance, as before.
        $host = is_string($row['host'] ?? null) && $row['host'] !== '' && ($row['multiInstance'] ?? true) !== false ? $row['host'] : null;
        $displayName = $this->displayName($row);
        // The CLI names the command for this exact instance (its engine included), never its category.
        $command = is_string($row['removeCommand'] ?? null) && $row['removeCommand'] !== '' ? $row['removeCommand'] : "{$tool}:remove";

        $run = app(CliRunner::class)->start(
            label: 'Remove '.$displayName." from {$server}",
            arguments: [$command, 'production', "--context={$context}", ...($host !== null ? ["--domain={$host}"] : []), ...($request->boolean('purge') ? ['--purge'] : []), '--force'],
            kind: RunKind::RemoveClusterTool,
            subject: $tool,
            meta: ['server' => $server, 'context' => $context, 'tool' => $tool, 'host' => $host ?? ''],
            targetType: 'tool',
            targetName: $displayName,
            serverName: $server,
            context: $context,
            tool: $tool,
        );

        return to_route('runs.show', $run);
    }

    public function rebind(RebindClusterToolRequest $request, string $server, string $tool): RedirectResponse
    {
        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $currentHost = $request->string('current_host')->trim()->toString();
        $newHost = $request->string('new_host')->trim()->toString();
        $instance = $request->string('instance')->trim()->toString();

        $row = $this->tools->find($context, $tool, $currentHost !== '' ? $currentHost : ($instance !== '' ? $instance : null));
        abort_if($row === null || ! ($row['installed'] ?? false), 404);

        $displayName = $this->displayName($row);
        $wireSso = $request->boolean('wire_sso');

        $arguments = [
            'tool:rebind',
            'production',
            "--tool={$tool}",
            "--domain={$currentHost}",
            "--to={$newHost}",
            "--context={$context}",
            $wireSso ? '--wire-sso' : '--no-wire-sso',
            '--force',
        ];

        $run = app(CliRunner::class)->start(
            label: "Rebind {$displayName} on {$server} to {$newHost}",
            arguments: $arguments,
            kind: RunKind::RebindClusterTool,
            subject: $tool,
            meta: [
                'server' => $server,
                'context' => $context,
                'tool' => $tool,
                'current_host' => $currentHost,
                'new_host' => $newHost,
                'wire_sso' => $wireSso ? '1' : '0',
            ],
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
        $status->forgetPlex($context);

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
     * `servers.plex_data` is kept fresh in the background (SyncPlexJob, on a
     * recurring schedule plus an immediate dispatch on app boot) — same
     * DB-first-with-live-fallback shape ServerController::show() already
     * uses for its own 'plex' prop. A never-synced server (no Server row,
     * or one that predates this column) falls back to the live call.
     *
     * @return array{initialized: bool, context: ?string, services: array<string, mixed>, serviceCatalog: array<string, mixed>, tenants: array{tool: list<array<string, mixed>>, project: list<array<string, mixed>>, custom: list<array<string, mixed>>}}|null
     */
    private function plexData(string $context, ClusterStatus $status): ?array
    {
        $server = Server::firstWhere('context', $context);

        return $this->isColumnFresh($server?->plex_last_synced_at, SyncPlexJob::FRESH_SECONDS)
            ? $status->parsePlexReport($server->plex_data)
            : $status->plex($context);
    }

    private function isColumnFresh(?CarbonInterface $syncedAt, int $freshSeconds): bool
    {
        return $syncedAt !== null && $syncedAt->diffInSeconds(now()) < $freshSeconds;
    }

    /**
     * @return array<string, mixed>
     */
    private function readyServer(string $server): array
    {
        $stack = $this->stacks->find($server);

        abort_if($stack === null || $stack['status'] !== 'ready' || $stack['context'] === null, 404);

        Server::syncFromStack($stack);

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

    /**
     * The choices the CLI lists for installing this tool, minus `host` and
     * `account` — this form already asks for those itself (`domain`,
     * `admin_email`), so resolving them again here would double up. Every
     * other role — `access` (proxied, vpn-only, ...) included — is a plain
     * choice this generic form can resolve on its own, same as
     * QuickActionController::optionFields().
     *
     * Cloudflare Proxy and NetBird VPN IP whitelisting are both meaningless on a
     * local cluster (see QuickActionController::optionFields()) — drop them
     * entirely rather than let a local install resolve a flag that can't work.
     *
     * @param  array<string, mixed>  $row
     * @return list<array<string, mixed>>
     */
    private function optionFields(array $row, bool $isLocal = false): array
    {
        $fields = [];

        foreach (is_array($row['initFields'] ?? null) ? $row['initFields'] : [] as $field) {
            if (! is_array($field) || in_array($field['role'] ?? 'option', ['host', 'account'], true)) {
                continue;
            }

            if ($isLocal && in_array($field['key'] ?? '', ['proxied', 'vpnOnly'], true)) {
                continue;
            }

            $fields[] = $field;
        }

        return $fields;
    }
}
