<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Models\ClusterTool;
use App\Models\Project;
use App\Models\Run;
use App\Models\Server;
use App\Services\EditorLauncher;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ClusterMetrics;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ProjectInspector;
use App\Services\LaraKube\ProjectWorkloadStatus;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Native\Desktop\Facades\Settings;
use Native\Desktop\Facades\Window;

class TrayController extends Controller
{
    public function index(
        Request $request,
        ClusterMetrics $metrics,
        ProjectInspector $inspector,
        ToolLocator $locator,
        GlobalSettings $settings,
        ProjectWorkloadStatus $workloadStatus,
    ): Response {
        return Inertia::render('tray/index', $this->payload($request, $metrics, $inspector, $locator, $settings, $workloadStatus));
    }

    public function data(
        Request $request,
        ClusterMetrics $metrics,
        ProjectInspector $inspector,
        ToolLocator $locator,
        GlobalSettings $settings,
        ProjectWorkloadStatus $workloadStatus,
    ): JsonResponse {
        return response()->json($this->payload($request, $metrics, $inspector, $locator, $settings, $workloadStatus));
    }

    public function openMain(Request $request): JsonResponse
    {
        $path = $request->string('path', '/')->toString();
        $path = str_starts_with($path, '/') ? $path : "/{$path}";

        try {
            Window::open('main')
                ->title(config('app.name'))
                ->width(1180)
                ->height(780)
                ->minWidth(960)
                ->minHeight(640)
                ->rememberState()
                ->url(url($path));
        } catch (\Throwable) {
        }

        return response()->json(['success' => true]);
    }

    public function openSettings(): JsonResponse
    {
        try {
            Window::open('main')
                ->title(config('app.name'))
                ->width(1180)
                ->height(780)
                ->minWidth(960)
                ->minHeight(640)
                ->rememberState()
                ->url(url('/settings'));
        } catch (\Throwable) {
        }

        return response()->json(['success' => true]);
    }

    public function openProject(Project $project): JsonResponse
    {
        try {
            Window::open('main')
                ->title(config('app.name'))
                ->width(1180)
                ->height(780)
                ->minWidth(960)
                ->minHeight(640)
                ->rememberState()
                ->url(url("/projects/{$project->id}"));
        } catch (\Throwable) {
        }

        return response()->json(['success' => true]);
    }

    public function openServer(Server $server): JsonResponse
    {
        try {
            Window::open('main')
                ->title(config('app.name'))
                ->width(1180)
                ->height(780)
                ->minWidth(960)
                ->minHeight(640)
                ->rememberState()
                ->url(url("/servers/{$server->id}"));
        } catch (\Throwable) {
        }

        return response()->json(['success' => true]);
    }

    public function openEditor(Request $request, Project $project, EditorLauncher $editors): JsonResponse
    {
        $editor = (string) $request->input('editor', 'vscode');
        $success = $editors->open($editor, $project->hostPath());

        return response()->json(['success' => $success]);
    }

