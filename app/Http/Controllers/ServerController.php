<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Http\Requests\CloudflareStepRequest;
use App\Http\Requests\DestroyServerRequest;
use App\Http\Requests\StoreServerRequest;
use App\Models\Project;
use App\Models\Server;
use App\Models\ServerDomain;
use App\Services\FilePicker;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\CloudAccount;
use App\Services\LaraKube\ClusterMetrics;
use App\Services\LaraKube\ClusterStatus;
use App\Services\LaraKube\ContextHealth;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ProjectInspector;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolCatalog;
use App\Services\SshKeyInspector;
use App\Services\TerminalLauncher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ServerController extends Controller
{
    public function index(StackCatalog $catalog, GlobalSettings $settings): Response
    {
        return Inertia::render('servers/index', [
            'servers' => Inertia::defer(fn (): ?array => $this->enrichStacksWithDomains(
                $this->visibleStacks($catalog->all(), $settings)
            )),
        ]);
    }

    /**
     * Attaches managed ExternalDNS domains from local database cache (0ms read)
     * so operators can immediately see which client / base domains are tied to each server.
     *
     * @param  ?list<array<string, mixed>>  $stacks
     * @return ?list<array<string, mixed>>
     */
    private function enrichStacksWithDomains(?array $stacks): ?array
    {
        if ($stacks === null || empty($stacks)) {
            return $stacks;
        }

        $contexts = array_values(array_filter(array_column($stacks, 'context')));
        $names = array_column($stacks, 'name');

        $dbServers = Server::with(['domains' => fn ($q) => $q->where('external_dns', true)])
            ->where(function ($q) use ($contexts, $names) {
                if (! empty($contexts)) {
                    $q->whereIn('context', $contexts);
                }
                $q->orWhereIn('name', $names);
            })
            ->get();

        $byContext = $dbServers->whereNotNull('context')->keyBy('context');
        $byName = $dbServers->keyBy('name');

        return array_map(function (array $stack) use ($byContext, $byName): array {
            $context = $stack['context'] ?? null;
            $name = $stack['name'] ?? null;

            $serverModel = ($context !== null ? $byContext->get($context) : null)
                ?? ($name !== null ? $byName->get($name) : null);

            $domains = $serverModel?->domains->map(fn (ServerDomain $d): array => [
                'domain' => $d->domain,
                'externalDns' => (bool) $d->external_dns,
                'dnsProvider' => $d->dns_provider,
            ])->values()->all() ?? [];

            $stack['domains'] = $domains;
            $stack['hasExternalDns'] = ! empty($domains);

            return $stack;
        }, $stacks);
    }

    /**
     * Drops demoHiddenServers() while Demo Mode is on — a pure read-time
     * filter, never persisted or applied to the cluster/CLI itself, so
     * turning Demo Mode off needs no cleanup at all.
     *
     * @param  ?list<array<string, mixed>>  $stacks
     * @return ?list<array<string, mixed>>
     */
    private function visibleStacks(?array $stacks, GlobalSettings $settings): ?array
    {
        if ($stacks === null || ! $settings->demoMode()) {
            return $stacks;
        }

        $hidden = $settings->demoHiddenServers();

        return array_values(array_filter($stacks, fn (array $stack): bool => ! in_array($stack['name'], $hidden, true)));
    }

    public function create(Request $request, ReadinessCheck $readiness, GlobalSettings $settings, SshKeyInspector $inspector): Response
    {
        $project = $request->integer('project') > 0 ? Project::find($request->integer('project')) : null;

        return Inertia::render('servers/create', [
            'providers' => $readiness->providers(statusOnly: true),
            'project' => $project ? ['id' => $project->id, 'name' => basename($project->path)] : null,
            'defaultProvider' => $settings->get()['defaultCloudProvider'],
            'detectedKeys' => $inspector->detectCommonKeys(),
        ]);
    }

    public function pickKey(FilePicker $picker, SshKeyInspector $inspector): JsonResponse
    {
        $path = $picker->pick('Select SSH Private Key', [], 'SSH Keys / All Files');
        if (! $path) {
            return response()->json(['path' => null]);
        }

        return response()->json([
            'path' => $path,
            ...$inspector->inspect($path),
        ]);
    }

    public function inspectKey(Request $request, SshKeyInspector $inspector): JsonResponse
    {
        $path = $request->string('path')->toString();
        if ($path === '') {
            return response()->json(['valid' => false]);
        }

        $passphrase = $request->string('passphrase')->toString();
        $info = $inspector->inspect($path);

        $validPassphrase = null;
        if ($info['encrypted'] && $passphrase !== '') {
            $validPassphrase = $inspector->verifyPassphrase($path, $passphrase);
        }

        return response()->json([
            'valid' => file_exists($inspector->resolvePath($path)),
            'encrypted' => $info['encrypted'],
            'in_agent' => $info['in_agent'],
            'valid_passphrase' => $validPassphrase,
        ]);
    }

    public function store(StoreServerRequest $request, CliRunner $runner): RedirectResponse
    {
        $provider = $request->string('provider')->toString();
        $stackName = $request->string('stack_name')->toString();
        $project = $request->filled('project_id') ? Project::find($request->integer('project_id')) : null;

        if ($provider === 'existing' || $provider === 'custom') {
            $ip = $request->string('ip')->toString();
            $sshUser = $request->string('ssh_user', 'root')->toString();
            $sshKey = $request->string('ssh_key')->toString();
            $sshPort = $request->integer('ssh_port', 22);
            $sshPassphrase = $request->string('ssh_passphrase')->toString();

            $dnsArgs = [];
            if ($request->filled('cloudflare_token') || $request->connectsCloudflare()) {
                $dnsArgs[] = '--cloudflare';
            } else {
                $dnsArgs[] = '--without-dns';
                $dnsArgs[] = '--without-tls';
            }

            $secretEnv = $request->secretEnvironment();
            if ($sshPassphrase !== '') {
                $secretEnv['LARAKUBE_SSH_PASSPHRASE'] = $sshPassphrase;
            }

            $sshPortArg = ($sshPort > 0 && $sshPort !== 22) ? ["--ssh-port={$sshPort}"] : [];

            $run = $runner->start(
                label: "Provision existing server {$stackName} ({$ip})",
                arguments: [
                    'cloud:init',
                    "--ip={$ip}",
                    "--ssh-user={$sshUser}",
                    "--ssh-key={$sshKey}",
                    ...$sshPortArg,
                    "--stack-name={$stackName}",
                    '--json',
                    ...$dnsArgs,
                    ...($project !== null ? [ProjectController::ENVIRONMENT] : []),
                ],
                secretEnvironment: $secretEnv,
                kind: RunKind::CreateServer,
                subject: $stackName,
                meta: ['targetKind' => 'vps', 'provider' => 'custom', ...($project !== null ? ['project' => (string) $project->id] : [])],
                cwd: $project?->path,
                targetType: 'server',
                targetName: $stackName,
                projectId: $project?->id,
                projectName: $project !== null ? basename($project->path) : null,
                environment: $project !== null ? ProjectController::ENVIRONMENT : 'production',
                serverName: $stackName,
            );

            Server::updateOrCreate(
                ['name' => $stackName],
                [
                    'provider' => 'custom',
                    'kind' => 'vps',
                    'ip' => $ip,
                    'port' => $sshPort,
                    'ssh_key' => $sshKey,
                    'context' => "larakube-{$ip}",
                    'status' => 'provisioning',
                ]
            );

            return to_route('runs.show', $run);
        }

        if ($provider === 'aws' && $request->filled('aws_access_key_id') && $request->filled('aws_secret_access_key')) {
            app(CloudAccount::class)->call(
                ['cloud:credentials', '--provider=aws', '--region='.$request->string('region', 'us-east-1')],
                ['AWS_ACCESS_KEY_ID' => trim((string) $request->input('aws_access_key_id')), 'AWS_SECRET_ACCESS_KEY' => trim((string) $request->input('aws_secret_access_key'))],
            );
        }

        $account = $request->string('account')->trim()->toString();
        $accountArg = match ($provider) {
            'aws' => $account !== '' ? ["--aws-profile={$account}"] : [],
            'gcp' => $account !== '' ? ["--gcp-account={$account}"] : [],
            'do' => $account !== '' ? ["--do-account={$account}"] : [],
            'hetzner' => $account !== '' ? ["--hetzner-account={$account}"] : [],
            default => [],
        };

        $targetKind = $request->string('target_kind', 'vps')->toString();
        $kindArg = $targetKind === 'managed'
            ? [
                '--managed',
                '--node-count='.$request->integer('node_count'),
                ...($request->boolean('ha') ? ['--ha'] : []),
                ...($request->filled('k8s_version_prefix') ? ['--k8s-version-prefix='.$request->string('k8s_version_prefix')] : []),
            ]
            : ['--vps'];

        $dnsArgs = [];
        if ($request->filled('dns_provider')) {
            $dnsProvider = $request->string('dns_provider')->toString();
            $dnsArgs[] = "--dns-provider={$dnsProvider}";
            if ($request->has('enable_dns') && ! $request->boolean('enable_dns')) {
                $dnsArgs[] = '--without-dns';
            }
            if ($request->has('enable_tls') && ! $request->boolean('enable_tls')) {
                $dnsArgs[] = '--without-tls';
            }
        } elseif ($request->connectsCloudflare()) {
            $dnsArgs[] = '--cloudflare';
        }

        $sshPort = $request->integer('ssh_port', 22);
        $sshPortArg = ($targetKind === 'vps' && $sshPort > 0 && $sshPort !== 22)
            ? ["--ssh-port={$sshPort}"]
            : [];

        $run = $runner->start(
            label: $targetKind === 'managed' ? "Create managed cluster {$stackName}" : "Create server {$stackName}",
            arguments: [
                'cloud:create',
                "--provider={$provider}",
                ...$kindArg,
                "--stack-name={$stackName}",
                '--region='.$request->string('region'),
                '--size='.$request->string('size'),
                '--json',
                ...$accountArg,
                ...$dnsArgs,
                ...$sshPortArg,
                // Inside a project, the environment argument binds it to the new server.
                ...($project !== null ? [ProjectController::ENVIRONMENT] : []),
            ],
            secretEnvironment: $request->secretEnvironment(),
            kind: RunKind::CreateServer,
            subject: $stackName,
            meta: ['targetKind' => $targetKind, ...($project !== null ? ['project' => (string) $project->id] : [])],
            cwd: $project?->path,
            targetType: 'server',
            targetName: $stackName,
            projectId: $project?->id,
            projectName: $project !== null ? basename($project->path) : null,
            environment: $project !== null ? ProjectController::ENVIRONMENT : 'production',
            serverName: $stackName,
        );

        Server::updateOrCreate(
            ['name' => $stackName],
            [
                'provider' => $provider,
                'kind' => $targetKind,
                'region' => $request->string('region')->toString() ?: null,
                'size' => $request->string('size')->toString() ?: null,
                'account' => $account !== '' ? $account : null,
                'status' => 'provisioning',
            ]
        );

        return to_route('runs.show', $run);
    }

    public function providerCatalog(string $provider, ReadinessCheck $readiness): JsonResponse
    {
        $data = $readiness->providerCatalog($provider);

        if ($data === null) {
            return response()->json(['message' => 'Provider catalog unavailable'], 404);
        }

        return response()->json($data);
    }

    public function show(
        string $server,
        StackCatalog $catalog,
        ClusterStatus $status,
        ProjectInspector $inspector,
        ToolCatalog $toolCatalog,
        ClusterMetrics $clusterMetrics,
        ContextHealth $health,
        ReadinessCheck $readiness,
        GlobalSettings $settings,
    ): Response {
        $stack = $catalog->find($server);

        abort_if($stack === null || ($stack['role'] ?? 'deploy') === 'dev', 404);
        abort_if($settings->demoMode() && in_array($stack['name'], $settings->demoHiddenServers(), true), 404);

        $context = $stack['status'] === 'ready' ? $stack['context'] : null;

        $serverModel = Server::where('name', $stack['name'])->first();

        $allProjects = Project::query()->get();
        $projects = [];

        foreach ($allProjects as $p) {
            if ($serverModel !== null && $p->server_id !== null) {
                if ($p->server_id === $serverModel->id) {
                    $projects[] = ['id' => $p->id] + $inspector->inspect($p->path);
                }

                continue;
            }

            $inspection = $inspector->inspect($p->path);
            $isMatch = false;

            if ($stack['ip'] !== null && $inspection['serverIp'] === $stack['ip']) {
                $isMatch = true;
            } elseif ($stack['context'] !== null && ($inspection['serverContext'] ?? null) === $stack['context']) {
                $isMatch = true;
            } else {
                foreach ($inspection['environments'] as $env) {
                    if ($stack['ip'] !== null && ($env['serverIp'] ?? null) === $stack['ip']) {
                        $isMatch = true;
                        break;
                    }
                    if ($stack['context'] !== null && ($env['serverContext'] ?? null) === $stack['context']) {
                        $isMatch = true;
                        break;
                    }
                }
            }

            if ($isMatch) {
                $projects[] = ['id' => $p->id] + $inspection;
            }
        }

        $lastTools = $context !== null ? $toolCatalog->lastVerified($context) : null;

        return Inertia::render('servers/show', [
            'server' => $stack,
            'projects' => $projects,
            'lastVerifiedTools' => $lastTools['tools'] ?? null,
            'tools' => $context !== null
                ? ($lastTools !== null && $toolCatalog->isFresh($lastTools)
                    ? $lastTools['tools']
                    : Inertia::defer(fn (): ?array => $toolCatalog->forContext($context), 'tools'))
                : null,
            'dns' => Inertia::defer(fn (): ?array => $context !== null ? $status->dns($context) : null, 'dns'),
            'tls' => Inertia::defer(fn (): ?array => $context !== null ? $status->tls($context) : null, 'tls'),
            'plex' => Inertia::defer(fn (): ?array => $context !== null ? $status->plex($context) : null, 'plex'),
            'backup' => Inertia::defer(fn (): ?array => $context !== null ? $status->backup($context) : null, 'backup'),
            'clusterUsers' => Inertia::defer(fn (): ?array => $context !== null ? $status->clusterUsers($context) : null, 'clusterUsers'),
            'nodeMetrics' => Inertia::defer(fn (): ?array => $context !== null ? $clusterMetrics->nodeMetrics($context) : null, 'nodeMetrics'),
            // "Ready" only ever meant "provisioning finished" — this is the live
            // signal that overrides the badge when the cluster stopped answering since.
            'reachable' => Inertia::defer(fn (): bool => $context === null || ($health->check([$context])[$context] ?? false), 'reachable'),
            'diagnosis' => $stack['kind'] === 'vps'
                ? Inertia::defer(fn (): ?array => $context !== null ? $status->diagnose($context) : null, 'diagnosis')
                : null,
            'providers' => $stack['kind'] === 'vps'
                ? Inertia::defer(fn (): ?array => $readiness->providers(statusOnly: true), 'providers')
                : null,
            'k9sInstalled' => $readiness->status('k9s')['installed'],
        ]);
    }

    public function connectDomain(CloudflareStepRequest $request, string $server, StackCatalog $catalog, CliRunner $runner): RedirectResponse
    {
        $context = $this->readyContext($server, $catalog);

        $run = $runner->start(
            label: "Connect a domain to {$server}",
            arguments: ['tool:init', 'production', '--tool=external-dns', "--context={$context}", ...$request->providerArgument(), ...$request->groupArgument(), '--force'],
            secretEnvironment: $request->secretEnvironment(),
            kind: RunKind::ConnectDomain,
            subject: $server,
            meta: array_filter([
                'server' => $server,
                'context' => $context,
                'provider' => $request->dnsProvider(),
                'group' => (string) $request->input('group'),
                'also_enable_tls' => $request->boolean('enable_tls') ? '1' : '0',
            ], fn (string $value): bool => $value !== ''),
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return to_route('runs.show', $run);
    }

    public function enableSsl(CloudflareStepRequest $request, string $server, StackCatalog $catalog, CliRunner $runner): RedirectResponse
    {
        $context = $this->readyContext($server, $catalog);

        $run = $runner->start(
            label: "Automatic SSL certificates on {$server}",
            arguments: ['tls:init', 'production', "--context={$context}", ...$request->providerArgument(), ...$request->groupArgument(), '--force'],
            secretEnvironment: $request->secretEnvironment(),
            kind: RunKind::EnableSsl,
            subject: $server,
            meta: ['server' => $server, 'context' => $context, 'provider' => $request->dnsProvider()],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return to_route('runs.show', $run);
    }

    public function disconnectDomain(Request $request, string $server, StackCatalog $catalog, CliRunner $runner): RedirectResponse
    {
        $request->validate([
            'group' => ['required', 'string'],
        ]);

        $group = (string) $request->input('group');
        $context = $this->readyContext($server, $catalog);

        $run = $runner->start(
            label: "Disconnect domain group '{$group}' from {$server}",
            arguments: ['external-dns:remove', 'production', "--group={$group}", "--context={$context}", '--force'],
            kind: RunKind::DisconnectDomain,
            subject: $server,
            meta: [
                'server' => $server,
                'context' => $context,
                'group' => $group,
            ],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return to_route('runs.show', $run);
    }

    public function pruneTls(Request $request, string $server, StackCatalog $catalog, CliRunner $runner): RedirectResponse
    {
        $context = $this->readyContext($server, $catalog);

        $run = $runner->start(
            label: "Prune unused SSL certificates on {$server}",
            arguments: ['tls:prune', 'production', "--context={$context}", '--force'],
            kind: RunKind::PruneTls,
            subject: $server,
            meta: [
                'server' => $server,
                'context' => $context,
            ],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return to_route('runs.show', $run);
    }

    private function readyContext(string $server, StackCatalog $catalog): string
    {
        $stack = $catalog->find($server);

        abort_if($stack === null || $stack['status'] !== 'ready' || $stack['context'] === null, 404);

        return $stack['context'];
    }

    /**
     * Opens a new terminal window running `ssh {server}`, or k9s scoped to
     * this server's kubectl context — the same commands the Connection
     * card's own Copy buttons already put on the clipboard, just run for you
     * instead of pasted.
     */
    public function terminal(Request $request, string $server, StackCatalog $catalog, ReadinessCheck $readiness, TerminalLauncher $launcher): RedirectResponse
    {
        $request->validate(['type' => ['required', 'in:ssh,kubectl']]);

        $stack = $catalog->find($server);
        abort_if($stack === null || $stack['status'] !== 'ready', 404);

        if ($request->string('type')->toString() === 'ssh') {
            abort_if($stack['kind'] !== 'vps', 422);
            $command = "ssh {$stack['name']}";
        } else {
            abort_if($stack['context'] === null, 404);
            abort_unless($readiness->status('k9s')['installed'], 422);

            $command = 'k9s --context='.escapeshellarg($stack['context']);
        }

        if (! $launcher->open($command)) {
            return back()->withErrors(['terminal' => 'Could not open a terminal.']);
        }

        return back();
    }

    /** Reboots a server LaraKube made. Nothing else can be restarted: a kubeconfig cannot reboot a machine. */
    public function restart(Request $request, string $server, StackCatalog $catalog, CliRunner $runner): RedirectResponse
    {
        $stack = $catalog->find($server);

        abort_if($stack === null || $stack['kind'] !== 'vps' || $stack['status'] !== 'ready', 404);

        $run = $runner->start(
            label: "Restart server {$server}",
            arguments: ['cloud:restart', "--stack={$server}", '--force'],
            kind: RunKind::RestartServer,
            subject: $server,
            meta: ['server' => $server, 'role' => $stack['role'] ?? 'deploy'],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /**
     * Re-runs k3s provisioning (harden, install k3s, sync kubeconfig,
     * redeploy Traefik-if-missing) against a server LaraKube already manages,
     * without destroying the VM — for when the cluster is broken but the box
     * itself still answers over SSH. Every step is idempotent, so this is
     * always safe to retry.
     */
    public function repair(Request $request, string $server, StackCatalog $catalog, CliRunner $runner): RedirectResponse
    {
        $stack = $catalog->find($server);

        abort_if($stack === null || $stack['kind'] !== 'vps', 404);

        $run = $runner->start(
            label: "Repair server {$server}",
            arguments: ['cloud:repair', "--stack={$server}", '--force'],
            kind: RunKind::RepairServer,
            subject: $server,
            meta: ['server' => $server, 'context' => $stack['context']],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $stack['context'],
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /**
     * Resizes the VM's CPU/RAM/disk live via OpenTofu, then waits for SSH and
     * Kubernetes to come back — many providers reboot to apply a live resize.
     */
    public function resize(Request $request, string $server, StackCatalog $catalog, CliRunner $runner): RedirectResponse
    {
        $stack = $catalog->find($server);

        abort_if($stack === null || $stack['kind'] !== 'vps' || $stack['status'] !== 'ready', 404);

        $size = $request->validate(['size' => ['required', 'string']])['size'];

        $run = $runner->start(
            label: "Resize server {$server}",
            arguments: ['cloud:scale', $server, "--size={$size}", '--force'],
            kind: RunKind::ResizeServer,
            subject: $server,
            meta: ['server' => $server, 'context' => $stack['context'], 'size' => $size],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $stack['context'],
        );

        return to_route('runs.show', $run);
    }

    /**
     * Which of the given Kubernetes contexts still answer, for the list to flag the ones that never will.
     */
    public function health(Request $request, ContextHealth $health): JsonResponse
    {
        $contexts = array_values(array_filter((array) $request->query('contexts', []), fn (mixed $context): bool => is_string($context) && preg_match('/^[A-Za-z0-9][A-Za-z0-9._:@\/-]*$/', $context) === 1));

        return response()->json($health->check($contexts))->header('Cache-Control', 'no-store');
    }

    public function destroy(DestroyServerRequest $request, string $server, StackCatalog $catalog, CliRunner $runner): RedirectResponse
    {
        $stack = $catalog->find($server);

        abort_if($stack === null, 404);

        $run = $runner->start(
            label: "Destroy server {$server}",
            arguments: ['cloud:destroy', $server, '--force'],
            kind: RunKind::DestroyServer,
            subject: $server,
            meta: ['role' => $stack['role'] ?? 'deploy'],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
        );

        return to_route('runs.show', $run);
    }
}
