<?php

declare(strict_types=1);

namespace App\Mcp\Resources;

use App\Models\Project;
use App\Services\LaraKube\ProjectInspector;
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

#[Name('project-blueprint')]
#[Title('Project Blueprint & DNA')]
#[Description('Architectural blueprint, git state, and environment DNA for a specific project by ID.')]
#[MimeType('application/json')]
class ProjectBlueprintResource extends Resource implements Completable, HasUriTemplate
{
    public function uriTemplate(): UriTemplate
    {
        return new UriTemplate('projects://{id}/blueprint');
    }

    public function handle(Request $request, ProjectInspector $inspector): Response
    {
        $id = (int) $request->get('id');
        $project = Project::query()->find($id);

        if ($project === null) {
            return Response::error("No project found with id {$id}.");
        }

        $blueprint = $inspector->inspect($project->path, 'production');

        $payload = [
            'project' => [
                'id' => $project->id,
                'name' => $project->name,
                'path' => $project->path,
                'group' => $project->group,
                'framework' => $project->framework,
                'environment' => $project->environment,
                'web_host' => $project->web_host,
            ],
            'blueprint' => $blueprint,
        ];

        return Response::text(json_encode($payload, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
    }

    public function complete(string $argument, string $value, array $context): CompletionResponse
    {
        if ($argument === 'id') {
            $ids = Project::pluck('id')->map(fn (int $id): string => (string) $id)->all();

            return CompletionResponse::match($ids);
        }

        return CompletionResponse::empty();
    }
}
