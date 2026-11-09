<?php

use App\Mcp\Servers\LaraKubeDesktopServer;
use App\Mcp\Tools\ShowProjectTool;
use App\Models\Project;
use Illuminate\Support\Facades\File;

test('shows architectural detail for one project', function () {
    $path = storage_path('framework/testing/project-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($path);
    file_put_contents("{$path}/.larakube.json", json_encode(['name' => 'shop', 'framework' => 'vite']));

    $project = Project::create(['path' => $path, 'name' => 'shop', 'framework' => 'vite', 'environment' => 'local']);

    $response = LaraKubeDesktopServer::tool(ShowProjectTool::class, ['project_id' => $project->id, 'environment' => 'local']);

    $response->assertOk()->assertSee('shop');

    File::deleteDirectory($path);
});

test('errors cleanly when the project does not exist', function () {
    $response = LaraKubeDesktopServer::tool(ShowProjectTool::class, ['project_id' => 999999]);

    $response->assertHasErrors(['No project found']);
});
