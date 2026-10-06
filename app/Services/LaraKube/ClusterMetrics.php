<?php

namespace App\Services\LaraKube;

use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Process;

class ClusterMetrics
{
    public const TTL_SECONDS = 45;

    public function __construct(private ToolLocator $locator) {}

    /**
     * Node hardware metrics (CPU & Memory utilization) from `kubectl top nodes`.
     *
     * @return array{available: bool, cpuPercent: ?int, memoryPercent: ?int, cpuUsage: ?string, memoryUsage: ?string, nodes: list<array{name: string, cpu: string, cpuPercent: int, memory: string, memoryPercent: int}>, pvcCount: int, pvcCapacity: ?string, updatedAt: string}|null
     */
    public function nodeMetrics(string $context): ?array
    {
        $cli = $this->locator->find('kubectl');
        if ($cli === null) {
            return null;
        }

        $key = "cluster-metrics:node:{$context}";

        return Cache::remember($key, self::TTL_SECONDS, function () use ($cli, $context): array {
            $isolated = $this->locator->isolate([$cli, "--context={$context}", 'top', 'nodes', '--no-headers']);

            try {
                $result = Process::env($isolated['environment'])->timeout(10)->run($isolated['command']);
            } catch (ProcessTimedOutException) {
                return $this->emptyNodeMetrics();
            }

            if (! $result->successful()) {
                return $this->emptyNodeMetrics();
            }

            $lines = array_filter(array_map('trim', explode("\n", trim($result->output()))));
            if (empty($lines)) {
                return $this->emptyNodeMetrics();
            }

            $nodes = [];
            $totalCpuPct = 0;
            $totalMemPct = 0;

            foreach ($lines as $line) {
                $parts = preg_split('/\s+/', $line);
                if (! is_array($parts) || count($parts) < 5) {
                    continue;
                }

                $name = $parts[0];
                $cpu = $parts[1];
                $cpuPct = (int) rtrim($parts[2], '%');
                $mem = $parts[3];
                $memPct = (int) rtrim($parts[4], '%');

                $nodes[] = [
                    'name' => $name,
                    'cpu' => $cpu,
                    'cpuPercent' => $cpuPct,
                    'memory' => $mem,
                    'memoryPercent' => $memPct,
                ];

                $totalCpuPct += $cpuPct;
                $totalMemPct += $memPct;
            }

            if (empty($nodes)) {
                return $this->emptyNodeMetrics();
            }

            $nodeCount = count($nodes);
            $avgCpu = (int) round($totalCpuPct / $nodeCount);
            $avgMem = (int) round($totalMemPct / $nodeCount);

            // Best-effort PVC capacity query
            $pvcData = $this->queryPvcSummary($cli, $context);

            return [
                'available' => true,
                'cpuPercent' => $avgCpu,
                'memoryPercent' => $avgMem,
                'cpuUsage' => "{$avgCpu}%",
                'memoryUsage' => "{$avgMem}%",
                'nodes' => $nodes,
                'pvcCount' => $pvcData['count'],
                'pvcCapacity' => $pvcData['capacity'],
                'updatedAt' => now()->toIso8601String(),
            ];
        });
    }

    /**
     * Component pod metrics (CPU and Memory) from `kubectl top pods -n <namespace>`.
     *
     * @return array{available: bool, components: array<string, array{cpu: string, memory: string, podCount: int}>, updatedAt: string}|null
     */
    public function podMetrics(string $context, string $namespace): ?array
    {
        $cli = $this->locator->find('kubectl');
        if ($cli === null) {
            return null;
        }

        $key = "cluster-metrics:pods:{$context}:{$namespace}";

        return Cache::remember($key, self::TTL_SECONDS, function () use ($cli, $context, $namespace): array {
            $isolated = $this->locator->isolate([$cli, "--context={$context}", 'top', 'pods', '-n', $namespace, '--no-headers']);

            try {
                $result = Process::env($isolated['environment'])->timeout(10)->run($isolated['command']);
            } catch (ProcessTimedOutException) {
                return ['available' => false, 'components' => [], 'updatedAt' => now()->toIso8601String()];
            }

            if (! $result->successful()) {
                return ['available' => false, 'components' => [], 'updatedAt' => now()->toIso8601String()];
            }

            $lines = array_filter(array_map('trim', explode("\n", trim($result->output()))));
            $components = [];

            foreach ($lines as $line) {
                $parts = preg_split('/\s+/', $line);
                if (! is_array($parts) || count($parts) < 3) {
                    continue;
                }

                $pod = $parts[0];
                $cpu = $parts[1];
                $mem = $parts[2];

                // Derive component name: remove deployment/replica-set hash suffixes (e.g. "acme-web-5b7bc4bd4f-8p9d4" -> "web")
                $component = $this->extractComponent($pod);

                if (! isset($components[$component])) {
                    $components[$component] = [
                        'cpu' => $cpu,
                        'memory' => $mem,
                        'podCount' => 1,
                    ];
                } else {
                    $components[$component]['podCount']++;
                }
            }

            return [
                'available' => true,
                'components' => $components,
                'updatedAt' => now()->toIso8601String(),
            ];
        });
    }

