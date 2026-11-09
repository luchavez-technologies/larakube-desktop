<?php

use App\Mcp\Methods\CompletionComplete;
use App\Mcp\Servers\LaraKubeDesktopServer;
use App\Models\ClusterTool;
use App\Models\Server;
use Laravel\Mcp\Server\Transport\FakeTransporter;
use Laravel\Mcp\Transport\JsonRpcRequest;

/**
 * @param  array<string, mixed>  $contextArgs
 * @return array<string, mixed>
 */
function callMcpCompletion(string $refType, string $refName, string $argumentName, string $argumentValue = '', array $contextArgs = []): array
{
    $server = app(LaraKubeDesktopServer::class, ['transport' => new FakeTransporter]);
    $method = app(CompletionComplete::class);
    $serverContext = $server->createContext();

    $params = [
        'ref' => [
            'type' => $refType,
            $refType === 'ref/resource' ? 'uri' : 'name' => $refName,
        ],
        'argument' => [
            'name' => $argumentName,
            'value' => $argumentValue,
        ],
        'context' => [
            'arguments' => $contextArgs,
        ],
    ];

    $request = new JsonRpcRequest(uniqid(), 'completion/complete', $params);
    $response = $method->handle($request, $serverContext);

    return $response->toArray()['result']['completion'] ?? [];
}

test('create-server completions work for provider, target_kind, and dns_provider', function (): void {
    $resProvider = callMcpCompletion('ref/tool', 'create-server', 'provider', 'g');
    expect($resProvider['values'])->toContain('gcp')
        ->and($resProvider['values'])->not->toContain('aws');

    $resTarget = callMcpCompletion('ref/tool', 'create-server', 'target_kind', 'v');
    expect($resTarget['values'])->toContain('vps')
        ->and($resTarget['values'])->not->toContain('managed');

    $resDns = callMcpCompletion('ref/tool', 'create-server', 'dns_provider', 'cloud');
    expect($resDns['values'])->toContain('cloudflare');
});

test('install-cluster-tool completions work for server and tool', function (): void {
    Server::updateOrCreate(
        ['name' => 'cluster-prod-1'],
        ['ip' => '10.0.0.10', 'context' => 'ctx-prod', 'provider' => 'gcp', 'kind' => 'vps', 'status' => 'ready']
    );

    $resServer = callMcpCompletion('ref/tool', 'install-cluster-tool', 'server', 'cluster-');
    expect($resServer['values'])->toContain('cluster-prod-1');

    $resTool = callMcpCompletion('ref/tool', 'install-cluster-tool', 'tool', 'n8');
    expect($resTool['values'])->toContain('n8n');
});

test('remove-cluster-tool completions filter by server installed tools if context is provided', function (): void {
    $server = Server::updateOrCreate(
        ['name' => 'srv-with-tools'],
        ['ip' => '10.0.0.11', 'context' => 'ctx-with-tools', 'provider' => 'gcp', 'kind' => 'vps', 'status' => 'ready']
    );

    ClusterTool::create([
        'server_id' => $server->id,
        'tool' => 'uptime-kuma',
        'installed' => true,
        'data' => [],
    ]);

    $res = callMcpCompletion('ref/tool', 'remove-cluster-tool', 'tool', 'up', ['server' => 'srv-with-tools']);
    expect($res['values'])->toContain('uptime-kuma');
});

test('delete-server and show-server completions return server names', function (): void {
    Server::updateOrCreate(
        ['name' => 'to-delete-box'],
        ['ip' => '10.0.0.12', 'context' => 'ctx-del', 'provider' => 'gcp', 'kind' => 'vps', 'status' => 'ready']
    );

    $resDel = callMcpCompletion('ref/tool', 'delete-server', 'name', 'to-del');
    expect($resDel['values'])->toContain('to-delete-box');

    $resShow = callMcpCompletion('ref/tool', 'show-server', 'name', 'to-del');
    expect($resShow['values'])->toContain('to-delete-box');
});

test('environment argument completes across project tools', function (): void {
    $resUp = callMcpCompletion('ref/tool', 'project-up', 'environment', 'loc');
    expect($resUp['values'])->toContain('local')
        ->and($resUp['values'])->not->toContain('production');

    $resDown = callMcpCompletion('ref/tool', 'project-down', 'environment', 'pro');
    expect($resDown['values'])->toContain('production')
        ->and($resDown['values'])->not->toContain('local');

    $resShow = callMcpCompletion('ref/tool', 'show-project', 'environment', 'stag');
    expect($resShow['values'])->toContain('staging');
});
