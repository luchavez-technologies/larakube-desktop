<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Server;
use App\Services\LaraKube\ProjectInspector;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class SimulatorController extends Controller
{
    public function __construct(
        private ProjectInspector $inspector,
    ) {}

    public function index(Request $request): Response
    {
        $selectedProjectId = $request->integer('project');

        $projects = Project::query()
            ->orderBy('name')
            ->get()
            ->map(function (Project $project) {
                $inspection = $this->inspector->inspect($project->path);
                $webHost = $inspection['environments']['local']['webHost']
                    ?? $inspection['webHost']
                    ?? ($project->name ? "{$project->name}.dev.test" : null);

                return [
                    'id' => $project->id,
                    'name' => $project->name ?: basename($project->path),
                    'framework' => $project->framework ?? $inspection['framework'] ?? 'laravel',
                    'webHost' => $webHost,
                    'path' => $project->path,
                    'exists' => $project->existsOnHost(),
                    'database' => $inspection['database'] ?? 'pgsql',
                    'cache' => $inspection['cacheDriver'] ?? 'redis',
                ];
            })
            ->values()
            ->all();

        $servers = Server::query()
            ->orderBy('name')
            ->get()
            ->map(fn (Server $server) => [
                'id' => $server->id,
                'name' => $server->name,
                'provider' => $server->provider,
                'role' => $server->role,
                'isLocal' => $server->isLocal(),
            ])
            ->values()
            ->all();

        $presets = [
            [
                'id' => 'laravel-postgres',
                'name' => 'Laravel 12 (FrankenPHP) + PostgreSQL + Redis',
                'framework' => 'laravel',
                'webHost' => 'laravel.dev.test',
                'database' => 'pgsql',
                'databaseName' => 'tenant_laravel_db',
                'cache' => 'redis',
                'description' => 'Standard high-concurrency Laravel Octane/FrankenPHP application with persistent PostgreSQL and Redis caching.',
            ],
            [
                'id' => 'wordpress-sqlite',
                'name' => 'WordPress 6.7 + SQLite Base',
                'framework' => 'wordpress',
                'webHost' => 'blog.dev.test',
                'database' => 'sqlite',
                'databaseName' => 'wordpress.sqlite',
                'cache' => 'none',
                'description' => 'Lightweight cloud-native WordPress workload utilizing local PVC SQLite block storage without standalone DB pod overhead.',
            ],
            [
                'id' => 'pocketbase-sqlite',
                'name' => 'PocketBase (Go) + Realtime SQLite',
                'framework' => 'pocketbase',
                'webHost' => 'pocket.dev.test',
                'database' => 'sqlite',
                'databaseName' => 'data.db',
                'cache' => 'none',
                'description' => 'Embedded real-time backend with WebSocket subscriptions and SQLite storage.',
            ],
        ];

        return Inertia::render('simulator/index', [
            'projects' => $projects,
            'servers' => $servers,
            'presets' => $presets,
            'initialProjectId' => $selectedProjectId ?: null,
        ]);
    }
}
