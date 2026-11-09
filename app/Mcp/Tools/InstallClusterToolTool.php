<?php

namespace App\Mcp\Tools;

use App\Enums\RunKind;
use App\Models\ClusterTool;
use App\Models\Server;
use App\Models\ServerDomain;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\StackCatalog;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Title;
use Laravel\Mcp\Server\Completions\CompletionResponse;
use Laravel\Mcp\Server\Contracts\Completable;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsIdempotent;

#[Name('install-cluster-tool')]
#[Title('Install Cluster Tool')]
#[Description('Installs a Cluster Tool on a server. Additive — safe to call without confirmation.')]
#[IsIdempotent]
class InstallClusterToolTool extends Tool implements Completable
{
    use PollsRun;

    private const int TIMEOUT_SECONDS = 120;

    public function complete(string $argument, string $value, array $context): CompletionResponse
    {
        if ($argument === 'server') {
            return CompletionResponse::match(Server::pluck('name')->all());
        }

        if ($argument === 'tool') {
            $known = ['n8n', 'stalwart', 'vaultwarden', 'uptime-kuma', 'glitchtip', 'netbird', 'authentik', 'pocketbase', 'wordpress', 'penpot', 'forgejo', 'mattermost', 'twenty', 'plausible', 'roundcube', 'minio'];
            $fromDb = ClusterTool::distinct()->pluck('tool')->filter()->values()->all();

            return CompletionResponse::match(array_values(array_unique(array_merge($known, $fromDb))));
        }

        if ($argument === 'domain') {
            $arguments = is_array($context['arguments'] ?? null) ? $context['arguments'] : [];
            $serverName = (string) ($arguments['server'] ?? '');
            $toolName = (string) ($arguments['tool'] ?? 'app');

            $server = Server::where('name', $serverName)->orWhere('ip', $serverName)->first();
            $domains = $server !== null
                ? $server->domains->pluck('domain')->all()
                : ServerDomain::distinct()->pluck('domain')->all();

            $suggestions = [];
            foreach ($domains as $baseDomain) {
                if (is_string($baseDomain) && $baseDomain !== '') {
                    $suggestions[] = "{$toolName}.{$baseDomain}";
                }
            }

            if (! empty($suggestions)) {
                return CompletionResponse::match(array_values(array_unique($suggestions)));
            }
        }

        return CompletionResponse::empty();
    }

    public function handle(Request $request): Response
    {
        $server = (string) $request->get('server');
        $context = trim((string) $request->get('context'));
        $tool = (string) $request->get('tool');
        $domain = (string) $request->get('domain');
        $adminEmail = $request->get('admin_email');
        $wireSso = (bool) $request->get('wire_sso', false);
        $wireMail = (bool) $request->get('wire_mail', false);

        if ($context === '') {
            $serverModel = Server::where('name', $server)->orWhere('ip', $server)->first();
            $stack = app(StackCatalog::class)->find($server);
            $context = (string) ($serverModel instanceof Server ? $serverModel->context : ($stack['context'] ?? ''));
        }

        if ($context === '') {
            return Response::error("Could not resolve Kubernetes context for server '{$server}'. Please provide an explicit 'context' parameter.");
        }

        $run = app(CliRunner::class)->start(
            label: "Install {$tool} on {$server}",
            arguments: [
                'tool:add',
                "--tool={$tool}",
                "--context={$context}",
                "--domain={$domain}",
                ...($adminEmail ? ["--admin-email={$adminEmail}"] : []),
                $wireSso ? '--wire-sso' : '--no-wire-sso',
                $wireMail ? '--wire-mail' : '--no-wire-mail',
                '--force',
            ],
            kind: RunKind::InstallClusterTool,
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
            'context' => $schema->string()->description("The server's kube context (optional; auto-resolved from server name if omitted)")->nullable(),
            'tool' => $schema->string()->description('The tool slug to install, e.g. from list-cluster-tools (e.g. n8n, wordpress, pocketbase)'),
            'domain' => $schema->string()->description('The domain/host to install the tool under (e.g. n8n.example.com)'),
            'admin_email' => $schema->string()->description('An admin email, for tools that need one')->nullable(),
            'wire_sso' => $schema->boolean()->description('Whether to wire SSO (Zitadel) for this tool if available (default: false)')->nullable(),
            'wire_mail' => $schema->boolean()->description('Whether to wire mail (Stalwart) for this tool if available (default: false)')->nullable(),
        ];
    }
}
