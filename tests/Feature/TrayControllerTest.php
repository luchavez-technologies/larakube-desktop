<?php

use App\Models\ClusterTool;
use App\Models\Project;
use App\Models\Server;
use App\Services\LaraKube\ToolLocator;
use Native\Desktop\Facades\ChildProcess;

beforeEach(function () {
    ChildProcess::fake();
    $this->tempHome = storage_path('framework/testing/home-tray-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($this->tempHome);
    $_SERVER['HOME'] = realpath($this->tempHome);
    putenv('HOME='.realpath($this->tempHome));

    $this->fakeBinDir = storage_path('framework/testing/bin-tray-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($this->fakeBinDir);
    File::put("{$this->fakeBinDir}/larakube", "#!/bin/sh\nexit 0\n");
    chmod("{$this->fakeBinDir}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$this->fakeBinDir]));
});

afterEach(function () {
    if (isset($this->tempHome) && File::isDirectory($this->tempHome)) {
        File::deleteDirectory($this->tempHome);
    }
    if (isset($this->fakeBinDir) && File::isDirectory($this->fakeBinDir)) {
        File::deleteDirectory($this->fakeBinDir);
    }
});

test('get /tray renders inertia page with telemetry data', function () {
    $server = Server::create([
        'name' => 'local-cluster',
        'role' => 'cluster',
        'provider' => 'doks',
        'kind' => 'kubernetes',
        'status' => 'ready',
        'sync_status' => 'synced',
        'domains_sync_status' => 'synced',
        'port' => 22,
    ]);

    $project = Project::create([
        'path' => $this->tempHome.'/projects/my-app',
    ]);
    File::ensureDirectoryExists($this->tempHome.'/projects/my-app');

    $this->get(route('tray.index'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('tray/index')
            ->has('servers')
            ->has('projects')
            ->has('tools')
        );
});

test('get /tray/data returns json structure for periodic polling', function () {
    $server = Server::create([
        'name' => 'local-cluster',
        'role' => 'cluster',
        'provider' => 'doks',
        'kind' => 'kubernetes',
        'status' => 'ready',
        'sync_status' => 'synced',
        'domains_sync_status' => 'synced',
        'port' => 22,
    ]);

    ClusterTool::create([
        'server_id' => $server->id,
        'tool' => 'traefik',
        'host' => 'traefik.dev.test',
        'installed' => true,
        'multi_instance' => false,
        'position' => 1,
        'data' => [],
        'sync_status' => 'synced',
    ]);

    $response = $this->getJson(route('tray.data'));

    $response->assertOk()
        ->assertJsonStructure([
            'servers',
            'projects',
            'tools',
            'windows',
            'selectedServerId',
        ]);
});

test('get /tray/data with server_id filters tools and context for selected server', function () {
    $server1 = Server::create([
        'name' => 'server-one',
        'role' => 'cluster',
        'provider' => 'doks',
        'kind' => 'kubernetes',
        'status' => 'ready',
        'sync_status' => 'synced',
        'domains_sync_status' => 'synced',
        'port' => 22,
    ]);

    $server2 = Server::create([
        'name' => 'server-two',
        'role' => 'cluster',
        'provider' => 'vps',
        'kind' => 'kubernetes',
        'status' => 'ready',
        'sync_status' => 'synced',
        'domains_sync_status' => 'synced',
        'port' => 22,
    ]);

    ClusterTool::create([
        'server_id' => $server2->id,
        'tool' => 'openbao',
        'host' => 'openbao.dev.test',
        'installed' => true,
        'multi_instance' => false,
        'position' => 1,
        'data' => [],
        'sync_status' => 'synced',
    ]);

    $response = $this->getJson(route('tray.data', ['server_id' => $server2->id]));

    $response->assertOk()
        ->assertJson([
            'selectedServerId' => $server2->id,
        ])
        ->assertJsonCount(1, 'tools')
        ->assertJsonPath('tools.0.tool', 'openbao');
});

test('get /tray/data includes active plex commons engines and filters projects for server', function () {
    $server = Server::create([
        'name' => 'plex-server',
        'role' => 'cluster',
        'provider' => 'vps',
        'kind' => 'kubernetes',
        'status' => 'ready',
        'sync_status' => 'synced',
        'domains_sync_status' => 'synced',
        'port' => 22,
        'context' => 'k3s-plex-server',
        'plex_data' => [
            'initialized' => true,
            'services' => [
                'db' => 'postgresql',
                'redis' => 'valkey',
                's3' => 'minio',
            ],
            'tenants' => [
                'project' => [['name' => 'demo-app']],
            ],
        ],
    ]);

    $response = $this->getJson(route('tray.data', ['server_id' => $server->id]));

    $response->assertOk()
        ->assertJsonPath('plex.initialized', true)
        ->assertJsonPath('plex.status', 'healthy')
        ->assertJsonCount(3, 'plex.engines')
        ->assertJsonPath('plex.engines.0.status', 'healthy');
});

test('post /tray/open-main returns success json and accepts optional path', function () {
    $this->postJson(route('tray.open-main'), ['path' => '/projects'])
        ->assertOk()
        ->assertJson(['success' => true]);
});

test('post /tray/open-settings opens settings in main window', function () {
    $this->postJson(route('tray.open-settings'))
        ->assertOk()
        ->assertJson(['success' => true]);
});

test('post /tray/open-project/{id} returns success json', function () {
    $project = Project::create([
        'path' => $this->tempHome.'/projects/demo-app',
    ]);

    $this->postJson(route('tray.open-project', $project))
        ->assertOk()
        ->assertJson(['success' => true]);
});

test('post /tray/open-server/{id} returns success json', function () {
    $server = Server::create([
        'name' => 'test-server',
        'role' => 'cluster',
        'provider' => 'doks',
        'kind' => 'kubernetes',
        'status' => 'ready',
        'sync_status' => 'synced',
        'domains_sync_status' => 'synced',
        'port' => 22,
    ]);

    $this->postJson(route('tray.open-server', $server))
        ->assertOk()
        ->assertJson(['success' => true]);
});

test('post /tray/stop-all starts down run and returns success', function () {
    $this->postJson(route('tray.stop-all'))
        ->assertOk()
        ->assertJson([
            'success' => true,
        ]);
});

test('post /tray/projects/{project}/toggle starts up run and returns success', function () {
    $project = Project::create([
        'path' => $this->tempHome.'/projects/demo-app',
    ]);

    $this->postJson(route('tray.project.toggle', $project))
        ->assertOk()
        ->assertJson([
            'success' => true,
        ]);
});

test('post /tray/open-editor/{id} opens project in requested editor', function () {
    $project = Project::create([
        'path' => $this->tempHome.'/projects/demo-app',
    ]);

    $this->postJson(route('tray.open-editor', $project), ['editor' => 'vscode'])
        ->assertOk()
        ->assertJsonStructure(['success']);
});

test('get /tray/data includes engine telemetry in plex engines', function () {
    $server = Server::create([
        'name' => 'plex-cluster',
        'role' => 'cluster',
        'provider' => 'doks',
        'kind' => 'kubernetes',
        'status' => 'ready',
        'sync_status' => 'synced',
        'domains_sync_status' => 'synced',
        'port' => 22,
        'plex_data' => [
            'initialized' => true,
            'services' => [
                'database' => 'postgres',
                'cache' => 'redis',
            ],
            'serviceCatalog' => [
                [
                    'key' => 'database',
                    'label' => 'Database',
                    'options' => [
                        'postgres' => ['ready' => true],
                    ],
                ],
                [
                    'key' => 'cache',
                    'label' => 'Cache',
                    'options' => [
                        'redis' => ['ready' => true],
                    ],
                ],
            ],
            'tenants' => [
                'project' => [
                    ['name' => 'app-one', 'database' => 'app_one', 'redisIndex' => 1],
                    ['name' => 'app-two', 'database' => 'app_two', 'redisIndex' => 2],
                ],
            ],
        ],
    ]);

    $response = $this->getJson(route('tray.data'));

    $response->assertOk()
        ->assertJsonPath('plex.initialized', true)
        ->assertJsonStructure([
            'plex' => [
                'engines' => [
                    '*' => [
                        'slot',
                        'driver',
                        'name',
                        'status',
                        'statusText',
                        'telemetry' => [
                            'ramPercent',
                            'cpuPercent',
                            'capacityPercent',
                            'ramLimit',
                            'cpuLimit',
                            'capacityUsage',
                            'capacityLimit',
                            'capacityLabel',
                            'capacityUnit',
                        ],
                    ],
                ],
            ],
        ]);
});

test('get /tray/data filters out inactive or disabled plex commons', function () {
    $server = Server::create([
        'name' => 'plex-cluster-with-disabled',
        'role' => 'cluster',
        'provider' => 'doks',
        'kind' => 'kubernetes',
        'status' => 'ready',
        'sync_status' => 'synced',
        'domains_sync_status' => 'synced',
        'port' => 22,
        'plex_data' => [
            'initialized' => true,
            'services' => [
                'postgresql' => ['enabled' => true, 'port' => 5432],
                'mysql' => ['enabled' => false, 'port' => 3306],
                'mariadb' => ['enabled' => false, 'port' => 3306],
                'redis' => ['enabled' => true, 'port' => 6379],
                'seaweedfs' => ['enabled' => true, 'port' => 8333],
                'minio' => ['enabled' => false, 'port' => 9000],
                'garage' => ['enabled' => false, 'port' => 3900],
                'meilisearch' => ['enabled' => false, 'port' => 7700],
            ],
            'serviceCatalog' => [
                [
                    'key' => 'database',
                    'active' => 'postgresql',
                    'options' => [
                        'postgresql' => ['enabled' => true, 'ready' => true],
                        'mysql' => ['enabled' => false, 'ready' => false],
                        'mariadb' => ['enabled' => false, 'ready' => false],
                    ],
                ],
                [
                    'key' => 'cache',
                    'active' => 'redis',
                    'options' => [
                        'redis' => ['enabled' => true, 'ready' => true],
                    ],
                ],
                [
                    'key' => 'storage',
                    'active' => 'seaweedfs',
                    'options' => [
                        'seaweedfs' => ['enabled' => true, 'ready' => true],
                        'minio' => ['enabled' => false, 'ready' => false],
                        'garage' => ['enabled' => false, 'ready' => false],
                    ],
                ],
            ],
            'tenants' => [
                'project' => [
                    ['name' => 'app-one', 'database' => 'app_one', 'redisIndex' => 1],
                ],
            ],
        ],
    ]);

    $response = $this->getJson(route('tray.data', ['server_id' => $server->id]));

    $response->assertOk();
    $engines = $response->json('plex.engines');
    $drivers = array_column($engines, 'driver');

    expect($drivers)->toContain('postgresql', 'redis', 'seaweedfs')
        ->and($drivers)->not->toContain('mysql', 'mariadb', 'minio', 'garage', 'meilisearch');
});
