<?php

namespace App\Services\LaraKube;

use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Process;
use Throwable;

class ProjectPods
{
    public const COMPONENT_LABELS = [
        'web' => 'Web Server',
        'node' => 'Vite / Asset Server',
        'horizon' => 'Horizon Queue',
        'queue' => 'Queue Worker',
        'queues' => 'Queue Worker',
        'reverb' => 'Reverb WebSocket',
        'scheduler' => 'Task Scheduler',
        'ssr' => 'SSR Runtime',
        'postgres' => 'PostgreSQL Database',
        'mysql' => 'MySQL Database',
        'mariadb' => 'MariaDB Database',
        'redis' => 'Redis Cache',
    ];

    public function __construct(private ToolLocator $locator) {}

    /**
     * @return list<array{
     *     name: string,
     *     component: string,
     *     componentLabel: string,
     *     phase: string,
     *     statusText: string,
     *     statusTone: 'ok'|'bad'|'warn'|'muted',
     *     ready: string,
     *     restarts: int,
     *     age: string,
     *     containers: list<string>
     * }>
     */
    public function pods(string $context, string $namespace, bool $fresh = false): array
    {
        $cli = $this->locator->find('kubectl');
        if ($cli === null) {
            return [];
        }

        $key = "project-pods:{$context}:{$namespace}";
        if ($fresh) {
            Cache::forget($key);
        }

        return Cache::remember($key, 5, function () use ($cli, $context, $namespace): array {
            try {
                $isolated = $this->locator->isolate([$cli, "--context={$context}", 'get', 'pods', '-n', $namespace, '-o', 'json']);
                $result = Process::env($isolated['environment'])->timeout(5)->run($isolated['command']);

                if (! $result->successful()) {
                    return [];
                }

                $data = json_decode($result->output(), true);
                $items = $data['items'] ?? [];
                if (! is_array($items)) {
                    return [];
                }

                $pods = [];
                foreach ($items as $item) {
                    $metadata = $item['metadata'] ?? [];
                    $status = $item['status'] ?? [];
                    $name = (string) ($metadata['name'] ?? '');
                    if ($name === '') {
                        continue;
                    }

                    $component = $this->resolveComponent($item);
                    $componentLabel = self::COMPONENT_LABELS[$component] ?? ucfirst($component);

                    $containerStatuses = $status['containerStatuses'] ?? [];
                    $totalContainers = count($item['spec']['containers'] ?? []);
                    $readyContainers = 0;
                    $restarts = 0;
                    $waitingReason = null;
                    $terminatedReason = null;
                    $containerNames = [];

                    foreach ($containerStatuses as $c) {
                        $containerNames[] = (string) ($c['name'] ?? '');
                        if (! empty($c['ready'])) {
                            $readyContainers++;
                        }
                        $restarts += (int) ($c['restartCount'] ?? 0);

                        if (isset($c['state']['waiting']['reason'])) {
                            $waitingReason = (string) $c['state']['waiting']['reason'];
                        } elseif (isset($c['state']['terminated']['reason'])) {
                            $terminatedReason = (string) $c['state']['terminated']['reason'];
                        }
                    }

                    $phase = (string) ($status['phase'] ?? 'Unknown');

                    $statusText = $waitingReason ?? $terminatedReason ?? $phase;
                    $statusTone = match (true) {
                        in_array($statusText, ['CrashLoopBackOff', 'OOMKilled', 'Error', 'Failed', 'ImagePullBackOff'], true) => 'bad',
                        in_array($statusText, ['ContainerCreating', 'Pending', 'PodInitializing'], true) => 'warn',
                        $statusText === 'Running' && $readyContainers === $totalContainers => 'ok',
                        $statusText === 'Completed' || $statusText === 'Succeeded' => 'muted',
                        default => 'warn',
                    };

                    $ready = "{$readyContainers}/".max(1, $totalContainers);
                    $age = $this->formatAge($metadata['creationTimestamp'] ?? null);

                    $pods[] = [
                        'name' => $name,
                        'component' => $component,
                        'componentLabel' => $componentLabel,
                        'phase' => $phase,
                        'statusText' => $statusText,
                        'statusTone' => $statusTone,
                        'ready' => $ready,
                        'restarts' => $restarts,
                        'age' => $age,
                        'containers' => array_values(array_filter($containerNames)),
                    ];
                }

                // Sort by component, then pod name
                usort($pods, fn ($a, $b) => strcmp($a['component'], $b['component']) ?: strcmp($a['name'], $b['name']));

                return $pods;
            } catch (Throwable) {
                return [];
            }
        });
    }

    public function logs(string $context, string $namespace, string $pod, ?string $container = null, int $tail = 200): string
    {
        $cli = $this->locator->find('kubectl');
        if ($cli === null) {
            return 'kubectl not found';
        }

        $cmd = [$cli, "--context={$context}", 'logs', '-n', $namespace, $pod, "--tail={$tail}"];
        if ($container !== null && $container !== '') {
            $cmd[] = "-c={$container}";
        }

        try {
            $isolated = $this->locator->isolate($cmd);
            $result = Process::env($isolated['environment'])->timeout(10)->run($isolated['command']);

            return $result->successful() ? $result->output() : $result->errorOutput();
        } catch (Throwable $e) {
            return "Failed to fetch pod logs: {$e->getMessage()}";
        }
    }

    public function restartPod(string $context, string $namespace, string $pod): bool
    {
        $cli = $this->locator->find('kubectl');
        if ($cli === null) {
            return false;
        }

        try {
            $isolated = $this->locator->isolate([$cli, "--context={$context}", 'delete', 'pod', $pod, '-n', $namespace]);
            $result = Process::env($isolated['environment'])->timeout(10)->run($isolated['command']);

            Cache::forget("project-pods:{$context}:{$namespace}");

            return $result->successful();
        } catch (Throwable) {
            return false;
        }
    }

    /**
     * @param  array<string, mixed>  $item
     */
    private function resolveComponent(array $item): string
    {
        $labels = $item['metadata']['labels'] ?? [];
        if (! empty($labels['app'])) {
            return (string) $labels['app'];
        }
        if (! empty($labels['app.kubernetes.io/component'])) {
            return (string) $labels['app.kubernetes.io/component'];
        }

        $name = (string) ($item['metadata']['name'] ?? '');
        if (preg_match('/^(?:[a-z0-9-]+-)?(web|node|queue|queues|horizon|reverb|scheduler|ssr|postgres|mysql|mariadb|redis)(?:-[a-z0-9]+)*$/', $name, $m)) {
            return $m[1];
        }

        return 'app';
    }

    private function formatAge(?string $timestamp): string
    {
        if (! $timestamp) {
            return '';
        }

        try {
            $created = Carbon::parse($timestamp);
            $diffSeconds = abs((int) $created->diffInSeconds(now()));

            if ($diffSeconds < 60) {
                return "{$diffSeconds}s";
            }
            $diffMinutes = intdiv($diffSeconds, 60);
            if ($diffMinutes < 60) {
                return "{$diffMinutes}m";
            }
            $diffHours = intdiv($diffMinutes, 60);
            if ($diffHours < 24) {
                return "{$diffHours}h";
            }
            $diffDays = intdiv($diffHours, 24);

            return "{$diffDays}d";
        } catch (Throwable) {
            return '';
        }
    }
}
