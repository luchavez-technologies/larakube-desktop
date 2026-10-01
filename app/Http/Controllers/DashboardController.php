<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Run;
use App\Services\LaraKube\ProjectInspector;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\Process;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function index(
        StackCatalog $stacks,
        ReadinessCheck $readiness,
        ProjectInspector $inspector,
        ToolLocator $locator,
    ): Response {
        $allProjects = Project::query()->latest('id')->get();
        $projectsCount = $allProjects->count();
        $recentProjects = $allProjects->take(4)->map(fn (Project $p): array => [
            'id' => $p->id,
            'name' => basename($p->path),
            'path' => $p->path,
        ] + $inspector->inspect($p->path))->all();

        $allServers = $stacks->all() ?? [];
        $readyServersCount = count(array_filter($allServers, fn (array $s): bool => $s['status'] === 'ready'));

        $recentRuns = Run::query()->latest('id')->take(5)->get(['id', 'label', 'kind', 'status', 'created_at', 'target_type', 'target_name', 'environment']);

        $tools = $readiness->tools();
        $missingRequired = array_filter($tools, fn (array $t): bool => $t['required'] && ! $t['installed']);

        $localCluster = $this->detectLocalCluster($locator);

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
            'localCluster' => $localCluster,
        ]);
    }

    /**
     * @return array{engine: string, context: ?string, status: string, tone: string}
     */
    private function detectLocalCluster(ToolLocator $locator): array
    {
        $kubectl = $locator->find('kubectl');
        if ($kubectl === null) {
            return [
                'engine' => 'None',
                'context' => null,
                'status' => 'kubectl missing',
                'tone' => 'muted',
            ];
        }

        try {
            $isolated = $locator->isolate([$kubectl, 'config', 'current-context']);
            $result = Process::env($isolated['environment'])
                ->timeout(3)
                ->run($isolated['command']);

            if (! $result->successful()) {
                return [
                    'engine' => 'None',
                    'context' => null,
                    'status' => 'No cluster context',
                    'tone' => 'muted',
                ];
            }

            $context = trim($result->output());
            $lower = strtolower($context);

            $engine = match (true) {
                str_contains($lower, 'orbstack') => 'OrbStack',
                str_contains($lower, 'docker-desktop') => 'Docker Desktop',
                str_contains($lower, 'k3s') => 'k3s',
                str_contains($lower, 'colima') => 'Colima',
                str_contains($lower, 'minikube') => 'Minikube',
                str_contains($lower, 'kind') => 'Kind',
                $context !== '' => $context,
                default => 'None',
            };

            $infoIsolated = $locator->isolate([$kubectl, 'cluster-info', '--request-timeout=2s']);
            $infoResult = Process::env($infoIsolated['environment'])
                ->timeout(4)
                ->run($infoIsolated['command']);

            $isReachable = $infoResult->successful();

            return [
                'engine' => $engine,
                'context' => $context,
                'status' => $isReachable ? 'Ready for up' : 'Offline / not reachable',
                'tone' => $isReachable ? 'ok' : 'warn',
            ];
        } catch (\Throwable) {
            return [
                'engine' => 'Unknown',
                'context' => null,
                'status' => 'Detection failed',
                'tone' => 'muted',
            ];
        }
    }
}
