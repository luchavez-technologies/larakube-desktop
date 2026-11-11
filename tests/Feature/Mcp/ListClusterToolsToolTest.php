<?php

use App\Mcp\Servers\LaraKubeDesktopServer;
use App\Mcp\Tools\ListClusterToolsTool;
use App\Models\CatalogTool;
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

test('paginates and filters catalog tools with query, category, and source', function () {
    for ($i = 1; $i <= 5; $i++) {
        CatalogTool::upsertFromPayload([
            'tool' => "official-tool-{$i}",
            'brand' => "Official {$i}",
            'label' => "Official Tool {$i}",
            'categories' => ['DevOps'],
            'source' => 'official',
            'commonsCapabilities' => [
                'plexDatabases' => ['postgres'],
                'supportsSqlite' => false,
            ],
        ], $i);
    }

    CatalogTool::upsertFromPayload([
        'tool' => 'community-crm',
        'brand' => 'Community CRM',
        'label' => 'Community CRM App',
        'categories' => ['Productivity'],
        'source' => 'community',
        'supportsNoPlex' => true,
        'commonsCapabilities' => [
            'plexDatabases' => ['postgres'],
            'supportsSqlite' => true,
        ],
    ], 10);

    $pageOne = LaraKubeDesktopServer::tool(ListClusterToolsTool::class, [
        'per_page' => 2,
        'page' => 1,
    ]);
    $pageOne->assertOk()
        ->assertSee('official-tool-1')
        ->assertSee('"has_more": true')
        ->assertSee('"total": 6');

    $filtered = LaraKubeDesktopServer::tool(ListClusterToolsTool::class, [
        'source' => 'community',
        'query' => 'CRM',
    ]);
    $filtered->assertOk()
        ->assertSee('community-crm')
        ->assertDontSee('official-tool-1');
});

test('returns an empty list for a context with no matching server', function () {
    $response = LaraKubeDesktopServer::tool(ListClusterToolsTool::class, ['context' => 'no-such-context']);

    $response->assertOk()->assertSee('[]');
});
