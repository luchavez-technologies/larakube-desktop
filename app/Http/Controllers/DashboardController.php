<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Run;
use App\Services\LaraKube\ClusterStatus;
use App\Services\LaraKube\DomainCatalog;
use App\Services\LaraKube\FleetMetrics;
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
    ): Response|RedirectResponse {
        // A first launch has no CLI yet, and every other page needs it: Setup installs it.
        if ($locator->find('larakube') === null) {
            return redirect()->route('readiness');
        }

        $allProjects = Project::query()->latest('id')->get();
        $projectsCount = $allProjects->count();
        $recentProjects = $allProjects->take(4)->map(fn (Project $p): array => [
            'id' => $p->id,
            'name' => basename($p->path),
            'path' => $p->path,
        ] + $inspector->inspect($p->path))->all();

        $allServers = $stacks->all() ?? [];
        $readyServersCount = count(array_filter($allServers, fn (array $s): bool => $s['status'] === 'ready'));

        // An instant DB read (DomainCatalog), not a live DNS/TLS/kubectl
        // check — safe to compute for every server up front so Quick
        // Launch's cluster picker can show this consistently for all of
        // them, not just whichever one happens to be selected.
        $allServers = array_map(function (array $s) use ($domains): array {
            $s['hasExternalDns'] = is_string($s['context'] ?? null)
                && collect($domains->forContext($s['context']) ?? [])->contains('externalDns', true);

            return $s;
        }, $allServers);

        $recentRuns = Run::query()->latest('id')->take(5)->get(['id', 'label', 'kind', 'status', 'created_at', 'target_type', 'target_name', 'environment']);

        $tools = $readiness->tools();
        $missingRequired = array_filter($tools, fn (array $t): bool => $t['required'] && ! $t['installed']);

        $cluster = $localCluster->detect();

        return Inertia::render('dashboard/index', [
            'stats' => [
                'projectsCount' => $projectsCount,
                'serversCount' => count($allServers),
                'readyServersCount' => $readyServersCount,
                'missingToolsCount' => count($missingRequired),
            ],
            'projects' => $recentProjects,
            'servers' => array_slice($allServers, 0, 4),
            'runs' => $recentRuns,
            'toolsReady' => $missingRequired === [],
            'localCluster' => $cluster,
            'fleetMetrics' => Inertia::defer(fn (): array => $fleetMetrics->summary($allServers, array_values($recentProjects)), 'fleetMetrics'),
            'unprotectedServers' => Inertia::defer(fn (): array => collect($allServers)
                ->filter(fn (array $server): bool => $server['status'] === 'ready' && is_string($server['context']))
                ->filter(fn (array $server): bool => ($clusterStatus->backup($server['context'])['configured'] ?? true) === false)
                ->pluck('name')
                ->values()
                ->all(), 'backups'),
        ]);
    }
}
