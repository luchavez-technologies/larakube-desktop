<?php

declare(strict_types=1);

namespace App\Mcp\Resources;

use App\Models\Server;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolCatalog;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\MimeType;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Title;
use Laravel\Mcp\Server\Completions\CompletionResponse;
use Laravel\Mcp\Server\Contracts\Completable;
use Laravel\Mcp\Server\Contracts\HasUriTemplate;
use Laravel\Mcp\Server\Resource;
use Laravel\Mcp\Support\UriTemplate;

#[Name('server-detail')]
#[Title('Server Detail & Status')]
#[Description('Live status, nodes, and installed cluster tools for a specific server by name.')]
#[MimeType('application/json')]
class ServerDetailResource extends Resource implements Completable, HasUriTemplate
{
    public function uriTemplate(): UriTemplate
    {
        return new UriTemplate('servers://{name}/status');
    }

    public function handle(Request $request, StackCatalog $catalog, ToolCatalog $toolCatalog): Response
    {
        $name = (string) $request->get('name');
        $stack = $catalog->find($name);

        if ($stack === null) {
            return Response::error("No server found named '{$name}'.");
        }

        $context = $stack['context'] ?? '';
        $tools = $context !== '' ? ($toolCatalog->forContext($context) ?? []) : [];

        $payload = [
            'server' => $stack,
            'tools' => $tools,
        ];

        return Response::text(json_encode($payload, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
    }

    public function complete(string $argument, string $value, array $context): CompletionResponse
    {
        if ($argument === 'name') {
            return CompletionResponse::match(Server::pluck('name')->all());
        }

        return CompletionResponse::empty();
    }
}
