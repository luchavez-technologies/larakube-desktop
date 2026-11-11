<?php

use App\Mcp\Servers\LaraKubeDesktopServer;
use App\Mcp\Tools\ShowClusterToolTool;
use App\Models\CatalogTool;
use App\Models\ClusterTool;
use App\Models\Server;

test('shows full compatibility matrix, initFields, and storage recommendation for a tool', function (): void {
    Server::create([
        'name' => 'demo-vps',
        'provider' => 'do',
        'kind' => 'vps',
        'context' => 'larakube-demo',
        'status' => 'ready',
        'plex_sync_status' => 'fresh',
        'plex_last_synced_at' => now(),
        'plex_data' => [
            'initialized' => true,
            'services' => ['postgresql' => ['enabled' => true]],
        ],
    ]);

    CatalogTool::upsertFromPayload([
        'tool' => 'n8n',
        'brand' => 'n8n',
        'label' => 'Workflow Automation (n8n)',
        'categories' => ['DevOps', 'Productivity'],
        'source' => 'official',
        'supportsNoPlex' => true,
        'commonsCapabilities' => [
            'database' => true,
            'plexDatabases' => ['postgres'],
            'supportsSqlite' => true,
        ],
        'initFields' => [
            [
                'key' => 'noPlex',
                'label' => 'Standalone SQLite (--no-plex)',
                'type' => 'boolean',
                'flag' => '--no-plex',
                'role' => 'option',
            ],
        ],
    ]);

    $response = LaraKubeDesktopServer::tool(ShowClusterToolTool::class, [
        'tool' => 'n8n',
        'server' => 'demo-vps',
    ]);

    $response->assertOk()
        ->assertSee('n8n')
        ->assertSee('noPlex')
        ->assertSee('postgres')
        ->assertSee('"recommendedMode": "plex"');
});

test('completes tool slugs from catalog and returns error when tool is missing', function (): void {
    CatalogTool::upsertFromPayload([
        'tool' => 'wordpress',
        'brand' => 'WordPress',
        'label' => 'WordPress CMS',
    ]);

    $mcpTool = new ShowClusterToolTool;
    $completion = $mcpTool->complete('tool', 'word', [])->resolve('word');
    expect($completion->toArray()['values'])->toContain('wordpress');

    $missing = LaraKubeDesktopServer::tool(ShowClusterToolTool::class, ['tool' => 'does-not-exist']);
    $missing->assertHasErrors(['does-not-exist']);
});

test('includes installed instances on server when showing a tool', function (): void {
    $server = Server::create([
        'name' => 'apps-node',
        'provider' => 'do',
        'kind' => 'vps',
        'context' => 'ctx-apps',
        'status' => 'ready',
    ]);

    CatalogTool::upsertFromPayload([
        'tool' => 'n8n',
        'brand' => 'n8n',
        'label' => 'Workflow Automation (n8n)',
    ]);

    ClusterTool::create([
        'server_id' => $server->id,
        'tool' => 'n8n',
        'instance' => 'default',
        'installed' => true,
        'host' => 'n8n.example.com',
        'url' => 'https://n8n.example.com',
        'data' => ['tool' => 'n8n', 'installed' => true],
    ]);

    $response = LaraKubeDesktopServer::tool(ShowClusterToolTool::class, [
        'tool' => 'n8n',
        'server' => 'apps-node',
    ]);

    $response->assertOk()
        ->assertSee('n8n.example.com');
});
