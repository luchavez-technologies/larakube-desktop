<?php

use App\Mcp\Resources\ProjectBlueprintResource;
use App\Mcp\Resources\ProjectListResource;
use App\Mcp\Resources\ServerDetailResource;
use App\Mcp\Resources\ServerListResource;
use App\Mcp\Servers\LaraKubeDesktopServer;
use App\Models\Project;
use App\Models\Server;
use App\Services\LaraKube\ProjectInspector;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolCatalog;

test('resources list registers static resources', function (): void {
    $resources = LaraKubeDesktopServer::resources();

    $resources->assertRegistered([
        ServerListResource::class,
        ProjectListResource::class,
    ]);
});

test('server list resource returns registered servers', function (): void {
    $mockCatalog = Mockery::mock(StackCatalog::class);
    $mockCatalog->shouldReceive('all')->andReturn([
        ['name' => 'mock-cluster', 'status' => 'ready', 'provider' => 'gcp'],
    ]);
    app()->instance(StackCatalog::class, $mockCatalog);

    $response = LaraKubeDesktopServer::resource(ServerListResource::class);

    $response->assertOk()
        ->assertSee('mock-cluster')
        ->assertSee('gcp');
});

test('project list resource returns registered projects', function (): void {
    $project = Project::create([
        'path' => '/code/my-app',
        'name' => 'my-app',
        'framework' => 'laravel',
        'environment' => 'production',
        'web_host' => 'my-app.dev.test',
    ]);

    $response = LaraKubeDesktopServer::resource(ProjectListResource::class);

    $response->assertOk()
        ->assertSee('my-app')
        ->assertSee('my-app.dev.test');
});

test('server detail resource returns server status and companion tools', function (): void {
    $mockCatalog = Mockery::mock(StackCatalog::class);
    $mockCatalog->shouldReceive('find')->with('demo-server')->andReturn([
        'name' => 'demo-server',
        'status' => 'ready',
        'provider' => 'gcp',
        'context' => 'demo-ctx',
    ]);
    app()->instance(StackCatalog::class, $mockCatalog);

    $mockToolCatalog = Mockery::mock(ToolCatalog::class);
    $mockToolCatalog->shouldReceive('forContext')->with('demo-ctx')->andReturn([
        ['name' => 'n8n', 'status' => 'installed'],
    ]);
    app()->instance(ToolCatalog::class, $mockToolCatalog);

    $response = LaraKubeDesktopServer::resource(ServerDetailResource::class, [
        'name' => 'demo-server',
    ]);

    $response->assertOk()
        ->assertSee('demo-server')
        ->assertSee('demo-ctx')
        ->assertSee('n8n');
});

test('project blueprint resource returns project and inspection result', function (): void {
    $project = Project::create([
        'path' => '/code/inspected-app',
        'name' => 'inspected-app',
        'framework' => 'laravel',
        'environment' => 'production',
    ]);

    $mockInspector = Mockery::mock(ProjectInspector::class);
    $mockInspector->shouldReceive('inspect')->with('/code/inspected-app', 'production')->andReturn([
        'framework' => 'laravel',
        'php_version' => '8.3',
        'database' => 'mysql',
    ]);
    app()->instance(ProjectInspector::class, $mockInspector);

    $response = LaraKubeDesktopServer::resource(ProjectBlueprintResource::class, [
        'id' => $project->id,
    ]);

    $response->assertOk()
        ->assertSee('inspected-app')
        ->assertSee('mysql')
        ->assertSee('8.3');
});

test('resources support uri template variable completions', function (): void {
    Server::updateOrCreate(
        ['name' => 'res-server-alpha'],
        ['ip' => '10.0.0.2', 'context' => 'alpha-ctx', 'provider' => 'gcp', 'kind' => 'vps', 'status' => 'ready']
    );

    $project = Project::create([
        'path' => '/code/res-project',
        'name' => 'res-project',
        'framework' => 'laravel',
        'environment' => 'production',
    ]);

    $serverComp = LaraKubeDesktopServer::completion(ServerDetailResource::class, 'name', 'res-');
    $serverComp->assertOk()
        ->assertHasCompletions(['res-server-alpha']);

    $projComp = LaraKubeDesktopServer::completion(ProjectBlueprintResource::class, 'id', (string) $project->id);
    $projComp->assertOk()
        ->assertHasCompletions([(string) $project->id]);
});
