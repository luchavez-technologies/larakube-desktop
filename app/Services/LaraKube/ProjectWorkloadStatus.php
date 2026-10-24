<?php

namespace App\Services\LaraKube;

use App\Enums\RunKind;
use App\Jobs\Sync\SyncLocalWorkloadsJob;
use App\Models\LocalClusterState;
use App\Models\Project;
use App\Models\Run;
use Illuminate\Support\Facades\Process;

class ProjectWorkloadStatus
{
    /**
     * Local Deployment/StatefulSet replica counts, cluster-wide. Called on
     * every Projects list/show request — this used to be a real,
     * synchronous `kubectl get -A` shelled out fresh on every single
     * navigation (behind only a 5-second cache), which on Windows
     * (WSL-wrapped kubectl, no persistent session) is the kind of call that
     * made clicking between pages feel frozen. SyncLocalWorkloadsJob now
     * keeps `local_cluster_state.workloads_data` current in the background
     * (a 15-second schedule tick, matching SyncLocalClusterJob, plus an
     * immediate dispatch on app boot and on any local up/down/start/stop via
     * RecordRunOutput), so a machine that has synced even once reads this
     * instantly from the database. Only a never-synced machine falls back to
     * the live call here, which also primes the database for every request
     * after it — same shape as DashboardController's `localCluster` prop.
     *
     * @return array<string, array{replicas: int, readyReplicas: int, deploymentsCount: int}>
     */
    public function localWorkloadStatuses(ToolLocator $locator): array
    {
        $state = LocalClusterState::current();

        if ($state->workloads_last_synced_at !== null) {
            return $state->workloads_data ?? [];
        }

        $workloads = $this->fetchLocalWorkloadStatuses($locator);
        SyncLocalWorkloadsJob::dispatch();

        return $workloads;
    }

    /**
     * @return array<string, array{replicas: int, readyReplicas: int, deploymentsCount: int}>
     */
    public function fetchLocalWorkloadStatuses(ToolLocator $locator): array
    {
        $cli = $locator->find('kubectl');
        if ($cli === null) {
            return [];
        }

        try {
            $isolated = $locator->isolate([$cli, 'get', 'deployments,statefulsets', '-A', '-o', 'json']);
            $result = Process::env($isolated['environment'])->timeout(2)->run($isolated['command']);
            if (! $result->successful()) {
                return [];
            }

            $items = json_decode($result->output(), true)['items'] ?? [];
            if (! is_array($items)) {
                return [];
            }

            $namespaces = [];
            foreach ($items as $item) {
                $ns = (string) ($item['metadata']['namespace'] ?? '');
                if (! str_ends_with($ns, '-local')) {
                    continue;
                }

                $replicas = (int) ($item['spec']['replicas'] ?? 0);
                $readyReplicas = (int) ($item['status']['readyReplicas'] ?? 0);

                $namespaces[$ns] ??= ['replicas' => 0, 'readyReplicas' => 0, 'deploymentsCount' => 0];
                $namespaces[$ns]['replicas'] += $replicas;
                $namespaces[$ns]['readyReplicas'] += $readyReplicas;
                $namespaces[$ns]['deploymentsCount']++;
            }

            return $namespaces;
        } catch (\Throwable) {
            return [];
        }
    }

    /**
     * @param  array<string, mixed>  $inspection
     * @param  array<string, array{replicas: int, readyReplicas: int, deploymentsCount: int}>  $workloads
     * @return array{state: 'running'|'paused'|'starting'|'stopping'|'down'|'uninitialized', label: string, tone: 'ok'|'warn'|'busy'|'muted', domain?: string, replicas?: int, readyReplicas?: int}
     */
    public function resolveLocalStatus(Project $project, array $inspection, ?Run $activeRun, array $workloads): array
    {
        if (! $inspection['exists'] || ! $inspection['initialized']) {
            return [
                'state' => 'uninitialized',
                'label' => 'Not set up',
                'tone' => 'muted',
            ];
        }

        $appName = $inspection['name'];
        $effectiveTld = (string) ($inspection['effectiveTld'] ?? 'test');
        $domain = "{$appName}.{$effectiveTld}";

        if ($activeRun !== null) {
            $isStopping = in_array($activeRun->kind, [RunKind::StopProject, RunKind::DownProject], true);

            return [
                'state' => $isStopping ? 'stopping' : 'starting',
                'label' => $isStopping ? 'Stopping…' : 'Starting…',
                'tone' => 'busy',
                'domain' => $domain,
            ];
        }

        $ns = "{$appName}-local";
        $workload = $workloads[$ns] ?? null;

        if ($workload !== null) {
            if ($workload['readyReplicas'] > 0) {
                return [
                    'state' => 'running',
                    'label' => 'Running',
                    'tone' => 'ok',
                    'domain' => $domain,
                    'replicas' => $workload['replicas'],
                    'readyReplicas' => $workload['readyReplicas'],
                ];
            }

            if ($workload['replicas'] === 0) {
                return [
                    'state' => 'paused',
                    'label' => 'Paused',
                    'tone' => 'warn',
                    'domain' => $domain,
                    'replicas' => 0,
                    'readyReplicas' => 0,
                ];
            }

            return [
                'state' => 'starting',
                'label' => 'Starting…',
                'tone' => 'busy',
                'domain' => $domain,
                'replicas' => $workload['replicas'],
                'readyReplicas' => $workload['readyReplicas'],
            ];
        }

        return [
            'state' => 'down',
            'label' => 'Down',
            'tone' => 'muted',
            'domain' => $domain,
        ];
    }
}
