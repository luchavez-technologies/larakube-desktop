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
