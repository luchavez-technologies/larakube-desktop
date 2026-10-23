<?php

namespace App\Http\Controllers;

use App\Jobs\Sync\SyncServerBackupJob;
use App\Models\Project;
use App\Models\Run;
use App\Models\Server;
use App\Services\LaraKube\ClusterStatus;
use App\Services\LaraKube\DomainCatalog;
use App\Services\LaraKube\FleetMetrics;
use App\Services\LaraKube\FrameworkCatalog;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\LocalCluster;
use App\Services\LaraKube\ProjectInspector;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function index(
        StackCatalog $stacks,
        ReadinessCheck $readiness,
        ProjectInspector $inspector,
        ToolLocator $locator,
        LocalCluster $localCluster,
        ClusterStatus $clusterStatus,
        FleetMetrics $fleetMetrics,
        DomainCatalog $domains,
        GlobalSettings $settings,
        FrameworkCatalog $frameworks,
    ): Response|RedirectResponse {
        // A first launch gets the onboarding wizard before anything else — its
        // own install step is how the CLI gets installed, so this check comes
        // before the "CLI missing" one below.
        if (! $settings->hasCompletedOnboarding()) {
            return redirect()->route('onboarding');
        }

        // Covers an already-onboarded install that somehow lost its CLI: Setup installs it.
        if ($locator->find('larakube') === null) {
            return redirect()->route('readiness');
        }

        // Fast SQLite queries: execute instantly for initial shell render
        $recentRuns = Run::query()->latest('id')->take(5)->get(['id', 'label', 'kind', 'status', 'created_at', 'target_type', 'target_name', 'environment']);

        return Inertia::render('dashboard/index', [
            'runs' => $recentRuns,
            'defaultProjectParent' => ToolLocator::home(),

            'stats' => Inertia::defer(function () use ($stacks, $readiness): array {
                $projectsCount = Project::query()->get()->filter(fn (Project $p): bool => $p->existsOnHost())->count();

                $dbServers = Server::active()->get(['id', 'status']);
                if ($dbServers->isNotEmpty()) {
                    $serversCount = $dbServers->count();
                    $readyServersCount = $dbServers->where('status', 'ready')->count();
                } else {
                    $allServers = $stacks->all() ?? [];
                    $activeServers = array_filter($allServers, fn (array $s): bool => $s['status'] !== 'missing');
                    $serversCount = count($activeServers);
                    $readyServersCount = count(array_filter($activeServers, fn (array $s): bool => $s['status'] === 'ready'));
                }

                $tools = $readiness->tools();
                $missingRequired = array_filter($tools, fn (array $t): bool => $t['required'] && ! $t['installed']);

                return [
                    'projectsCount' => $projectsCount,
                    'serversCount' => $serversCount,
                    'readyServersCount' => $readyServersCount,
                    'missingToolsCount' => count($missingRequired),
                ];
            }),

            'localCluster' => Inertia::defer(fn (): array => $localCluster->detect()),

            'projects' => Inertia::defer(function () use ($inspector): array {
                return Project::query()
                    ->latest('id')
                    ->get()
                    ->filter(fn (Project $p): bool => $p->existsOnHost())
                    ->take(4)
                    ->map(function (Project $p) use ($inspector): array {
                        if ($p->last_inspected_at !== null && $p->name !== null && $p->framework !== null) {
                            return [
                                'id' => $p->id,
                                'name' => $p->name,
                                'path' => $p->path,
                                'framework' => $p->framework,
                                'webHost' => $p->web_host,
                                'serverIp' => null,
                                'serverContext' => null,
                                'exists' => true,
                                'initialized' => true,
                                'deployable' => true,
                                'environments' => [],
                            ];
                        }

                        return ['id' => $p->id] + $inspector->inspect($p->path);
                    })->values()->all();
            }),

            'servers' => Inertia::defer(function () use ($stacks, $domains): array {
                $dbServers = Server::with(['domains' => fn ($q) => $q->where('external_dns', true)])
                    ->active()
                    ->take(4)
                    ->get();

                if ($dbServers->isNotEmpty()) {
                    return $dbServers->map(fn (Server $s): array => [
                        'name' => $s->name,
                        'provider' => $s->provider,
                        'kind' => $s->kind,
                        'region' => $s->region,
                        'ip' => $s->ip,
                        'port' => $s->port,
                        'context' => $s->context,
                        'status' => $s->status,
                        'role' => $s->role,
                        'hasExternalDns' => $s->domains->isNotEmpty(),
                    ])->all();
                }

                $allServers = $stacks->all() ?? [];
                $activeServers = array_values(array_filter($allServers, fn (array $s): bool => $s['status'] !== 'missing'));
                $activeServers = array_map(function (array $s) use ($domains): array {
                    $s['hasExternalDns'] = is_string($s['context'] ?? null)
                        && collect($domains->forContext($s['context']) ?? [])->contains('externalDns', true);

                    return $s;
                }, $activeServers);

                return array_slice($activeServers, 0, 4);
            }),

            'fleetMetrics' => Inertia::defer(function () use ($stacks, $fleetMetrics): array {
                $dbServers = Server::active()->get(['name', 'status', 'role']);
                if ($dbServers->isNotEmpty()) {
                    $servers = $dbServers->map(fn (Server $s): array => [
                        'name' => $s->name,
                        'status' => $s->status,
                        'role' => $s->role,
                    ])->all();
                } else {
                    $allServers = $stacks->all() ?? [];
                    $servers = array_values(array_filter($allServers, fn (array $s): bool => $s['status'] !== 'missing'));
                }

                $projects = Project::query()
                    ->latest('id')
                    ->get(['id', 'name', 'path', 'framework', 'web_host'])
                    ->filter(fn (Project $p): bool => $p->existsOnHost())
                    ->map(fn (Project $p): array => [
                        'id' => $p->id,
                        'name' => $p->name ?: basename($p->path),
                        'path' => $p->path,
                        'framework' => $p->framework,
                        'webHost' => $p->web_host,
                    ])->values()->all();

                return $fleetMetrics->summary(array_values($servers), array_values($projects));
            }, 'fleetMetrics'),

            // backups/unprotectedServers already shared one HTTP request (same
            // 'backups' defer group) but used to independently recompute the
            // identical cloud-server/backup-status scan — on a cold
            // ClusterStatus::backup() cache (uncached per-context kubectl
            // calls), that was 2x the subprocess work for one response.
            // Computed once here and reshaped for both keys below.
            'backups' => Inertia::defer(function () use ($stacks, $clusterStatus): array {
                return $this->backupSummary($stacks, $clusterStatus);
            }, 'backups'),

            'unprotectedServers' => Inertia::defer(function () use ($stacks, $clusterStatus): array {
                return $this->backupSummary($stacks, $clusterStatus)['unprotected'];
            }, 'backups'),

            // For the dev-only Quick Launch Projects toggle (welcome-onboarding.tsx) — the
            // same catalog/devBoxes/parent shape projects/create.tsx already uses.
            'projectCatalog' => Inertia::defer(fn (): ?array => $frameworks->catalog() === null ? null : [
                'categories' => $frameworks->catalog()['categories'],
                'frameworks' => $frameworks->visible(),
            ], 'projectCatalog'),

            'projectDevBoxes' => Inertia::defer(fn (): array => $settings->experimental()
                ? array_map(fn (array $box): array => ['name' => $box['name'], 'ip' => $box['ip'] ?? null], array_values(array_filter($stacks->devBoxes() ?? [], fn (array $box): bool => $box['status'] === 'ready')))
                : [], 'projectDevBoxes'),
        ]);
    }

    /**
     * The cloud-server/backup-status scan 'backups' and 'unprotectedServers'
     * both need. They share one HTTP request (the 'backups' defer group),
     * but each still runs its OWN closure within it — once() memoizes the
     * actual scan (including every per-context ClusterStatus::backup() call
     * on a cache miss) so it only runs once per request instead of twice.
     *
     * @return array{total: int, protected: int, unprotected: list<string>}
     */
    private function backupSummary(StackCatalog $stacks, ClusterStatus $clusterStatus): array
    {
        return once(function () use ($stacks, $clusterStatus): array {
            if (Server::active()->exists()) {
                $cloudServers = Server::active()
                    ->where('status', 'ready')
                    ->whereNotNull('context')
                    ->get()
                    ->reject(fn (Server $s): bool => Server::isStackLocal([
                        'name' => $s->name,
                        'provider' => $s->provider,
                        'kind' => $s->kind,
                        'ip' => $s->ip,
                        'context' => $s->context,
                        'status' => $s->status,
                    ]))->values();

                $unprotected = [];
                foreach ($cloudServers as $server) {
                    if ($server->backup_last_synced_at === null || $server->backup_last_synced_at->diffInMinutes(now()) > 30) {
                        SyncServerBackupJob::dispatch($server->id);
                    }

                    if ($server->backup_configured === false) {
                        $unprotected[] = $server->name;
                    }
                }

                $total = $cloudServers->count();
                $protected = max(0, $total - count($unprotected));

                return ['total' => $total, 'protected' => $protected, 'unprotected' => $unprotected];
            }

            $allServers = $stacks->all() ?? [];
            $cloudServers = collect($allServers)
                ->filter(fn (array $server): bool => $server['status'] === 'ready' && is_string($server['context'] ?? null))
                ->reject(fn (array $server): bool => Server::isStackLocal($server))
                ->values();

            $unprotected = array_values($cloudServers
                ->filter(fn (array $server): bool => ($clusterStatus->backup((string) $server['context'])['configured'] ?? true) === false)
                ->map(fn (array $server): string => (string) $server['name'])
                ->all());

            $total = $cloudServers->count();
            $protected = max(0, $total - count($unprotected));

            return ['total' => $total, 'protected' => $protected, 'unprotected' => $unprotected];
        });
    }
}
