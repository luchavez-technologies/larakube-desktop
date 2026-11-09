<?php

namespace App\Mcp\Tools;

use App\Services\LaraKube\ToolCatalog;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Title;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[Name('list-cluster-tools')]
#[Title('List Cluster Tools')]
#[Description("Lists the Cluster Tools installed on a server's kube context.")]
#[IsReadOnly]
class ListClusterToolsTool extends Tool
{
    public function handle(Request $request): Response
    {
        $context = (string) $request->get('context');
        $tools = app(ToolCatalog::class)->forContext($context) ?? [];

        return Response::text(json_encode($tools, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'context' => $schema->string()->description("The server's kube context, from show-server's output"),
        ];
    }
}
