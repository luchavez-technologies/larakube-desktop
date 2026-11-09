<?php

namespace App\Mcp\Tools;

use App\Models\Server;
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
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[Name('show-server')]
#[Title('Show Server')]
#[Description('Shows detail for one server/stack: status, context, provider.')]
#[IsReadOnly]
class ShowServerTool extends Tool implements Completable
{
    public function complete(string $argument, string $value, array $context): CompletionResponse
    {
        if ($argument === 'name') {
            $names = Server::pluck('name')->all();

            return CompletionResponse::match($names);
        }

        return CompletionResponse::empty();
    }

    public function handle(Request $request): Response
    {
        $name = (string) $request->get('name');
        $serverData = app(StackCatalog::class)->find($name);
        $serverModel = Server::where('name', $name)->orWhere('ip', $name)->with('domains')->first();

        if ($serverData === null && $serverModel === null) {
            return Response::error("No server found named '{$name}'.");
        }

        $server = $serverData ?? [];
        if ($serverModel !== null) {
            $server['name'] = $server['name'] ?? $serverModel->name;
            $server['provider'] = $server['provider'] ?? $serverModel->provider;
            $server['kind'] = $server['kind'] ?? $serverModel->kind;
            $server['ip'] = $server['ip'] ?? $serverModel->ip;
            $server['context'] = $server['context'] ?? $serverModel->context;
            $server['status'] = $server['status'] ?? $serverModel->status;
            $server['domains'] = $serverModel->domains->map(fn ($d): array => [
                'domain' => $d->domain,
                'external_dns' => (bool) $d->external_dns,
                'dns_provider' => $d->dns_provider,
                'tls' => (bool) $d->tls,
            ])->all();
        } else {
            $server['domains'] = [];
        }

        return Response::text(json_encode($server, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'name' => $schema->string()->description('The server/stack name from list-servers'),
        ];
    }
}
