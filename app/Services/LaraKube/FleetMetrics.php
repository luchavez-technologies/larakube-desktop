<?php

namespace App\Services\LaraKube;

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Models\Run;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class FleetMetrics
{
    /**
     * Fleet-wide summary metrics for Dashboard.
     *
     * @param  list<array<string, mixed>>  $servers
     * @param  list<array<string, mixed>>  $projects
     * @return array{fleetHealthScore: int, totalServers: int, readyServers: int, totalProjects: int, deploys30d: int, deploySuccessRate: int, avgDeployDurationSeconds: ?int, deployActivity14d: list<int>}
     */
    public function summary(array $servers, array $projects): array
    {
        $totalServers = count($servers);
        $readyServers = count(array_filter($servers, fn ($s) => ($s['status'] ?? '') === 'ready'));
        $totalProjects = count($projects);

        // Fleet health score: weighted ratio of ready servers and non-failed runs
        $serverRatio = $totalServers > 0 ? ($readyServers / $totalServers) : 1.0;

        $runs30d = Run::query()
            ->whereIn('kind', [RunKind::DeployApp, RunKind::UpProject])
            ->where('created_at', '>=', now()->subDays(30))
            ->get(['id', 'status', 'created_at', 'finished_at']);

        $totalDeploys = $runs30d->count();
        $succeededDeploys = $runs30d->where('status', RunStatus::Succeeded)->count();
        $successRate = $totalDeploys > 0 ? (int) round(($succeededDeploys / $totalDeploys) * 100) : 100;

        $durations = [];
        foreach ($runs30d as $run) {
            if ($run->status === RunStatus::Succeeded && $run->finished_at && $run->created_at) {
                $durations[] = abs((int) $run->finished_at->diffInSeconds($run->created_at));
            }
        }
        $avgDuration = count($durations) > 0 ? (int) round(array_sum($durations) / count($durations)) : null;

        // 14-day activity strip
        $activity14d = $this->build14dActivity($runs30d);

        $healthScore = (int) round(($serverRatio * 0.7 + ($successRate / 100) * 0.3) * 100);

        return [
            'fleetHealthScore' => min(100, max(0, $healthScore)),
            'totalServers' => $totalServers,
            'readyServers' => $readyServers,
            'totalProjects' => $totalProjects,
            'deploys30d' => $totalDeploys,
            'deploySuccessRate' => $successRate,
            'avgDeployDurationSeconds' => $avgDuration,
            'deployActivity14d' => $activity14d,
        ];
    }

    /**
     * Project-specific deploy metrics.
     *
     * @return array{totalDeploys: int, successRate: int, avgDurationSeconds: ?int, lastDeployedAt: ?string, activity14d: list<int>}
     */
    public function projectDeployStats(int $projectId, ?string $environment = null): array
    {
        $query = Run::query()
            ->where('project_id', $projectId)
            ->whereIn('kind', [RunKind::DeployApp, RunKind::UpProject]);

        if ($environment !== null && $environment !== '') {
            $envLower = strtolower(trim($environment));
            $query->where(function ($q) use ($envLower) {
                $q->where('environment', $envLower)
                    ->orWhere('label', 'like', "%({$envLower})%");
            });
        }

        $runs = $query->latest('id')
            ->take(50)
            ->get(['id', 'status', 'created_at', 'finished_at']);

        $total = $runs->count();
        $succeeded = $runs->where('status', RunStatus::Succeeded)->count();
        $successRate = $total > 0 ? (int) round(($succeeded / $total) * 100) : 100;

        $durations = [];
        $succeededRun = $runs->firstWhere('status', RunStatus::Succeeded);
        $lastDeployed = $succeededRun instanceof Run
            ? $succeededRun->finished_at
            : $runs->first()?->created_at;

        foreach ($runs as $run) {
            if ($run->status === RunStatus::Succeeded && $run->finished_at && $run->created_at) {
                $durations[] = abs((int) $run->finished_at->diffInSeconds($run->created_at));
            }
        }
        $avgDuration = count($durations) > 0 ? (int) round(array_sum($durations) / count($durations)) : null;

        $activity14d = $this->build14dActivity($runs);

        return [
            'totalDeploys' => $total,
            'successRate' => $successRate,
            'avgDurationSeconds' => $avgDuration,
            'lastDeployedAt' => $lastDeployed?->toIso8601String(),
            'activity14d' => $activity14d,
        ];
    }

    /**
     * @param  Collection<int, Run>  $runs
     * @return list<int>
     */
    private function build14dActivity($runs): array
    {
        $days = [];
        for ($i = 13; $i >= 0; $i--) {
            $key = now()->subDays($i)->format('Y-m-d');
            $days[$key] = 0;
        }

        foreach ($runs as $run) {
            if ($run->created_at) {
                $date = Carbon::parse($run->created_at)->format('Y-m-d');
                if (isset($days[$date])) {
                    $days[$date]++;
                }
            }
        }

        return array_values($days);
    }
}
