<?php

namespace App\Mcp\Tools;

use App\Models\Project;
use App\Services\LaraKube\ProjectInspector;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Title;
use Laravel\Mcp\Server\Tool;

#[Name('show-project')]
#[Title('Show Project')]
#[Description('Shows architectural detail for one project: framework, git, blueprint DNA for a given environment.')]
class ShowProjectTool extends Tool
{
    public function handle(Request $request): Response
    {
        $projectId = (int) $request->get('project_id');
        $project = Project::query()->find($projectId);

        if ($project === null) {
            return Response::error("No project found with id {$projectId}.");
        }

        $environment = $request->get('environment') ?? 'production';

        $result = app(ProjectInspector::class)->inspect($project->path, $environment);

        return Response::text(json_encode($result, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'project_id' => $schema->integer()->description('The project ID from list-projects'),
            'environment' => $schema->string()->description('Environment to inspect, e.g. local or production. Defaults to production.')->nullable(),
        ];
    }
}
