<?php

namespace App\Mcp\Tools;

use App\Enums\RunKind;
use App\Models\Server;
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

#[Name('connect-domain')]
#[Title('Connect Domain & DNS')]
#[Description('Connects a DNS provider (e.g. Cloudflare) to a server to deploy ExternalDNS and automated SSL certificates.')]
#[IsIdempotent]
class ConnectDomainTool extends Tool implements Completable
{
    use PollsRun;

    private const int TIMEOUT_SECONDS = 120;

    public function complete(string $argument, string $value, array $context): CompletionResponse
    {
        if ($argument === 'server') {
            $dbServers = Server::pluck('name')->all();
            $catalog = app(StackCatalog::class)->all() ?? [];
            $catalogStacks = array_column($catalog, 'name');

            return CompletionResponse::match(array_values(array_unique([...$dbServers, ...$catalogStacks])));
        }

        if ($argument === 'dns_provider') {
            return CompletionResponse::match(['cloudflare', 'route53', 'google']);
        }

        return CompletionResponse::empty();
    }

    public function handle(Request $request): Response
    {
        $serverName = trim((string) $request->get('server'));
        if ($serverName === '') {
            return Response::error('A server name is required.');
        }

        $context = trim((string) $request->get('context'));
        if ($context === '') {
            $serverModel = Server::where('name', $serverName)->first();
            if ($serverModel instanceof Server && $serverModel->context) {
                $context = (string) $serverModel->context;
            } else {
                $stack = app(StackCatalog::class)->find($serverName);
                $context = (string) ($stack['context'] ?? "larakube-{$serverName}");
            }
        }

        if ($context === '') {
            return Response::error("Could not resolve Kubernetes context for server '{$serverName}'. Please provide an explicit 'context' parameter.");
        }

        $dnsProvider = (string) $request->get('dns_provider', 'cloudflare');
        if ($dnsProvider === '') {
            $dnsProvider = 'cloudflare';
        }

        $cloudflareToken = trim((string) $request->get('cloudflare_token'));
        if ($cloudflareToken === '' && $dnsProvider === 'cloudflare') {
            $cloudflareToken = trim((string) (getenv('LARAKUBE_CLOUDFLARE_TOKEN') ?: getenv('CLOUDFLARE_API_TOKEN') ?: ''));
        }

        $secretEnv = [];
        if ($cloudflareToken !== '') {
            $secretEnv['LARAKUBE_CLOUDFLARE_TOKEN'] = $cloudflareToken;
        }

        $enableTls = (bool) $request->get('enable_tls', true);
        $group = trim((string) $request->get('group'));
        $groupArg = $group !== '' ? ["--group={$group}"] : [];

        $arguments = [
            'tool:init',
            'production',
            '--tool=external-dns',
            "--context={$context}",
            "--provider={$dnsProvider}",
            ...$groupArg,
            '--force',
        ];

        $run = app(CliRunner::class)->start(
            label: "Connect a domain to {$serverName}",
            arguments: $arguments,
            secretEnvironment: $secretEnv,
            kind: RunKind::ConnectDomain,
            subject: $serverName,
            meta: array_filter([
                'server' => $serverName,
                'context' => $context,
                'provider' => $dnsProvider,
                'group' => $group,
                'also_enable_tls' => $enableTls ? '1' : '0',
            ], fn (string $val): bool => $val !== ''),
            targetType: 'server',
            targetName: $serverName,
            serverName: $serverName,
            context: $context,
        );

        return $this->pollRun($run, self::TIMEOUT_SECONDS);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'server' => $schema->string()->description('The server/stack name to connect domain & DNS to'),
            'context' => $schema->string()->description("The server's kube context (optional; auto-resolved from server name if omitted)")->nullable(),
            'dns_provider' => $schema->string()->description('DNS provider (cloudflare, route53, google). Default: cloudflare')->nullable(),
            'cloudflare_token' => $schema->string()->description('Cloudflare API token. Optional; auto-detected from LARAKUBE_CLOUDFLARE_TOKEN or CLOUDFLARE_API_TOKEN in environment if omitted.')->nullable(),
            'enable_tls' => $schema->boolean()->description('Whether to automatically enable SSL certificate generation via Traefik ACME (default: true)')->nullable(),
            'group' => $schema->string()->description('Optional credential group name')->nullable(),
        ];
    }
}
