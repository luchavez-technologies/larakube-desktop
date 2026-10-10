<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Models\Project;
use App\Models\Server;
use App\Services\CurrentServer;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ClusterMetrics;
use App\Services\LaraKube\ClusterStatus;
use App\Services\LaraKube\PlexCommonsServices;
use App\Services\LaraKube\StackCatalog;
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
    public function index(string $server, ClusterStatus $status, ClusterMetrics $metrics, PlexCommonsServices $commonsServices, CurrentServer $current): Response
    {
        $stack = $this->readyServer($server);
        $current->remember($server);

        $context = (string) $stack['context'];
        $servers = array_values(array_filter($this->stacks->all() ?? [], fn (array $s): bool => $s['status'] === 'ready'));

        return Inertia::render('plex/index', [
            'server' => $stack,
            'servers' => $servers,
            'plex' => Inertia::defer(fn (): ?array => $status->plex($context), 'plex'),
            'services' => Inertia::defer(function () use ($status, $context, $commonsServices): ?array {
                $plex = $status->plex($context);

                return $plex !== null && $plex['initialized']
                    ? $commonsServices->describe($plex['serviceCatalog'], $plex['services'])
                    : null;
            }, 'services'),
            'podMetrics' => Inertia::defer(fn (): ?array => $metrics->podMetrics($context, 'larakube-plex'), 'podMetrics'),
        ]);
    }

    /** Clears the cached plex:show report so the page re-reads the cluster. */
    public function refresh(string $server, ClusterStatus $status): RedirectResponse
    {
        $context = (string) $this->readyServer($server)['context'];
        $status->forgetPlex($context);

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
    public function addService(Request $request, string $server, ClusterStatus $status, CliRunner $runner): RedirectResponse
    {
        $request->validate(['driver' => ['required', 'string']]);

        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $driver = $request->string('driver')->trim()->toString();

        $plex = $status->plex($context);
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

    public function initServer(string $server, StackCatalog $stacks, CliRunner $runner): RedirectResponse
    {
        $stack = $stacks->find($server);
        abort_unless($stack !== null && is_string($stack['context']), 404);

        $run = $runner->start(
            label: "Initialize Plex Commons on {$server}",
            arguments: ['plex:init', "--context={$stack['context']}"],
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
        abort_unless(is_dir($project->path), 404);

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
        abort_unless(is_dir($project->path), 404);

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
