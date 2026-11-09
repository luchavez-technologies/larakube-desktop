<?php

declare(strict_types=1);

namespace App\Mcp\Resources;

use App\Services\LaraKube\StackCatalog;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\MimeType;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Title;
use Laravel\Mcp\Server\Attributes\Uri;
use Laravel\Mcp\Server\Resource;

#[Name('servers-list')]
#[Title('All Servers & Stacks')]
#[Description('Live inventory of every server and cloud cluster managed by LaraKube Desktop.')]
#[Uri('servers://list')]
#[MimeType('application/json')]
class ServerListResource extends Resource
{
    public function handle(StackCatalog $catalog): Response
    {
        $servers = $catalog->all() ?? [];

        return Response::text(json_encode($servers, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
    }
}
