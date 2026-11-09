<?php

use App\Mcp\Servers\LaraKubeDesktopServer;
use App\Mcp\Tools\ShowServerTool;
use App\Models\Server;
use App\Models\ServerDomain;
use App\Services\LaraKube\StackCatalog;
use Illuminate\Support\Facades\Cache;

test('shows detail for one server', function () {
    Cache::put(StackCatalog::CACHE_KEY, [
        ['name' => 'workshop-demo', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'asia-east1', 'ip' => '203.0.113.21', 'context' => 'larakube-203.0.113.21', 'account' => null, 'projectId' => null, 'status' => 'ready'],
    ], 60);

    $response = LaraKubeDesktopServer::tool(ShowServerTool::class, ['name' => 'workshop-demo']);

    $response->assertOk()->assertSee('larakube-203.0.113.21')->assertSee('domains');
});

test('shows connected domains when a server has registered domains', function () {
    $server = Server::updateOrCreate(
        ['name' => 'domain-box'],
        ['provider' => 'gcp', 'kind' => 'vps', 'context' => 'larakube-domain-box', 'status' => 'ready']
    );

    ServerDomain::create([
        'server_id' => $server->id,
        'domain' => 'example.com',
        'external_dns' => true,
        'dns_provider' => 'cloudflare',
        'tls' => true,
        'in_use' => true,
    ]);

    $response = LaraKubeDesktopServer::tool(ShowServerTool::class, ['name' => 'domain-box']);

    $response->assertOk()
        ->assertSee('example.com')
        ->assertSee('cloudflare');
});

test('errors cleanly when the server does not exist', function () {
    Cache::put(StackCatalog::CACHE_KEY, [], 60);

    $response = LaraKubeDesktopServer::tool(ShowServerTool::class, ['name' => 'not-a-server']);

    $response->assertHasErrors(['No server found']);
});
