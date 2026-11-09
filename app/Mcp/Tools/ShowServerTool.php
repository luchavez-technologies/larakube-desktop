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
        $server = app(StackCatalog::class)->find($name);

        if ($server === null) {
            return Response::error("No server found named '{$name}'.");
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
