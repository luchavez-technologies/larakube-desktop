<?php

namespace App\Services\LaraKube;

use Illuminate\Support\Facades\Process;

/** What Kubernetes cluster, if any, this computer is already running for local development. */
class LocalCluster
{
    public function __construct(private ToolLocator $locator) {}

    /**
     * @return array{engine: string, context: ?string, status: string, tone: string}
     */
    public function detect(): array
    {
        $kubectl = $this->locator->find('kubectl');
        if ($kubectl === null) {
            return [
                'engine' => 'None',
                'context' => null,
                'status' => 'kubectl missing',
                'tone' => 'muted',
            ];
        }

        try {
            $isolated = $this->locator->isolate([$kubectl, 'config', 'current-context']);
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

            $infoIsolated = $this->locator->isolate([$kubectl, 'cluster-info', '--request-timeout=2s']);
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
