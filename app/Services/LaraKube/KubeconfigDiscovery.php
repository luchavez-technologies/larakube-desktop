<?php

namespace App\Services\LaraKube;

use Illuminate\Support\Facades\Process;
use Throwable;

class KubeconfigDiscovery
{
    public function __construct(private ToolLocator $locator) {}

    /**
     * Discover all clusters/contexts from local ~/.kube/config that are not
     * already registered LaraKube stacks.
     *
     * @param  list<string>  $existingContexts  Contexts of already registered stacks
     * @return list<array{name: string, provider: string, kind: string, region: ?string, ip: ?string, context: string, status: string, isCurrent: bool}>
     */
    public function discover(array $existingContexts = []): array
    {
        $kubectl = $this->locator->find('kubectl');
        if ($kubectl === null) {
            return [];
        }

        try {
            $isolated = $this->locator->isolate([$kubectl, 'config', 'view', '-o', 'json']);
            $result = Process::env($isolated['environment'])->timeout(10)->run($isolated['command']);

            if (! $result->successful()) {
                return [];
            }

            $data = json_decode($result->output(), true);
            if (! is_array($data)) {
                return [];
            }

            $currentContext = (string) ($data['current-context'] ?? '');
            $contexts = $data['contexts'] ?? [];
            $clusters = [];

            foreach ($data['clusters'] ?? [] as $c) {
                if (isset($c['name'])) {
                    $clusters[$c['name']] = $c['cluster'] ?? [];
                }
            }

            $discovered = [];

            foreach ($contexts as $item) {
                $contextName = (string) ($item['name'] ?? '');
                if ($contextName === '' || in_array($contextName, $existingContexts, true)) {
                    continue;
                }

                $clusterName = (string) ($item['context']['cluster'] ?? '');
                $clusterInfo = $clusters[$clusterName] ?? [];
                $serverUrl = (string) ($clusterInfo['server'] ?? '');

                $provider = $this->detectProvider($contextName, $clusterName, $serverUrl);
                $ip = $this->extractIp($serverUrl);
                $isLocal = str_contains($serverUrl, '127.0.0.1') || str_contains($serverUrl, 'localhost') || $provider === 'orbstack' || $provider === 'docker';

                $discovered[] = [
                    'name' => $contextName,
                    'provider' => $provider,
                    'kind' => 'discovered',
                    'region' => $isLocal ? 'local' : 'remote',
                    'ip' => $ip,
                    'context' => $contextName,
                    'status' => 'ready',
                    'isCurrent' => $contextName === $currentContext,
                ];
            }

            return $discovered;
        } catch (Throwable) {
            return [];
        }
    }

    private function detectProvider(string $context, string $cluster, string $server): string
    {
        $haystack = strtolower("{$context} {$cluster} {$server}");

        if (str_contains($haystack, 'orbstack')) {
            return 'orbstack';
        }

        if (str_contains($haystack, 'docker-desktop') || str_contains($haystack, 'docker-for-desktop')) {
            return 'docker';
        }

        if (str_contains($haystack, 'minikube')) {
            return 'minikube';
        }

        if (str_contains($haystack, 'k3d')) {
            return 'k3d';
        }

        if (str_contains($haystack, 'kind-') || str_contains($haystack, 'kind')) {
            return 'kind';
        }

        if (str_contains($haystack, 'gke') || str_contains($haystack, 'google')) {
            return 'gcp';
        }

        if (str_contains($haystack, 'eks') || str_contains($haystack, 'amazonaws.com')) {
            return 'aws';
        }

        if (str_contains($haystack, 'digitalocean.com') || str_contains($haystack, 'doks')) {
            return 'do';
        }

        if (str_contains($server, '127.0.0.1') || str_contains($server, 'localhost')) {
            return 'local';
        }

        return 'cloud';
    }

    private function extractIp(string $server): ?string
    {
        if (preg_match('#https?://([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)#', $server, $matches)) {
            $ip = $matches[1];
            if ($ip !== '127.0.0.1') {
                return $ip;
            }
        }

        return null;
    }
}
