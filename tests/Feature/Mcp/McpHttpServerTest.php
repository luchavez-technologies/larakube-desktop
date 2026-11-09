<?php

use App\Services\Mcp\McpHttpServer;

function sendMcpHttpRequest(McpHttpServer $server, string $method, string $path, array $headers = [], string $body = ''): string
{
    /** @var array{0: resource, 1: resource}|false $pair */
    $pair = stream_socket_pair(STREAM_PF_UNIX, STREAM_SOCK_STREAM, STREAM_IPPROTO_IP);
    if ($pair === false) {
        throw new RuntimeException('Could not create in-memory socket pair for test.');
    }

    [$client, $conn] = $pair;

    // Expand buffer so multi-kilobyte JSON responses don't block synchronous handleConnection()
    $sockConn = socket_import_stream($conn);
    $sockClient = socket_import_stream($client);
    if ($sockConn && $sockClient) {
        socket_set_option($sockConn, SOL_SOCKET, SO_SNDBUF, 131072);
        socket_set_option($sockClient, SOL_SOCKET, SO_RCVBUF, 131072);
    }

    $headerLines = ["{$method} {$path} HTTP/1.1", 'Host: 127.0.0.1', 'Connection: close'];
    foreach ($headers as $k => $v) {
        $headerLines[] = "{$k}: {$v}";
    }
    if ($body !== '') {
        $headerLines[] = 'Content-Length: '.strlen($body);
    }
    $raw = implode("\r\n", $headerLines)."\r\n\r\n".$body;
    fwrite($client, $raw);

    $server->handleConnection($conn);

    $response = (string) stream_get_contents($client);
    fclose($client);

    return $response;
}

test('listen binds a real socket and reports a usable ephemeral port', function (): void {
    $server = new McpHttpServer('secret-token', false);
    $server->listen(0);

    $port = $server->getPort();
    expect($port)->toBeGreaterThan(0)->toBeLessThan(65536);

    $server->close();
});

test('rejects request without valid bearer token with 401 Unauthorized', function (): void {
    $server = new McpHttpServer('secret-token', false);

    // 1. Missing header
    $response = sendMcpHttpRequest($server, 'POST', '/mcp', ['Content-Type' => 'application/json'], '{}');
    expect($response)->toContain('401 Unauthorized');

    // 2. Wrong token
    $response2 = sendMcpHttpRequest($server, 'POST', '/mcp', [
        'Content-Type' => 'application/json',
        'Authorization' => 'Bearer wrong-token',
    ], '{}');
    expect($response2)->toContain('401 Unauthorized');
});

test('dispatches read request with valid token and returns JSON-RPC response', function (): void {
    $server = new McpHttpServer('secret-token', false);

    $payload = json_encode([
        'jsonrpc' => '2.0',
        'id' => 1,
        'method' => 'tools/list',
        'params' => (object) [],
    ]);

    $response = sendMcpHttpRequest($server, 'POST', '/mcp', [
        'Content-Type' => 'application/json',
        'Authorization' => 'Bearer secret-token',
    ], (string) $payload);

    expect($response)->toContain('HTTP/1.1 200 OK')
        ->and($response)->toContain('list-projects');
});

test('rejects write tools with 403 when allowEdits is false', function (): void {
    $server = new McpHttpServer('secret-token', allowEdits: false);

    $payload = json_encode([
        'jsonrpc' => '2.0',
        'id' => 42,
        'method' => 'tools/call',
        'params' => [
            'name' => 'project-up',
            'arguments' => ['project' => 'my-app'],
        ],
    ]);

    $response = sendMcpHttpRequest($server, 'POST', '/mcp', [
        'Content-Type' => 'application/json',
        'Authorization' => 'Bearer secret-token',
    ], (string) $payload);

    expect($response)->toContain('HTTP/1.1 403 Forbidden')
        ->and($response)->toContain('This MCP HTTP server is read-only')
        ->and($response)->toContain('-32000');

    // Also verify create-server and delete-server are rejected
    foreach (['create-server', 'delete-server'] as $writeTool) {
        $writePayload = json_encode([
            'jsonrpc' => '2.0',
            'id' => 43,
            'method' => 'tools/call',
            'params' => [
                'name' => $writeTool,
                'arguments' => ['stack_name' => 'test-box', 'name' => 'test-box'],
            ],
        ]);

        $res = sendMcpHttpRequest($server, 'POST', '/mcp', [
            'Content-Type' => 'application/json',
            'Authorization' => 'Bearer secret-token',
        ], (string) $writePayload);

        expect($res)->toContain('HTTP/1.1 403 Forbidden')
            ->and($res)->toContain('This MCP HTTP server is read-only');
    }
});

test('allows write tools when allowEdits is true', function (): void {
    $server = new McpHttpServer('secret-token', allowEdits: true);

    $payload = json_encode([
        'jsonrpc' => '2.0',
        'id' => 99,
        'method' => 'tools/call',
        'params' => [
            'name' => 'project-up',
            'arguments' => ['project' => 'nonexistent-project'],
        ],
    ]);

    $response = sendMcpHttpRequest($server, 'POST', '/mcp', [
        'Content-Type' => 'application/json',
        'Authorization' => 'Bearer secret-token',
    ], (string) $payload);

    // Not rejected at HTTP layer with 403
    expect($response)->not->toContain('HTTP/1.1 403 Forbidden');
});
