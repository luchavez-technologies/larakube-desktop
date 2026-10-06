<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Http\Requests\CloudflareStepRequest;
use App\Http\Requests\DestroyServerRequest;
use App\Http\Requests\StoreServerRequest;
use App\Models\Project;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ClusterStatus;
use App\Services\LaraKube\ContextHealth;
use App\Services\LaraKube\ProjectInspector;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ServerController extends Controller
{
    public function index(StackCatalog $catalog): Response
    {
        return Inertia::render('servers/index', [
            'servers' => Inertia::defer(fn (): ?array => $catalog->all()),
        ]);
    }

    public function create(Request $request, ReadinessCheck $readiness): Response
    {
        $project = $request->integer('project') > 0 ? Project::find($request->integer('project')) : null;

        return Inertia::render('servers/create', [
            'providers' => Inertia::defer(fn (): ?array => $readiness->providers()),
            'project' => $project ? ['id' => $project->id, 'name' => basename($project->path)] : null,
        ]);
    }

    public function store(StoreServerRequest $request, CliRunner $runner): RedirectResponse
    {
        $provider = $request->string('provider')->toString();
        $stackName = $request->string('stack_name')->toString();
        $project = $request->filled('project_id') ? Project::find($request->integer('project_id')) : null;

        $run = $runner->start(
            label: "Create server {$stackName}",
            arguments: [
                'cloud:create',
                "--provider={$provider}",
                '--vps',
                "--stack-name={$stackName}",
                '--region='.$request->string('region'),
                '--size='.$request->string('size'),
                '--json',
                ...($request->connectsCloudflare() ? ['--cloudflare'] : []),
                // Inside a project, the environment argument binds it to the new server.
                ...($project !== null ? [ProjectController::ENVIRONMENT] : []),
            ],
            secretEnvironment: $request->secretEnvironment(),
            kind: RunKind::CreateServer,
            subject: $stackName,
            meta: $project !== null ? ['project' => (string) $project->id] : [],
            cwd: $project?->path,
            targetType: 'server',
            targetName: $stackName,
            projectId: $project?->id,
            projectName: $project !== null ? basename($project->path) : null,
            environment: $project !== null ? ProjectController::ENVIRONMENT : 'production',
            serverName: $stackName,
        );

        return to_route('runs.show', $run);
    }

    public function show(
        string $server,
        StackCatalog $catalog,
        ClusterStatus $status,
        ProjectInspector $inspector,
        ToolCatalog $toolCatalog,
    ): Response {
        $stack = $catalog->find($server);

        abort_if($stack === null || ($stack['role'] ?? 'deploy') === 'dev', 404);

        $context = $stack['status'] === 'ready' ? $stack['context'] : null;

        $projects = Project::query()->get()->filter(function (Project $p) use ($inspector, $stack): bool {
            $inspection = $inspector->inspect($p->path);

            if ($stack['ip'] !== null && $inspection['serverIp'] === $stack['ip']) {
                return true;
            }

            if ($stack['context'] !== null && ($inspection['serverContext'] ?? null) === $stack['context']) {
                return true;
            }

            foreach ($inspection['environments'] as $env) {
                if ($stack['ip'] !== null && ($env['serverIp'] ?? null) === $stack['ip']) {
                    return true;
                }
                if ($stack['context'] !== null && ($env['serverContext'] ?? null) === $stack['context']) {
                    return true;
                }
            }

            return false;
        })->values()->map(function (Project $p) use ($inspector): array {
            $inspection = $inspector->inspect($p->path);

            return ['id' => $p->id] + $inspection;
        })->all();

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
        ]);
    }

    public function connectDomain(CloudflareStepRequest $request, string $server, StackCatalog $catalog, CliRunner $runner): RedirectResponse
    {
        $context = $this->readyContext($server, $catalog);

        $run = $runner->start(
            label: "Connect a domain to {$server}",
            arguments: ['tool:init', 'production', '--tool=external-dns', "--context={$context}", ...$request->groupArgument(), '--force'],
            secretEnvironment: $request->secretEnvironment(),
            kind: RunKind::ConnectDomain,
            subject: $server,
            meta: ['server' => $server, 'context' => $context],
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
            arguments: ['tls:init', 'production', "--context={$context}", ...$request->groupArgument(), '--force'],
            secretEnvironment: $request->secretEnvironment(),
            kind: RunKind::EnableSsl,
            subject: $server,
            meta: ['server' => $server, 'context' => $context],
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
