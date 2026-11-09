<?php

namespace App\Mcp\Tools;

use App\Enums\RunKind;
use App\Models\ClusterTool;
use App\Models\Server;
use App\Services\LaraKube\CliRunner;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Title;
use Laravel\Mcp\Server\Completions\CompletionResponse;
use Laravel\Mcp\Server\Contracts\Completable;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsDestructive;

#[Name('remove-cluster-tool')]
#[Title('Remove Cluster Tool')]
#[Description("Removes a Cluster Tool from a server. Plain removal keeps data unless purge: true is set, which permanently deletes the tool's data and requires confirm: true.")]
#[IsDestructive]
class RemoveClusterToolTool extends Tool implements Completable
{
    use PollsRun;

    private const int TIMEOUT_SECONDS = 120;

    public function complete(string $argument, string $value, array $context): CompletionResponse
    {
        if ($argument === 'server') {
            return CompletionResponse::match(Server::pluck('name')->all());
        }

        if ($argument === 'tool') {
            $serverName = $context['server'] ?? null;
            if (is_string($serverName) && $serverName !== '') {
                $server = Server::where('name', $serverName)->first();
                if ($server !== null) {
                    $tools = $server->clusterTools()->pluck('tool')->all();
                    if ($tools !== []) {
                        return CompletionResponse::match($tools);
                    }
                }
            }

            return CompletionResponse::match(
                ClusterTool::distinct()->pluck('tool')->filter()->values()->all() ?: ['n8n', 'stalwart', 'vaultwarden', 'uptime-kuma', 'pocketbase', 'wordpress']
            );
        }

        return CompletionResponse::empty();
    }

    public function handle(Request $request): Response
    {
        $server = (string) $request->get('server');
        $context = (string) $request->get('context');
        $tool = (string) $request->get('tool');
        $domain = $request->get('domain');
        $purge = (bool) $request->get('purge');

        if ($purge && $request->get('confirm') !== true) {
            return Response::error("Purging {$tool}'s data is destructive and cannot be undone. Re-call this tool with confirm: true to proceed.");
        }

        $args = ["{$tool}:remove", 'production', "--context={$context}"];

        if ($domain) {
            $args[] = "--domain={$domain}";
        }

        if ($purge) {
            $args[] = '--purge';
        }

        $args[] = '--force';

        $run = app(CliRunner::class)->start(
            label: "Remove {$tool} from {$server}",
            arguments: $args,
            kind: RunKind::RemoveClusterTool,
            subject: $tool,
            serverName: $server,
            context: $context,
            tool: $tool,
        );

        return $this->pollRun($run, self::TIMEOUT_SECONDS);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'server' => $schema->string()->description('The server/stack name, from list-servers'),
            'context' => $schema->string()->description("The server's kube context, from show-server's output"),
            'tool' => $schema->string()->description('The tool slug to remove, e.g. from list-cluster-tools'),
            'domain' => $schema->string()->description('Omit for a single-instance tool; required for a multi-instance tool to identify which one')->nullable(),
            'purge' => $schema->boolean()->description("Also deletes the tool's data — irreversible. Requires confirm: true.")->nullable(),
            'confirm' => $schema->boolean()->description("Must be true when purge is true. This action is destructive: purging permanently deletes the tool's data and cannot be undone.")->nullable(),
        ];
    }
}
