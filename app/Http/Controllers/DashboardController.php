<?php

namespace App\Http\Controllers;

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
                $projectsCount = Project::query()->count();
                $allServers = $stacks->all() ?? [];
                $readyServersCount = count(array_filter($allServers, fn (array $s): bool => $s['status'] === 'ready'));
                $tools = $readiness->tools();
                $missingRequired = array_filter($tools, fn (array $t): bool => $t['required'] && ! $t['installed']);

                return [
                    'projectsCount' => $projectsCount,
                    'serversCount' => count($allServers),
                    'readyServersCount' => $readyServersCount,
                    'missingToolsCount' => count($missingRequired),
                ];
            }),

            'localCluster' => Inertia::defer(fn (): array => $localCluster->detect()),

            'toolsReady' => Inertia::defer(function () use ($readiness): bool {
                $tools = $readiness->tools();
                $missingRequired = array_filter($tools, fn (array $t): bool => $t['required'] && ! $t['installed']);

                return $missingRequired === [];
            }),

            'projects' => Inertia::defer(function () use ($inspector): array {
                return Project::query()->latest('id')->take(4)->get()->map(fn (Project $p): array => [
                    'id' => $p->id,
                    'name' => basename($p->path),
                    'path' => $p->path,
                ] + $inspector->inspect($p->path))->all();
            }),

            'servers' => Inertia::defer(function () use ($stacks, $domains): array {
                $allServers = $stacks->all() ?? [];
                $allServers = array_map(function (array $s) use ($domains): array {
                    $s['hasExternalDns'] = is_string($s['context'] ?? null)
                        && collect($domains->forContext($s['context']) ?? [])->contains('externalDns', true);

                    return $s;
                }, $allServers);

                return array_slice($allServers, 0, 4);
            }),

            'fleetMetrics' => Inertia::defer(function () use ($stacks, $inspector, $fleetMetrics): array {
                $allServers = $stacks->all() ?? [];
                $recentProjects = Project::query()->latest('id')->take(4)->get()->map(fn (Project $p): array => [
                    'id' => $p->id,
                    'name' => basename($p->path),
                    'path' => $p->path,
                ] + $inspector->inspect($p->path))->all();

                return $fleetMetrics->summary($allServers, array_values($recentProjects));
            }, 'fleetMetrics'),

            'backups' => Inertia::defer(function () use ($stacks, $clusterStatus): array {
                $allServers = $stacks->all() ?? [];
                $cloudServers = collect($allServers)
                    ->filter(fn (array $server): bool => $server['status'] === 'ready' && is_string($server['context'] ?? null))
                    ->reject(fn (array $server): bool => Server::isStackLocal($server))
                    ->values();

                $unprotected = $cloudServers
                    ->filter(fn (array $server): bool => ($clusterStatus->backup((string) $server['context'])['configured'] ?? true) === false)
                    ->pluck('name')
                    ->values()
                    ->all();

                $total = $cloudServers->count();
                $protected = max(0, $total - count($unprotected));

                return [
                    'total' => $total,
                    'protected' => $protected,
                    'unprotected' => $unprotected,
                ];
            }, 'backups'),

            'unprotectedServers' => Inertia::defer(function () use ($stacks, $clusterStatus): array {
                $allServers = $stacks->all() ?? [];

                return collect($allServers)
                    ->filter(fn (array $server): bool => $server['status'] === 'ready' && is_string($server['context'] ?? null))
                    ->reject(fn (array $server): bool => Server::isStackLocal($server))
                    ->filter(fn (array $server): bool => ($clusterStatus->backup((string) $server['context'])['configured'] ?? true) === false)
                    ->pluck('name')
                    ->values()
                    ->all();
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
}
