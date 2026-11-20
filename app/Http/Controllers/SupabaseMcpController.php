<?php

namespace App\Http\Controllers;

use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use App\Services\LaraKube\TunnelManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Native\Desktop\Facades\ChildProcess;

/**
 * The MCP card on a Supabase app page. Self-hosted Supabase blocks MCP on its public URL, so
 * `supabase:mcp` opens it on 127.0.0.1 through a tunnel to Studio; this starts and stops that command
 * in the background. One instance at a time, on one port: the AI client's config points at that port.
 */
class SupabaseMcpController extends Controller
{
    public const int PORT = 54321;

    /** Where `supabase:mcp` serves MCP on that port; the same path its own output prints. */
    private const string PATH = '/api/mcp?features=docs%2Cdatabase%2Cdebugging%2Cdevelopment';

    private const string ALIAS = 'supabase-mcp';

    private const string CACHE_KEY = 'supabase_mcp_tunnel';

    public function __construct(private StackCatalog $stacks, private TunnelManager $tunnels) {}

    public function show(Request $request, string $server): JsonResponse
    {
        return response()->json($this->status($server, $request->string('domain')->trim()->toString()));
    }

    public function start(Request $request, string $server, ToolLocator $locator): JsonResponse
    {
        $domain = (string) $request->validate(['domain' => ['required', 'string', 'max:253']])['domain'];
        $context = $this->context($server);

        $cli = $locator->find('larakube');
        if ($cli === null) {
            return response()->json(['running' => false, 'error' => 'The LaraKube CLI was not found.'], 422);
        }

        // Another instance's tunnel holds the port; close it first.
        ChildProcess::stop(self::ALIAS);
        $locator->start(
            [$cli, 'supabase:mcp', 'production', "--context={$context}", "--domain={$domain}", '--port='.self::PORT, '--no-interaction'],
            self::ALIAS,
        );
        Cache::put(self::CACHE_KEY, ['server' => $server, 'domain' => $domain], now()->addDays(7));

        return response()->json([...$this->status($server, $domain), 'starting' => true]);
    }

    public function stop(Request $request, string $server): JsonResponse
    {
        $domain = $request->string('domain')->trim()->toString();

        ChildProcess::stop(self::ALIAS);
        Cache::forget(self::CACHE_KEY);

        return response()->json($this->status($server, $domain));
    }

    /** @return array{running: bool, url: string, port: int, otherInstance: ?string} */
    private function status(string $server, string $domain): array
    {
        $owner = Cache::get(self::CACHE_KEY);
        $ours = is_array($owner) && ($owner['server'] ?? null) === $server && ($owner['domain'] ?? null) === $domain;
        $listening = $this->tunnels->isPortListening(self::PORT);

        return [
            'running' => $ours && $listening,
            'url' => 'http://127.0.0.1:'.self::PORT.self::PATH,
            'port' => self::PORT,
            // Shown so the card can say why it would take the port over.
            'otherInstance' => ! $ours && $listening && is_array($owner) ? (string) ($owner['domain'] ?? '') : null,
        ];
    }

    private function context(string $server): string
    {
        $stack = $this->stacks->find($server);

        abort_if($stack === null || $stack['status'] !== 'ready' || $stack['context'] === null, 404);

        return (string) $stack['context'];
    }
}