    /**
     * @return array{count: int, capacity: ?string}
     */
    private function queryPvcSummary(string $cli, string $context): array
    {
        try {
            $isolated = $this->locator->isolate([$cli, "--context={$context}", 'get', 'pvc', '-A', '-o', 'json']);
            $res = Process::env($isolated['environment'])->timeout(5)->run($isolated['command']);

            if (! $res->successful()) {
                return ['count' => 0, 'capacity' => null];
            }

            $json = json_decode($res->output(), true);
            $items = is_array($json['items'] ?? null) ? $json['items'] : [];

            $totalBytes = 0;
            foreach ($items as $item) {
                $storage = $item['spec']['resources']['requests']['storage'] ?? $item['status']['capacity']['storage'] ?? null;
                if (is_string($storage)) {
                    $totalBytes += $this->parseBytes($storage);
                }
            }

            return [
                'count' => count($items),
                'capacity' => $totalBytes > 0 ? $this->formatBytes($totalBytes) : null,
            ];
        } catch (\Throwable) {
            return ['count' => 0, 'capacity' => null];
        }
    }

    private function extractComponent(string $podName): string
    {
        // Strip trailing replica set and pod hash (e.g. -6f789d79b9-d9g2j or -0)
        $clean = preg_replace('/-[0-9a-f]{5,10}-[0-9a-z]{5}$/i', '', $podName);
        $clean = preg_replace('/-\d+$/', '', (string) $clean);

        // Strip project name prefix if present (e.g. "myproject-web" -> "web")
        $parts = explode('-', (string) $clean);
        $last = end($parts);

        return in_array($last, ['web', 'worker', 'reverb', 'scheduler', 'ssr', 'pulse', 'horizon'], true)
            ? $last
            : (string) $clean;
    }

    private function parseBytes(string $str): int
    {
        $str = trim($str);
        if (preg_match('/^(\d+)(Gi|G)$/i', $str, $m)) {
            return (int) $m[1] * 1024 * 1024 * 1024;
        }
        if (preg_match('/^(\d+)(Mi|M)$/i', $str, $m)) {
            return (int) $m[1] * 1024 * 1024;
        }
        if (preg_match('/^(\d+)(Ki|K)$/i', $str, $m)) {
            return (int) $m[1] * 1024;
        }

        return (int) $str;
    }

    private function formatBytes(int $bytes): string
    {
        if ($bytes >= 1024 * 1024 * 1024) {
            return round($bytes / (1024 * 1024 * 1024), 1).' GiB';
        }
        if ($bytes >= 1024 * 1024) {
            return round($bytes / (1024 * 1024), 1).' MiB';
        }

        return round($bytes / 1024, 1).' KiB';
    }

    /**
     * @return array{available: bool, cpuPercent: null, memoryPercent: null, cpuUsage: null, memoryUsage: null, nodes: list<array{name: string, cpu: string, cpuPercent: int, memory: string, memoryPercent: int}>, pvcCount: 0, pvcCapacity: null, updatedAt: string}
     */
    private function emptyNodeMetrics(): array
    {
        return [
            'available' => false,
            'cpuPercent' => null,
            'memoryPercent' => null,
            'cpuUsage' => null,
            'memoryUsage' => null,
            'nodes' => [],
            'pvcCount' => 0,
            'pvcCapacity' => null,
            'updatedAt' => now()->toIso8601String(),
        ];
    }
}
