<?php

use App\Mcp\Servers\LaraKubeDesktopServer;
use App\Mcp\Tools\ListClusterToolsTool;
use App\Models\ClusterTool;
use App\Models\Server;

test('lists the cluster tools installed on a context', function () {
    $server = Server::create(['name' => 'workshop-demo', 'provider' => 'gcp', 'kind' => 'vps', 'status' => 'ready', 'context' => 'larakube-203.0.113.21']);
    ClusterTool::create([
        'server_id' => $server->id,
        'tool' => 'pocketbase',
        'installed' => true,
        'data' => [],
        'sync_status' => 'fresh',
        'last_synced_at' => now(),
    ]);

    $response = LaraKubeDesktopServer::tool(ListClusterToolsTool::class, ['context' => 'larakube-203.0.113.21']);

    $response->assertOk()->assertSee('pocketbase');
});

test('returns an empty list for a context with no matching server', function () {
    $response = LaraKubeDesktopServer::tool(ListClusterToolsTool::class, ['context' => 'no-such-context']);

    $response->assertOk()->assertSee('[]');
});
