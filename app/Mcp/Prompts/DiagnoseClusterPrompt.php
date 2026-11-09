<?php

declare(strict_types=1);

namespace App\Mcp\Prompts;

use App\Models\Server;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Title;
use Laravel\Mcp\Server\Completions\CompletionResponse;
use Laravel\Mcp\Server\Contracts\Completable;
use Laravel\Mcp\Server\Prompt;
use Laravel\Mcp\Server\Prompts\Argument;

#[Name('diagnose-cluster')]
#[Title('Diagnose Cluster Health')]
#[Description('Diagnose a server or cluster: audits node status, companion tools, and recent execution runs.')]
class DiagnoseClusterPrompt extends Prompt implements Completable
{
    public function arguments(): array
    {
        return [
            new Argument(
                name: 'server',
                description: 'The name of the server to diagnose (leave empty to audit all servers)',
                required: false,
            ),
        ];
    }

    public function handle(Request $request): Response
    {
        $server = trim((string) $request->get('server'));

        $target = $server !== '' ? "server '{$server}'" : 'all registered servers and clusters';

        $prompt = <<<EOT
You are an expert Kubernetes and DevOps engineer assisting with LaraKube Desktop.
Please perform a complete diagnostic health check for {$target}:

1. Call `list-servers` or `show-server` to inspect the server's reachability, IP address, and Kubernetes context.
2. Call `list-cluster-tools` for the server's context to verify whether companion tools (e.g. Traefik, OpenBao, NetBird, Uptime Kuma) are healthy and properly synced.
3. If any recent failures occurred, check `get-run-status` to inspect error logs and exit codes.
4. Provide a clear, structured summary of:
   - Infrastructure status (Healthy / Degraded / Down)
   - Discovered anomalies or warnings
   - Actionable recovery steps (e.g. running `project-heal` or reinstalling tools)
EOT;

        return Response::text($prompt);
    }

    public function complete(string $argument, string $value, array $context): CompletionResponse
    {
        if ($argument === 'server') {
            return CompletionResponse::match(Server::pluck('name')->all());
        }

        return CompletionResponse::empty();
    }
}
