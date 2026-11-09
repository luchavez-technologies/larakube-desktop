<?php

namespace App\Mcp\Tools;

use App\Models\Project;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Title;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[Name('list-projects')]
#[Title('List Projects')]
#[Description('Lists every project registered in LaraKube Desktop.')]
#[IsReadOnly]
class ListProjectsTool extends Tool
{
    public function handle(Request $request): Response
    {
        $projects = Project::query()->get()->map(fn (Project $project): array => [
            'id' => $project->id,
            'path' => $project->path,
            'name' => $project->name,
            'group' => $project->group,
            'framework' => $project->framework,
            'environment' => $project->environment,
            'web_host' => $project->web_host,
        ])->all();

        return Response::text(json_encode($projects, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
    }

    public function schema(JsonSchema $schema): array
    {
        return [];
    }
}
