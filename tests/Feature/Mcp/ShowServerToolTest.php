<?php

use App\Mcp\Servers\LaraKubeDesktopServer;
use App\Mcp\Tools\ShowServerTool;
use App\Services\LaraKube\StackCatalog;
use Illuminate\Support\Facades\Cache;

test('shows detail for one server', function () {
    Cache::put(StackCatalog::CACHE_KEY, [
        ['name' => 'workshop-demo', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'asia-east1', 'ip' => '203.0.113.21', 'context' => 'larakube-203.0.113.21', 'account' => null, 'projectId' => null, 'status' => 'ready'],
    ], 60);

    $response = LaraKubeDesktopServer::tool(ShowServerTool::class, ['name' => 'workshop-demo']);

    $response->assertOk()->assertSee('larakube-203.0.113.21');
});

test('errors cleanly when the server does not exist', function () {
    Cache::put(StackCatalog::CACHE_KEY, [], 60);

    $response = LaraKubeDesktopServer::tool(ShowServerTool::class, ['name' => 'not-a-server']);

    $response->assertHasErrors(['No server found']);
});
