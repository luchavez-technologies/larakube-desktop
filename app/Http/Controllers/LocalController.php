<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Models\Project;
use App\Models\Run;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ClusterMetrics;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\LocalCluster;
use App\Services\LaraKube\LocalHealth;
use App\Services\LaraKube\ProjectInspector;
use App\Services\LaraKube\ProjectWatcher;
use App\Services\LaraKube\ProjectWorkloadStatus;
use App\Services\LaraKube\ToolLocator;
use App\Services\Wsl;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The Local section: what runs on this machine's cluster across every
 * project. Its health, the projects running locally, and the shared dev
 * companions (cluster-wide, so they live here, not on a project).
 */
class LocalController extends Controller
{
    public function index(ToolLocator $locator, GlobalSettings $settings, LocalCluster $cluster, ProjectInspector $inspector, ProjectWorkloadStatus $workloadStatus, ProjectWatcher $watcher): Response
    {
        $engine = $cluster->detect();

        return Inertia::render('local/index', [
            'localTld' => $settings->getLocalTld(),
            'engine' => $engine,
            'projects' => $this->projects($locator, $inspector, $workloadStatus, $watcher),
            'health' => Inertia::defer(fn (): array => app(LocalHealth::class)->report(), 'health'),
            'metrics' => Inertia::defer(fn (): ?array => is_string($engine['context'] ?? null) ? app(ClusterMetrics::class)->nodeMetrics($engine['context']) : null, 'health'),
            'companions' => Inertia::defer(fn (): array => app(CompanionController::class)->all($locator, $settings), 'companions'),
        ]);
    }

    public function refreshHealth(LocalHealth $health): RedirectResponse
    {
        $health->forget();

        return back();
    }

    /**
     * Remove local certificates nothing on the local cluster serves any more
     * (`trust:prune`). The dialog has already said they come back on the next
     * install or `up`.
     */
    public function pruneCertificates(Request $request, CliRunner $runner): RedirectResponse
    {
        $run = $runner->start(
            label: 'Clean up unused local certificates',
            arguments: ['trust:prune', '--force', '--json'],
            kind: RunKind::TrustPrune,
            subject: 'local:certificates',
            targetType: 'local',
            targetName: 'Local certificates',
            environment: 'local',
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /**
     * Every set-up project with its local state, running ones first. A project
     * that was never set up locally is left out.
     *
     * @return list<array<string, mixed>>
     */
    private function projects(ToolLocator $locator, ProjectInspector $inspector, ProjectWorkloadStatus $workloadStatus, ProjectWatcher $watcher): array
    {
        $workloads = $workloadStatus->localWorkloadStatuses($locator);
        $distroRunning = ! $locator->isWindows() || app(Wsl::class)->distroIsRunning();
        $activeRuns = Run::query()
            ->where('status', RunStatus::Running)
            ->whereIn('kind', [RunKind::UpProject, RunKind::DownProject, RunKind::StartProject, RunKind::StopProject])
            ->whereNotNull('project_id')
            ->get()
            ->keyBy('project_id');

        $order = ['running' => 0, 'starting' => 1, 'stopping' => 2, 'paused' => 3, 'down' => 4];

        $projects = Project::query()->visible()->orderBy('name')->get()
            ->map(function (Project $project) use ($inspector, $workloadStatus, $watcher, $workloads, $distroRunning, $activeRuns): ?array {
                $inspection = $inspector->inspect($project->path, allowWslFilesystem: $distroRunning, projectModel: $project);

                if (! $inspection['exists'] || ! $inspection['initialized']) {
                    return null;
                }

                $status = $workloadStatus->resolveLocalStatus($project, $inspection, $activeRuns->get($project->id), $workloads);
                $liveReload = $watcher->summary($project);

                return [
                    'id' => $project->id,
                    'name' => $inspection['name'],
                    'framework' => $inspection['framework'],
                    'database' => $inspection['database'],
                    'cacheDriver' => $inspection['cacheDriver'],
                    'domain' => $status['domain'] ?? null,
                    'localStatus' => $status,
                    'liveReload' => [
                        'enabled' => (bool) $liveReload['enabled'],
                        'status' => $liveReload['status'],
                        'targets' => $liveReload['targets'],
                        'lastReloadAt' => $liveReload['lastReloadAt'],
                    ],
                ];
            })
            ->filter()
            ->sortBy(fn (array $project): int => $order[$project['localStatus']['state']] ?? 9)
            ->all();

        return array_values($projects);
    }
}
