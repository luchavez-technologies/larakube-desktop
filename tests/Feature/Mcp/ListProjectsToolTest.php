<?php

use App\Mcp\Servers\LaraKubeDesktopServer;
use App\Mcp\Tools\ListProjectsTool;
use App\Models\Project;

test('lists every registered project', function () {
    $project = Project::create(['path' => '/code/shop', 'name' => 'shop', 'framework' => 'laravel', 'environment' => 'local']);

    $response = LaraKubeDesktopServer::tool(ListProjectsTool::class, []);

    $response->assertOk()->assertSee($project->name);
});

test('returns an empty list when no projects are registered', function () {
    $response = LaraKubeDesktopServer::tool(ListProjectsTool::class, []);

    $response->assertOk()->assertSee('[]');
});
