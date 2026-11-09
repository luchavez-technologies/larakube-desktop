<?php

use App\Mcp\Servers\LaraKubeDesktopServer;
use App\Mcp\Tools\ListServersTool;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\Cache;

test('lists every known server/stack', function () {
    Cache::put(StackCatalog::CACHE_KEY, [
        ['name' => 'workshop-demo', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'asia-east1', 'ip' => '203.0.113.21', 'context' => 'larakube-203.0.113.21', 'account' => null, 'projectId' => null, 'status' => 'ready'],
    ], 60);

    $response = LaraKubeDesktopServer::tool(ListServersTool::class, []);

    $response->assertOk()->assertSee('workshop-demo');
});

test('returns an empty list when the CLI cannot be found', function () {
    app()->instance(ToolLocator::class, new ToolLocator([]));

    $response = LaraKubeDesktopServer::tool(ListServersTool::class, []);

    $response->assertOk()->assertSee('[]');
});
