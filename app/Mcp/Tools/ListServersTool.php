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

#[Name('list-servers')]
#[Title('List Servers')]
#[Description('Lists every known server/stack LaraKube Desktop manages, with status, context, and provider.')]
class ListServersTool extends Tool
{
    public function handle(Request $request): Response
    {
        $servers = app(StackCatalog::class)->all() ?? [];

        return Response::text(json_encode($servers, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
    }

    public function schema(JsonSchema $schema): array
    {
        return [];
    }
}
