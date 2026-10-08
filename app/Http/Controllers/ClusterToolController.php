<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Http\Requests\InstallClusterToolRequest;
use App\Http\Requests\RemoveClusterToolRequest;
use App\Models\Run;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ClusterStatus;
use App\Services\LaraKube\FrameworkForm;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolCatalog;
use App\Services\LaraKube\ToolCommons;
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

    public function domains(string $server, ClusterStatus $status): JsonResponse
    {
        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];

        return response()->json([
            'domains' => $status->domains($context),
            'activeCommonsServices' => $this->activeServices($status, $context),
        ]);
    }

    /**
     * @return list<string>
     */
    private function activeServices(ClusterStatus $status, string $context): array
    {
        $active = [];
        $plex = $status->plex($context);
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
            'backing' => Inertia::defer(fn (): ?array => app(ToolCommons::class)->describe($row, app(ClusterStatus::class)->plex($context))),
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
            $this->optionFields($row),
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
            arguments: [$command, 'production', "--context={$context}", ...($host !== null ? ["--domain={$host}"] : []), '--force'],
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

    /**
     * The plain choices the CLI lists for installing this tool.
     *
     * @param  array<string, mixed>  $row
     * @return list<array<string, mixed>>
     */
    private function optionFields(array $row): array
    {
        $fields = [];

        foreach (is_array($row['initFields'] ?? null) ? $row['initFields'] : [] as $field) {
            if (is_array($field) && ($field['role'] ?? null) === 'option') {
                $fields[] = $field;
            }
        }

        return $fields;
    }
}
