<?php

namespace App\Services\Mcp;

use App\Mcp\Servers\LaraKubeDesktopServer;
use Illuminate\Http\Request;
use Laravel\Mcp\Server\Transport\HttpTransport;
use RuntimeException;

/**
 * A persistent, multi-request HTTP listener for the Desktop MCP server,
 * bound to a configured port on 127.0.0.1. Runs outside Laravel's own HTTP
 * kernel entirely (plain stream_socket_server, no Router/Kernel involved)
 * so NativePHP's PreventRegularBrowserAccess — pushed onto the shared
 * kernel singleton for every request, regardless of which routes file
 * registered a route — structurally cannot apply to it. Generalizes
 * cli/app/Services/Cloud/LoopbackHttpServer.php's one-shot pattern into a
 * loop, and feeds requests into laravel/mcp's own HttpTransport the same
 * way Laravel\Mcp\Server\Registrar::web()/startServer() do, without going
 * through Mcp::web()'s routing.
 */
class McpHttpServer
{
    /** Tool names that change state — gated behind $allowEdits on top of each tool's own confirm:true requirement. */
    private const array WRITE_TOOLS = [
        'project-up',
        'project-down',
        'project-heal',
        'install-cluster-tool',
        'remove-cluster-tool',
        'create-server',
        'delete-server',
    ];

    /** @var resource|null */
    private $socket;

    private bool $running = false;

    public function __construct(private readonly string $token, private readonly bool $allowEdits) {}

    public function listen(int $port): void
    {
        $socket = stream_socket_server("tcp://127.0.0.1:{$port}", $errno, $errstr);

        if ($socket === false) {
            throw new RuntimeException("Could not bind the MCP HTTP server to port {$port}: {$errstr}");
        }

        $this->socket = $socket;
    }

    public function getPort(): int
    {
        if ($this->socket === null) {
            throw new RuntimeException('listen() must be called before getPort().');
        }

        $name = stream_socket_get_name($this->socket, false);

        if ($name === false) {
            throw new RuntimeException('Could not determine socket address.');
        }

        $parts = explode(':', $name);

        return (int) end($parts);
    }

    /** Blocks until stop() is called (from the same process, e.g. a signal handler) or the socket is closed externally. */
    public function run(): void
    {
        $this->running = true;

        while (true) {
            $this->acceptOnce(1);

            if (! $this->running) {
                break;
            }
        }
    }

    public function stop(): void
    {
        $this->running = false;
    }

    public function close(): void
    {
        if ($this->socket !== null) {
            fclose($this->socket);
            $this->socket = null;
        }
    }

    /**
     * Accepts and handles exactly one connection if one arrives within $timeoutSeconds. Returns whether one was handled.
     *
     * @phpstan-impure performs real socket I/O each call; never safe to treat as a pure, memoizable read.
     */
    public function acceptOnce(int $timeoutSeconds): bool
    {
        if ($this->socket === null) {
            throw new RuntimeException('listen() must be called before acceptOnce().');
        }

        $read = [$this->socket];
        $write = $except = [];
        $changed = @stream_select($read, $write, $except, $timeoutSeconds);

        if ($changed === false || $changed === 0) {
            return false;
        }

        $connection = @stream_socket_accept($this->socket, 1);

        if ($connection === false) {
            return false;
        }

        $this->handleConnection($connection);

        return true;
    }

    public function handleConnection(mixed $connection): void
    {
        $requestLine = fgets($connection) ?: '';

        $headers = [];
        while (($line = fgets($connection)) !== false && trim($line) !== '') {
            if (str_contains($line, ':')) {
                [$name, $value] = explode(':', $line, 2);
                $headers[strtolower(trim($name))] = trim($value);
            }
        }

        $body = '';
        $contentLength = (int) ($headers['content-length'] ?? 0);
        while (strlen($body) < $contentLength && ! feof($connection)) {
            $remaining = $contentLength - strlen($body);
            if ($remaining <= 0) {
                break;
            }
            $chunk = fread($connection, min(8192, $remaining));
            if ($chunk === false || $chunk === '') {
                break;
            }
            $body .= $chunk;
        }

        [$method, $uri] = $this->parseRequestLine($requestLine);

        if ($method !== 'POST' || ! $this->hasValidToken($headers)) {
            $this->writeResponse($connection, 401, 'application/json', json_encode(['error' => 'Unauthorized']) ?: '{}');
            fclose($connection);

            return;
        }

        $decoded = json_decode($body, true);

        if (is_array($decoded) && $this->isDisallowedWrite($decoded)) {
            $this->writeResponse($connection, 403, 'application/json', json_encode([
                'jsonrpc' => '2.0',
                'id' => $decoded['id'] ?? null,
                'error' => [
                    'code' => -32000,
                    'message' => 'This MCP HTTP server is read-only. Enable "Allow MCP clients to edit" in Settings to permit write actions.',
                ],
            ]) ?: '{}');
            fclose($connection);

            return;
        }

        $request = Request::create($uri, 'POST', [], [], [], [], $body);
        $request->headers->set('Content-Type', 'application/json');

        $transport = new HttpTransport($request);
        $server = app(LaraKubeDesktopServer::class, ['transport' => $transport]);
        $server->start();
        $response = $transport->run();

        $this->writeResponse(
            $connection,
            $response->getStatusCode(),
            $response->headers->get('Content-Type', 'application/json'),
            (string) $response->getContent(),
        );
        fclose($connection);
    }

    /** @return array{0: string, 1: string} */
    private function parseRequestLine(string $requestLine): array
    {
        if (preg_match('#^(\S+)\s+(\S+)\s+HTTP#', $requestLine, $match) !== 1) {
            return ['', '/'];
        }

        return [$match[1], $match[2]];
    }

    /** @param  array<string, string>  $headers */
    private function hasValidToken(array $headers): bool
    {
        $authorization = $headers['authorization'] ?? '';

        if (! str_starts_with($authorization, 'Bearer ')) {
            return false;
        }

        return hash_equals($this->token, substr($authorization, 7));
    }

    /** @param  array<string, mixed>  $decoded */
    private function isDisallowedWrite(array $decoded): bool
    {
        if ($this->allowEdits) {
            return false;
        }

        if (($decoded['method'] ?? null) !== 'tools/call') {
            return false;
        }

        $name = $decoded['params']['name'] ?? null;

        return is_string($name) && in_array($name, self::WRITE_TOOLS, true);
    }

    private function writeResponse(mixed $connection, int $status, string $contentType, string $body): void
    {
        $statusText = match ($status) {
            200 => 'OK',
            401 => 'Unauthorized',
            403 => 'Forbidden',
            default => 'Error',
        };

        $response = "HTTP/1.1 {$status} {$statusText}\r\n"
            ."Content-Type: {$contentType}\r\n"
            .'Content-Length: '.strlen($body)."\r\n"
            ."Connection: close\r\n\r\n"
            .$body;

        $totalLength = strlen($response);
        $written = 0;
        while ($written < $totalLength) {
            $n = @fwrite($connection, substr($response, $written));
            if ($n === false || $n === 0) {
                break;
            }
            $written += $n;
        }
    }
}
