<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Models\Project;
use App\Models\Server;
use App\Services\CurrentServer;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ClusterMetrics;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\PlexCatalog;
use App\Services\LaraKube\PlexCommonsServices;
use App\Services\LaraKube\ProjectInspector;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class PlexController extends Controller
{
    public function __construct(private StackCatalog $stacks) {}

    /** Entry route from sidebar: redirects to last browsed server or first ready server. */
    public function entry(CurrentServer $current): RedirectResponse
    {
        $ready = array_values(array_filter($this->stacks->all() ?? [], fn (array $stack): bool => $stack['status'] === 'ready' && $stack['context'] !== null));
        $names = array_column($ready, 'name');
        $resolved = $current->resolve($names);

        return $resolved === null ? to_route('servers.index') : to_route('servers.plex.index', $resolved);
    }

    /** Plex Commons overview for the selected server. */
    public function index(string $server, PlexCatalog $plex, ClusterMetrics $metrics, PlexCommonsServices $commonsServices, CurrentServer $current, ProjectInspector $inspector): Response
    {
        $stack = $this->readyServer($server);
        $current->remember($server);

        $context = (string) $stack['context'];
        $servers = array_values(array_filter($this->stacks->all() ?? [], fn (array $s): bool => $s['status'] === 'ready'));

        $serverModel = Server::where('name', $stack['name'])->first();

        $allProjects = Project::query()->orderBy('name')->get();
        $projects = [];

        foreach ($allProjects as $project) {
            $isMatch = false;

            if ($serverModel !== null && $project->server_id !== null) {
                if ($project->server_id === $serverModel->id) {
                    $isMatch = true;
                } else {
                    continue;
                }
            }

            $inspection = $inspector->inspect($project->path);

            if (! $isMatch) {
                if ($stack['ip'] !== null && ($inspection['serverIp'] ?? null) === $stack['ip']) {
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
            }

            if (! $isMatch) {
                continue;
            }

            $matchingEnv = null;
            foreach ($inspection['environments'] as $env) {
                if (($stack['ip'] !== null && ($env['serverIp'] ?? null) === $stack['ip']) ||
                    ($stack['context'] !== null && ($env['serverContext'] ?? null) === $stack['context'])) {
                    $matchingEnv = $env;
                    break;
                }
            }

            $webHost = $matchingEnv['webHost']
                ?? $inspection['environments']['local']['webHost']
                ?? $inspection['webHost']
                ?? ($project->name ? "{$project->name}.dev.test" : null);

            $plexConfig = $matchingEnv['plex']
                ?? $inspection['environments']['local']['plex']
                ?? [];

            $projects[] = [
                'id' => $project->id,
                'name' => $project->name ?: basename($project->path),
                'framework' => $project->framework ?? $inspection['framework'] ?? 'laravel',
                'webHost' => $webHost,
                'path' => $project->path,
                'exists' => $project->existsOnHost(),
                'database' => $inspection['database'] ?? null,
                'cache' => $inspection['cacheDriver'] ?? null,
                'objectStorage' => $inspection['objectStorage'] ?? null,
                'plex' => $plexConfig,
            ];
        }

        return Inertia::render('plex/index', [
            'server' => $stack,
            'servers' => $servers,
            'projects' => $projects,
            'plex' => Inertia::defer(fn (): ?array => $plex->forContext($context), 'plex'),
            'plexSync' => $plex->syncState($context),
            'services' => Inertia::defer(function () use ($plex, $context, $commonsServices): ?array {
                $report = $plex->forContext($context);

                return $report !== null && $report['initialized']
                    ? $commonsServices->describe($report['serviceCatalog'], $report['services'])
                    : null;
            }, 'services'),
            'podMetrics' => Inertia::defer(fn (): ?array => $metrics->podMetrics($context, 'larakube-plex'), 'podMetrics'),
            'nodeMetrics' => Inertia::defer(fn (): ?array => $metrics->nodeMetrics($context), 'nodeMetrics'),
            // Companions only ever run on the local cluster's larakube-companions
            // namespace — skip the kubectl round-trip entirely for a remote stack.
            'companions' => Server::isStackLocal($stack)
                ? Inertia::defer(fn (): array => app(CompanionController::class)->all(app(ToolLocator::class), app(GlobalSettings::class)), 'companions')
                : [],
        ]);
    }

    /** Marks the Plex Commons report stale and re-syncs it in the background. */
    public function refresh(string $server, PlexCatalog $plex): RedirectResponse
    {
        $context = (string) $this->readyServer($server)['context'];
        $plex->forget($context);

        return back();
    }

    /** Provisions on-demand Commons credentials for a tenant that isn't a recognized LaraKube project. */
    public function provision(Request $request, string $server, CliRunner $runner): RedirectResponse
    {
        $request->validate([
            'tenant' => ['required', 'string', 'max:255'],
            'services' => ['required', 'array', 'min:1'],
            'services.*' => ['string', 'in:db,redis,s3'],
        ]);

        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $tenant = $request->string('tenant')->trim()->toString();
        $services = $request->array('services');

        $args = ['plex:provision', 'local', "--context={$context}", "--tenant={$tenant}", '--force'];
        foreach ($services as $service) {
            $args[] = "--service={$service}";
        }

        $run = $runner->start(
            label: "Provision Commons credentials for {$tenant} on {$server}",
            arguments: $args,
            kind: RunKind::PlexProvision,
            subject: $tenant,
            meta: ['server' => $server, 'context' => $context],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return to_route('runs.show', $run);
    }

    /**
     * Enables one additional, currently-inactive driver on an existing Commons.
     * `plex:init --services=` is already additive and non-destructive on a
     * live Commons (confirmed in PlexInitCommand::resolveSpec() — re-running
     * it unions the requested list with whatever's already active, never
     * disables a running service), so this just works out which drivers are
     * already active and adds the one requested to that list.
     */
    public function addService(Request $request, string $server, PlexCatalog $plexCatalog, CliRunner $runner): RedirectResponse
    {
        $request->validate(['driver' => ['required', 'string']]);

        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $driver = $request->string('driver')->trim()->toString();

        $plex = $plexCatalog->forContext($context);
        abort_unless($plex !== null && $plex['initialized'], 404);

        $ready = false;
        $active = [];
        foreach ($plex['serviceCatalog'] as $category) {
            foreach ($category['options'] ?? [] as $option => $meta) {
                if ($meta['enabled'] ?? false) {
                    $active[] = $option;
                }
                if ($option === $driver && ($meta['ready'] ?? false) && ! ($meta['enabled'] ?? false)) {
                    $ready = true;
                }
            }
        }
        abort_unless($ready, 422);

        $services = implode(',', [...$active, $driver]);

        $run = $runner->start(
            label: "Add {$driver} to the Commons on {$server}",
            arguments: ['plex:init', "--context={$context}", "--services={$services}"],
            kind: RunKind::PlexInit,
            subject: $driver,
            meta: ['server' => $server, 'context' => $context],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return to_route('runs.show', $run);
    }

    /** Evicts an orphaned tenant from the Commons — the "no project checked out" case this page's own context fits. */
    public function evictTenant(string $server, string $tenant, CliRunner $runner): RedirectResponse
    {
        $context = (string) $this->readyServer($server)['context'];

        $run = $runner->start(
            label: "Evict {$tenant} from the Commons on {$server}",
            arguments: ['plex:evict', 'local', "--context={$context}", "--tenant={$tenant}", '--force'],
            kind: RunKind::PlexEvict,
            subject: $tenant,
            meta: ['server' => $server, 'context' => $context],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return to_route('runs.show', $run);
    }

    /** Rotates one tenant's database credential, next to the rotation badge already shown on this page. */
    public function rotateTenant(string $server, string $tenant, CliRunner $runner): RedirectResponse
    {
        $context = (string) $this->readyServer($server)['context'];

        $run = $runner->start(
            label: "Rotate {$tenant}'s Commons credential on {$server}",
            arguments: ['plex:rotate', 'local', "--context={$context}", "--tenant={$tenant}", '--only=db', '--force'],
            kind: RunKind::PlexRotate,
            subject: $tenant,
            meta: ['server' => $server, 'context' => $context],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $context,
        );

        return to_route('runs.show', $run);
    }

    public function initServer(Request $request, string $server, StackCatalog $stacks, CliRunner $runner): RedirectResponse
    {
        $request->validate([
            'services' => ['nullable', 'array'],
            'services.*' => ['string'],
        ]);

        $stack = $stacks->find($server);
        abort_unless($stack !== null && is_string($stack['context']), 404);

        $args = ['plex:init', "--context={$stack['context']}"];
        $services = array_filter(array_map('trim', (array) $request->input('services', [])));
        if (! empty($services)) {
            $args[] = '--services='.implode(',', array_values($services));
        }

        $run = $runner->start(
            label: "Initialize Plex Commons on {$server}",
            arguments: $args,
            kind: RunKind::PlexInit,
            subject: "server:{$server}",
            meta: ['server' => $server, 'context' => $stack['context']],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $stack['context'],
        );

        return to_route('runs.show', $run);
    }

    public function startServer(string $server, StackCatalog $stacks, CliRunner $runner): RedirectResponse
    {
        $stack = $stacks->find($server);
        abort_unless($stack !== null && is_string($stack['context']), 404);

        $run = $runner->start(
            label: "Resume Plex Commons on {$server}",
            arguments: ['plex:start', "--context={$stack['context']}"],
            kind: RunKind::PlexStart,
            subject: "server:{$server}",
            meta: ['server' => $server, 'context' => $stack['context']],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $stack['context'],
        );

        return to_route('runs.show', $run);
    }

    public function stopServer(string $server, StackCatalog $stacks, CliRunner $runner): RedirectResponse
    {
        $stack = $stacks->find($server);
        abort_unless($stack !== null && is_string($stack['context']), 404);

        $run = $runner->start(
            label: "Pause Plex Commons on {$server}",
            arguments: ['plex:stop', "--context={$stack['context']}"],
            kind: RunKind::PlexStop,
            subject: "server:{$server}",
            meta: ['server' => $server, 'context' => $stack['context']],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $stack['context'],
        );

        return to_route('runs.show', $run);
    }

    public function joinProject(Request $request, Project $project, CliRunner $runner): RedirectResponse
    {
        abort_unless($project->existsOnHost(), 404);

        $projectName = basename($project->path);
        $env = $request->input('environment');
        $label = $env ? "Join Plex Commons ({$env})" : 'Join Plex Commons';
        $arguments = $env ? ['plex:join', (string) $env] : ['plex:join', '--fast'];

        $run = $runner->start(
            label: $label,
            arguments: $arguments,
            kind: RunKind::PlexJoin,
            subject: "project:{$project->id}",
            meta: array_filter(['project' => (string) $project->id, 'environment' => $env ? (string) $env : null]),
            cwd: $project->path,
            targetType: 'project',
            targetName: $projectName,
            projectId: $project->id,
            projectName: $projectName,
            environment: $env ? (string) $env : 'local',
        );

        return to_route('projects.show', $project);
    }

    public function leaveProject(Request $request, Project $project, CliRunner $runner): RedirectResponse
    {
        abort_unless($project->existsOnHost(), 404);

        $projectName = basename($project->path);
        $env = $request->input('environment');
        $label = $env ? "Leave Plex Commons ({$env})" : 'Leave Plex Commons';
        $arguments = $env ? ['plex:leave', (string) $env, '--force'] : ['plex:leave', '--force'];

        $run = $runner->start(
            label: $label,
            arguments: $arguments,
            kind: RunKind::PlexLeave,
            subject: "project:{$project->id}",
            meta: array_filter(['project' => (string) $project->id, 'environment' => $env ? (string) $env : null]),
            cwd: $project->path,
            targetType: 'project',
            targetName: $projectName,
            projectId: $project->id,
            projectName: $projectName,
            environment: $env ? (string) $env : 'local',
        );

        return to_route('projects.show', $project);
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
