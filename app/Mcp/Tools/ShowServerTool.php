<?php

namespace App\Mcp\Tools;

use App\Services\LaraKube\StackCatalog;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Title;
use Laravel\Mcp\Server\Tool;

#[Name('show-server')]
#[Title('Show Server')]
#[Description('Shows detail for one server/stack: status, context, provider.')]
class ShowServerTool extends Tool
{
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
