<?php

namespace App\Services\LaraKube;

use Illuminate\Support\Facades\Process;
use Throwable;

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
            $viewIsolated = $this->locator->isolate([$kubectl, 'config', 'view', '-o', 'json']);
            $viewResult = Process::env($viewIsolated['environment'])
                ->timeout(5)
                ->run($viewIsolated['command']);

            $currentContext = '';
            $contexts = [];
            $clusters = [];

            $data = $viewResult->successful() ? json_decode($viewResult->output(), true) : null;

            if (is_array($data)) {
                $currentContext = (string) ($data['current-context'] ?? '');
                foreach ($data['contexts'] ?? [] as $c) {
                    $cName = (string) ($c['name'] ?? '');
                    if ($cName !== '') {
                        $clusterName = (string) ($c['context']['cluster'] ?? '');
                        $contexts[$cName] = $clusterName;
                    }
                }
                foreach ($data['clusters'] ?? [] as $cl) {
                    $clName = (string) ($cl['name'] ?? '');
                    if ($clName !== '') {
                        $clusters[$clName] = (string) ($cl['cluster']['server'] ?? '');
                    }
                }
            } else {
                $currIsolated = $this->locator->isolate([$kubectl, 'config', 'current-context']);
                $currResult = Process::env($currIsolated['environment'])
                    ->timeout(3)
                    ->run($currIsolated['command']);

                if ($currResult->successful()) {
                    $currentContext = trim($currResult->output());
                    if ($currentContext !== '') {
                        $contexts[$currentContext] = '';
                    }
                }
            }

            if ($contexts === [] && $currentContext === '') {
                return [
                    'engine' => 'None',
                    'context' => null,
                    'status' => 'No cluster context',
                    'tone' => 'muted',
                ];
            }

            $targetContext = null;
            $targetEngine = null;

            // 1. If current-context is a local cluster, prioritize it
            if ($currentContext !== '') {
                $serverUrl = $clusters[$contexts[$currentContext] ?? ''] ?? '';
                $engine = $this->resolveLocalEngine($currentContext, $serverUrl);
                if ($engine !== null) {
                    $targetContext = $currentContext;
                    $targetEngine = $engine;
                }
            }

            // 2. If current-context is remote (e.g. larakube-<ip> cloud server), search other contexts
            if ($targetContext === null) {
                $localCandidates = [];
                foreach ($contexts as $ctxName => $clusterName) {
                    $serverUrl = $clusters[$clusterName] ?? '';
                    $engine = $this->resolveLocalEngine($ctxName, $serverUrl);
                    if ($engine !== null) {
                        $localCandidates[$ctxName] = $engine;
                    }
                }

                if ($localCandidates === []) {
                    return [
                        'engine' => 'None',
                        'context' => null,
                        'status' => 'No local cluster running',
                        'tone' => 'muted',
                    ];
                }

                // Check if any local candidate is reachable, prioritizing k3s-larakube
                uksort($localCandidates, function (string $a, string $b): int {
                    if ($a === 'k3s-larakube') {
                        return -1;
                    }
                    if ($b === 'k3s-larakube') {
                        return 1;
                    }

                    return 0;
                });

                $firstContext = array_key_first($localCandidates);
                $targetContext = $firstContext;
                $targetEngine = $localCandidates[$firstContext];

                foreach ($localCandidates as $candidateCtx => $candidateEngine) {
                    $probeIsolated = $this->locator->isolate([$kubectl, 'cluster-info', "--context={$candidateCtx}", '--request-timeout=2s']);
                    $probeResult = Process::env($probeIsolated['environment'])
                        ->timeout(3)
                        ->run($probeIsolated['command']);

                    if ($probeResult->successful()) {
                        return [
                            'engine' => $candidateEngine,
                            'context' => $candidateCtx,
                            'status' => 'Ready for up',
                            'tone' => 'ok',
                        ];
                    }
                }

                // None reachable, report the preferred candidate as offline
                return [
                    'engine' => $targetEngine,
                    'context' => $targetContext,
                    'status' => 'Offline / not reachable',
                    'tone' => 'warn',
                ];
            }

            // Test reachability for targetContext
            $infoIsolated = $this->locator->isolate([$kubectl, 'cluster-info', "--context={$targetContext}", '--request-timeout=2s']);
            $infoResult = Process::env($infoIsolated['environment'])
                ->timeout(4)
                ->run($infoIsolated['command']);

            $isReachable = $infoResult->successful();

            return [
                'engine' => $targetEngine,
                'context' => $targetContext,
                'status' => $isReachable ? 'Ready for up' : 'Offline / not reachable',
                'tone' => $isReachable ? 'ok' : 'warn',
            ];
        } catch (Throwable) {
            return [
                'engine' => 'Unknown',
                'context' => null,
                'status' => 'Detection failed',
                'tone' => 'muted',
            ];
        }
    }

    /**
     * Determine if a context / server URL represents a local development cluster.
     * Returns the human-readable engine name, or null if it's a remote/cloud cluster.
     */
    public function resolveLocalEngine(string $context, string $serverUrl = ''): ?string
    {
        $lowerContext = strtolower(trim($context));
        $lowerServer = strtolower(trim($serverUrl));

        if ($lowerContext === '') {
            return null;
        }

        // Explicitly exclude remote LaraKube cloud servers, devboxes, and workspaces
        if (preg_match('/^larakube-\d+\.\d+\.\d+\.\d+/', $lowerContext)
            || str_starts_with($lowerContext, 'larakube-devbox-')
            || str_starts_with($lowerContext, 'larakube-workspace-')
        ) {
            return null;
        }

        // Exclude known cloud providers by server URL domain
        if (str_contains($lowerServer, 'digitalocean.com')
            || str_contains($lowerServer, 'amazonaws.com')
            || str_contains($lowerServer, 'azure.com')
            || str_contains($lowerServer, 'google.com')
            || str_contains($lowerServer, 'gke.goog')
            || str_contains($lowerServer, 'oraclecloud.com')
            || str_contains($lowerServer, 'linode.com')
            || str_contains($lowerServer, 'hetzner.cloud')
        ) {
            return null;
        }

        // Match known local Kubernetes distributions
        if (str_contains($lowerContext, 'orbstack') || str_contains($lowerServer, 'orb.local')) {
            return 'OrbStack';
        }

        if (str_contains($lowerContext, 'docker-desktop')
            || str_contains($lowerContext, 'docker-for-desktop')
            || str_contains($lowerServer, 'kubernetes.docker.internal')
        ) {
            return 'Docker Desktop';
        }

        if ($lowerContext === 'k3s-larakube' || str_contains($lowerContext, 'k3s')) {
            // Ensure this isn't a remote k3s server on a non-loopback IP
            if ($lowerServer !== '' && ! $this->isLoopbackServer($lowerServer)) {
                return null;
            }

            return 'k3s';
        }

        if (str_contains($lowerContext, 'colima')) {
            return 'Colima';
        }

        if (str_contains($lowerContext, 'minikube')) {
            return 'Minikube';
        }

        if (str_starts_with($lowerContext, 'kind-') || $lowerContext === 'kind') {
            return 'Kind';
        }

        if (str_starts_with($lowerContext, 'k3d-') || $lowerContext === 'k3d') {
            return 'k3d';
        }

        if (str_contains($lowerContext, 'rancher-desktop')) {
            return 'Rancher Desktop';
        }

        if (str_contains($lowerContext, 'microk8s')) {
            return 'MicroK8s';
        }

        // If context name didn't match known distributions, but the API server URL
        // is strictly a local loopback address, treat it as local.
        if ($lowerServer !== '' && $this->isLoopbackServer($lowerServer)) {
            return $context;
        }

        return null;
    }

    private function isLoopbackServer(string $serverUrl): bool
    {
        $host = parse_url($serverUrl, PHP_URL_HOST) ?? $serverUrl;

        return in_array($host, ['127.0.0.1', 'localhost', '::1', '[::1]', 'host.docker.internal'], true);
    }
}