    public function toggleProject(
        Request $request,
        Project $project,
        CliRunner $runner,
        ProjectInspector $inspector,
        ToolLocator $locator,
        ProjectWorkloadStatus $workloadStatus,
    ): JsonResponse {
        $name = basename($project->path) ?: "Project #{$project->id}";
        $activeRun = Run::query()
            ->where('project_id', $project->id)
            ->where('status', RunStatus::Running)
            ->first();

        if ($activeRun !== null) {
            return response()->json(['success' => false, 'message' => 'Project already has an active task running.'], 422);
        }

        $action = $request->string('action')->toString();
        if (! in_array($action, ['stop', 'start', 'up', 'down'], true)) {
            $inspection = $inspector->inspect($project->path);
            $workloads = $workloadStatus->localWorkloadStatuses($locator);
            $status = $workloadStatus->resolveLocalStatus($project, $inspection, null, $workloads);

            $action = match ($status['state']) {
                'running' => 'stop',
                'paused' => 'start',
                default => 'up',
            };
        }

        [$args, $kind, $label] = match ($action) {
            'stop' => [['stop', 'local'], RunKind::StopProject, "Stop {$name}"],
            'start' => [['start', 'local'], RunKind::StartProject, "Start {$name}"],
            'down' => [['down', 'local', '--force'], RunKind::DownProject, "Down {$name}"],
            default => [['up', 'local', '--fast', '--no-console', '--no-test'], RunKind::UpProject, "Start {$name}"],
        };

        try {
            $run = $runner->start(
                label: $label,
                arguments: $args,
                kind: $kind,
                subject: "project:{$project->id}",
                meta: [
                    'project' => (string) $project->id,
                    'environment' => 'local',
                ],
                targetType: 'project',
                targetName: $name,
                projectId: $project->id,
                projectName: $name,
                environment: 'local',
                cwd: $project->path,
            );

            return response()->json(['success' => true, 'run_id' => $run->id, 'action' => $action]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    public function saveSettings(Request $request): JsonResponse
    {
        $tab = $request->string('tab')->toString();
        if (in_array($tab, ['projects', 'clusters'], true)) {
            rescue(fn () => Settings::set('tray_tab', $tab), report: false);
        }

        if ($request->has('server_id')) {
            $serverId = $request->integer('server_id');
            if ($serverId > 0) {
                rescue(fn () => Settings::set('tray_server_id', (string) $serverId), report: false);
            }
        }

        return response()->json(['success' => true]);
    }

    public function stopAll(CliRunner $runner): JsonResponse
    {
        try {
            $run = $runner->start(
                label: 'Stop All Local Workloads',
                arguments: ['down', '--all'],
                kind: RunKind::DownProject,
                subject: 'fleet',
                targetType: 'fleet',
                targetName: 'All Local Workloads',
                environment: 'local',
            );

            return response()->json(['success' => true, 'run_id' => $run->id]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(
        Request $request,
        ClusterMetrics $metrics,
        ProjectInspector $inspector,
        ToolLocator $locator,
        GlobalSettings $settings,
        ProjectWorkloadStatus $workloadStatus,
    ): array {
        $savedTab = rescue(fn () => (string) Settings::get('tray_tab'), 'projects', report: false);
        $reqTab = $request->string('tab')->toString();
        $activeTab = in_array($reqTab, ['projects', 'clusters'], true)
            ? $reqTab
            : (in_array($savedTab, ['projects', 'clusters'], true) ? $savedTab : 'projects');

        try {
            $servers = Server::active()
                ->where('status', 'ready')
                ->latest('updated_at')
                ->get();

            if ($servers->isEmpty()) {
                $servers = Server::active()->latest('updated_at')->get();
            }
        } catch (\Throwable) {
            $servers = collect();
        }

        $savedServerId = rescue(fn () => (int) Settings::get('tray_server_id'), null, report: false);
        $selectedServerId = $request->integer('server_id');
        if ($selectedServerId <= 0 && $savedServerId) {
            $selectedServerId = $savedServerId;
        }

        $primaryServer = null;
        if ($selectedServerId > 0) {
            $primaryServer = $servers->firstWhere('id', $selectedServerId);
        }
        if (! $primaryServer) {
            $primaryServer = $servers->firstWhere('status', 'ready') ?? $servers->first();
        }

        $nodeMetrics = null;
        if ($primaryServer?->context) {
            try {
                $nodeMetrics = $metrics->nodeMetrics($primaryServer->context);
            } catch (\Throwable) {
            }
        }

        try {
            $allProjects = Project::query()->latest('id')->get();
        } catch (\Throwable) {
            $allProjects = collect();
        }

        $activeProjectRuns = Run::query()
            ->where('status', RunStatus::Running)
            ->whereIn('kind', [
                RunKind::UpProject,
                RunKind::DownProject,
                RunKind::StartProject,
                RunKind::StopProject,
            ])
            ->get()
            ->keyBy(fn (Run $r) => (int) ($r->project_id ?: (str_starts_with((string) $r->subject, 'project:') ? substr((string) $r->subject, 8) : 0)));

        $workloads = $workloadStatus->localWorkloadStatuses($locator);

        $localProjects = $allProjects->map(function (Project $p) use ($inspector, $activeProjectRuns, $workloads, $workloadStatus): array {
            $inspection = $inspector->inspect($p->path);
            $activeRun = $activeProjectRuns->get($p->id);
            $status = $workloadStatus->resolveLocalStatus($p, $inspection, $activeRun, $workloads);
            $appName = $inspection['name'] ?: basename($p->path);
            $webHost = $inspection['environments']['local']['webHost'] ?? $inspection['webHost'] ?? ($status['domain'] ?? null);

            return [
                'id' => $p->id,
                'name' => $appName,
                'path' => $p->path,
                'exists' => $p->existsOnHost(),
                'framework' => $inspection['framework'] ?? $inspection['detectedFramework'] ?? null,
                'webHost' => $webHost,
                'domain' => $status['domain'] ?? null,
                'status' => $status['state'],
                'statusLabel' => $status['label'],
                'statusTone' => $status['tone'],
                'replicas' => $status['replicas'] ?? 0,
                'readyReplicas' => $status['readyReplicas'] ?? 0,
                'activeRun' => $activeRun ? [
                    'id' => $activeRun->id,
                    'label' => $activeRun->label,
                    'kind' => $activeRun->kind?->value,
                    'status' => $activeRun->status->value,
                ] : null,
            ];
        })
            ->sortBy(function (array $p): int {
                return match ($p['status']) {
                    'running' => 0,
                    'starting' => 1,
                    'stopping' => 2,
                    'paused' => 3,
                    'down' => 4,
                    default => 5,
                };
            })
            ->values()
            ->all();

        $hasRunningLocal = collect($localProjects)->some(fn (array $p): bool => $p['status'] === 'running');

        $projects = [];
        if ($primaryServer) {
            $matched = $allProjects->filter(function (Project $p) use ($inspector, $primaryServer): bool {
                $inspection = $inspector->inspect($p->path);
                if (! $inspection['exists'] || ! $inspection['initialized']) {
                    return false;
                }

                if ($primaryServer->isLocal()) {
                    return ($inspection['environments']['local'] ?? null) !== null;
                }

                if ($primaryServer->ip !== null && $inspection['serverIp'] === $primaryServer->ip) {
                    return true;
                }

                if ($primaryServer->context !== null && ($inspection['serverContext'] ?? null) === $primaryServer->context) {
                    return true;
                }

                if (is_array($primaryServer->bindings) && in_array($inspection['name'], $primaryServer->bindings, true)) {
                    return true;
                }

                foreach ($inspection['environments'] as $env) {
                    if ($primaryServer->ip !== null && ($env['serverIp'] ?? null) === $primaryServer->ip) {
                        return true;
                    }
                    if ($primaryServer->context !== null && ($env['serverContext'] ?? null) === $primaryServer->context) {
                        return true;
                    }
                    if (($env['serverName'] ?? null) === $primaryServer->name) {
                        return true;
                    }
                }

                return false;
            });

            $projects = $matched->map(function (Project $p) use ($inspector, $primaryServer): array {
                $inspection = $inspector->inspect($p->path);
                $name = $inspection['name'] ?: basename($p->path);

                $webHost = null;
                if ($primaryServer->isLocal()) {
                    $webHost = $inspection['environments']['local']['webHost'] ?? $inspection['webHost'] ?? null;
                } else {
                    foreach ($inspection['environments'] as $env) {
                        if (
                            ($primaryServer->ip !== null && ($env['serverIp'] ?? null) === $primaryServer->ip) ||
                            ($primaryServer->context !== null && ($env['serverContext'] ?? null) === $primaryServer->context) ||
                            (($env['serverName'] ?? null) === $primaryServer->name)
                        ) {
                            $webHost = $env['webHost'] ?? null;
                            break;
                        }
                    }
                    $webHost ??= $inspection['webHost'] ?? null;
                }

                return [
                    'id' => $p->id,
                    'name' => $name,
                    'path' => $p->path,
                    'webHost' => $webHost,
                    'exists' => $p->existsOnHost(),
                ];
            })->values()->all();
        }

        $tools = [];
        if ($primaryServer) {
            try {
                $tools = ClusterTool::query()
                    ->where('server_id', $primaryServer->id)
                    ->where('installed', true)
                    ->get()
                    ->map(fn (ClusterTool $t): array => [
                        'id' => $t->id,
                        'tool' => $t->tool,
                        'host' => $t->host,
                        'url' => $t->host ? "https://{$t->host}" : null,
                    ])
                    ->all();
            } catch (\Throwable) {
            }
        }

        $plex = null;
        if ($primaryServer) {
            $plexData = $primaryServer->plex_data;
            if ($plexData && is_array($plexData)) {
                $initialized = (bool) ($plexData['initialized'] ?? false);
                $services = $plexData['services'] ?? [];
                $catalog = $plexData['serviceCatalog'] ?? [];

                $plexPodMetrics = null;
                if ($primaryServer->context) {
                    try {
                        $plexPodMetrics = $metrics->podMetrics($primaryServer->context, 'larakube-plex');
                    } catch (\Throwable) {
                    }
                }
                $runningPods = ($plexPodMetrics && ! empty($plexPodMetrics['available']))
                    ? $plexPodMetrics['components']
                    : null;

                $tenants = [];
                if (isset($plexData['tenants']) && is_array($plexData['tenants'])) {
                    foreach (['tool', 'project', 'custom'] as $group) {
                        if (! empty($plexData['tenants'][$group]) && is_array($plexData['tenants'][$group])) {
                            foreach ($plexData['tenants'][$group] as $t) {
                                if (is_array($t)) {
                                    $tenants[] = $t;
                                }
                            }
                        }
                    }
                }

                $brandNames = [
                    'postgresql' => 'PostgreSQL',
                    'postgres' => 'PostgreSQL',
                    'mysql' => 'MySQL',
                    'mariadb' => 'MariaDB',
                    'redis' => 'Redis',
                    'valkey' => 'Valkey',
                    'minio' => 'MinIO',
                    'seaweedfs' => 'SeaweedFS',
                    'garage' => 'Garage',
                    'meilisearch' => 'Meilisearch',
                    'typesense' => 'Typesense',
                    'headless-shell' => 'Headless Chrome',
                    'chrome' => 'Headless Chrome',
                    'stalwart' => 'Stalwart',
                ];

                $activeEngines = [];
                $allHealthy = true;

                foreach ($services as $slot => $val) {
                    $driver = is_array($val) ? ($val['service'] ?? $val['driver'] ?? $slot) : $val;
                    if (! $driver) {
                        continue;
                    }

                    $driverNormalized = strtolower((string) $driver);

                    // 1. If service configuration explicitly defines enabled, respect it
                    if (is_array($val) && array_key_exists('enabled', $val) && ! (bool) $val['enabled']) {
                        continue;
                    }

                    // 2. Look up matching option from serviceCatalog (handles postgresql/postgres aliases)
                    $matchedCatalogOption = $this->matchCatalogOption($catalog, $driverNormalized);

                    // If catalog has this driver option and it is disabled, skip it
                    if ($matchedCatalogOption !== null && array_key_exists('enabled', $matchedCatalogOption) && ! (bool) $matchedCatalogOption['enabled']) {
                        continue;
                    }

                    $name = $brandNames[$driverNormalized] ?? ucfirst($driverNormalized);

                    $isReady = true;
                    $statusText = 'Healthy';

                    if ($matchedCatalogOption !== null && isset($matchedCatalogOption['ready']) && ! $matchedCatalogOption['ready']) {
                        $isReady = false;
                        $statusText = 'Degraded';
                    }

                    $podKey = match ($driverNormalized) {
                        'postgres', 'postgresql' => 'postgresql',
                        'redis', 'valkey' => isset($runningPods['valkey']) ? 'valkey' : 'redis',
                        'chrome', 'headless-shell' => 'headless-shell',
                        default => $driverNormalized,
                    };

                    if ($runningPods !== null) {
                        if (isset($runningPods[$podKey])) {
                            $isReady = true;
                            $statusText = 'Ready';
                        } elseif (! empty($runningPods)) {
                            $isReady = false;
                            $statusText = 'Unhealthy';
                        }
                    }

                    if (! $isReady) {
                        $allHealthy = false;
                    }

                    $spec = $this->engineSpec($driverNormalized);
                    $compMetrics = null;
                    if ($runningPods !== null) {
                        $compMetrics = $runningPods[$podKey]
                            ?? $runningPods[$driverNormalized]
                            ?? null;
                    }

                    $usedMem = $this->parseMemoryToMiB($compMetrics['memory'] ?? null);
                    $ramPercent = $usedMem !== null
                        ? (int) min(100, max(0, round(($usedMem / $spec['memoryLimitMiB']) * 100)))
                        : null;

                    $usedCpu = $this->parseCpuToMilli($compMetrics['cpu'] ?? null);
                    $cpuPercent = $usedCpu !== null
                        ? (int) min(100, max(0, round(($usedCpu / $spec['cpuLimitMilli']) * 100)))
                        : null;

                    $usedCap = match (true) {
                        str_contains($driverNormalized, 'postgres') || str_contains($driverNormalized, 'mysql') || str_contains($driverNormalized, 'mariadb') => count(array_filter($tenants, fn (array $t): bool => ! empty($t['database']) && (! isset($t['databaseService']) || empty($t['databaseService']) || $t['databaseService'] === $driverNormalized))),
                        str_contains($driverNormalized, 'redis') || str_contains($driverNormalized, 'valkey') => count(array_filter($tenants, fn (array $t): bool => isset($t['redisIndex']))),
                        str_contains($driverNormalized, 'seaweed') || str_contains($driverNormalized, 'minio') || str_contains($driverNormalized, 'garage') => count(array_filter($tenants, fn (array $t): bool => ! empty($t['s3Bucket']))),
                        str_contains($driverNormalized, 'chrome') || str_contains($driverNormalized, 'headless') => 1,
                        default => 1,
                    };
                    $capPercent = (int) min(100, max(0, round(($usedCap / $spec['maxCapacity']) * 100)));

                    $activeEngines[] = [
                        'slot' => (string) $slot,
                        'driver' => $driverNormalized,
                        'name' => $name,
                        'status' => $isReady ? 'healthy' : 'degraded',
                        'statusText' => $statusText,
                        'telemetry' => [
                            'ramPercent' => $ramPercent,
                            'cpuPercent' => $cpuPercent,
                            'capacityPercent' => $capPercent,
                            'ramUsage' => $usedMem !== null ? round($usedMem).'MiB' : null,
                            'ramLimit' => $spec['memoryLimitMiB'].'MiB',
                            'cpuUsage' => $usedCpu !== null ? round($usedCpu).'m' : null,
                            'cpuLimit' => $spec['cpuLimitMilli'].'m',
                            'capacityUsage' => $usedCap,
                            'capacityLimit' => $spec['maxCapacity'],
                            'capacityLabel' => $spec['capacityLabel'],
                            'capacityUnit' => $spec['capacityUnit'],
                        ],
                    ];
                }

                $plex = [
                    'initialized' => $initialized,
                    'status' => $allHealthy ? 'healthy' : 'degraded',
                    'statusText' => $allHealthy ? 'All Engines Healthy' : 'Degraded',
                    'engines' => $activeEngines,
                ];
            }
        }

        try {
            $activeRun = Run::query()
                ->where('status', RunStatus::Running)
                ->latest('id')
                ->first();
        } catch (\Throwable) {
            $activeRun = null;
        }

        return [
            'activeTab' => $activeTab,
            'servers' => $servers->map(fn (Server $s): array => [
                'id' => $s->id,
                'name' => $s->name,
                'role' => $s->role,
                'provider' => $s->provider,
                'status' => $s->status,
                'context' => $s->context,
                'isPrimary' => $primaryServer?->id === $s->id,
                'isLocal' => $s->isLocal(),
            ])->all(),
            'selectedServerId' => $primaryServer?->id,
            'metrics' => $nodeMetrics ? [
                'cpuPercent' => $nodeMetrics['cpuPercent'] ?? null,
                'memoryPercent' => $nodeMetrics['memoryPercent'] ?? null,
                'cpuUsage' => $nodeMetrics['cpuUsage'] ?? null,
                'memoryUsage' => $nodeMetrics['memoryUsage'] ?? null,
            ] : null,
            'projects' => $projects,
            'localProjects' => $localProjects,
            'hasRunningLocal' => $hasRunningLocal,
            'tools' => $tools,
            'plex' => $plex,
            'activeRun' => $activeRun ? [
                'id' => $activeRun->id,
                'label' => $activeRun->label,
                'kind' => $activeRun->kind?->value,
                'status' => $activeRun->status->value,
            ] : null,
            'windows' => $locator->isWindows(),
        ];
    }

    /**
     * @return array{memoryLimitMiB: int, cpuLimitMilli: int, maxCapacity: int, capacityLabel: string, capacityUnit: string}
     */
    private function engineSpec(string $driver): array
    {
        $d = strtolower($driver);
        if (str_contains($d, 'redis') || str_contains($d, 'valkey')) {
            return [
                'memoryLimitMiB' => 256,
                'cpuLimitMilli' => 250,
                'maxCapacity' => 16,
                'capacityLabel' => 'DB Slots',
                'capacityUnit' => 'slots',
            ];
        }
        if (str_contains($d, 'postgres') || str_contains($d, 'mysql') || str_contains($d, 'mariadb')) {
            return [
                'memoryLimitMiB' => 512,
                'cpuLimitMilli' => 500,
                'maxCapacity' => 100,
                'capacityLabel' => 'Connections',
                'capacityUnit' => 'conn',
            ];
        }
        if (str_contains($d, 'meili') || str_contains($d, 'typesense')) {
            return [
                'memoryLimitMiB' => 512,
                'cpuLimitMilli' => 500,
                'maxCapacity' => 50,
                'capacityLabel' => 'Indices',
                'capacityUnit' => 'idx',
            ];
        }
        if (str_contains($d, 'seaweed') || str_contains($d, 'minio') || str_contains($d, 'garage')) {
            return [
                'memoryLimitMiB' => 512,
                'cpuLimitMilli' => 500,
                'maxCapacity' => 100,
                'capacityLabel' => 'S3 Buckets',
                'capacityUnit' => 'buckets',
            ];
        }
        if (str_contains($d, 'chrome') || str_contains($d, 'render') || str_contains($d, 'headless')) {
            return [
                'memoryLimitMiB' => 512,
                'cpuLimitMilli' => 500,
                'maxCapacity' => 5,
                'capacityLabel' => 'Workers',
                'capacityUnit' => 'workers',
            ];
        }

        return [
            'memoryLimitMiB' => 512,
            'cpuLimitMilli' => 500,
            'maxCapacity' => 50,
            'capacityLabel' => 'Capacity',
            'capacityUnit' => 'slots',
        ];
    }

    private function parseMemoryToMiB(?string $str): ?float
    {
        if (! $str) {
            return null;
        }
        $clean = strtolower(trim($str));
        if (str_ends_with($clean, 'gi')) {
            return (float) rtrim($clean, 'gi') * 1024;
        }
        if (str_ends_with($clean, 'mi')) {
            return (float) rtrim($clean, 'mi');
        }
        if (str_ends_with($clean, 'ki')) {
            return (float) rtrim($clean, 'ki') / 1024;
        }

        return is_numeric($clean) ? (float) $clean : null;
    }

    private function parseCpuToMilli(?string $str): ?float
    {
        if (! $str) {
            return null;
        }
        $clean = strtolower(trim($str));
        if (str_ends_with($clean, 'm')) {
            return (float) rtrim($clean, 'm');
        }

        return is_numeric($clean) ? (float) $clean * 1000 : null;
    }

    /**
     * @param  array<string, mixed>  $catalog
     * @return array<string, mixed>|null
     */
    private function matchCatalogOption(array $catalog, string $driver): ?array
    {
        $d = strtolower($driver);
        $keys = match ($d) {
            'postgres', 'postgresql' => ['postgresql', 'postgres'],
            'redis', 'valkey' => ['redis', 'valkey'],
            'chrome', 'headless-shell', 'render' => ['headless-shell', 'chrome'],
            default => [$d],
        };

        foreach ($catalog as $cat) {
            if (! is_array($cat) || ! isset($cat['options']) || ! is_array($cat['options'])) {
                continue;
            }
            foreach ($keys as $k) {
                if (isset($cat['options'][$k]) && is_array($cat['options'][$k])) {
                    return $cat['options'][$k];
                }
            }
        }

        return null;
    }
}
