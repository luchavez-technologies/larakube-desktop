<?php

declare(strict_types=1);

namespace App\Mcp\Resources;

use App\Models\Project;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\MimeType;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Title;
use Laravel\Mcp\Server\Attributes\Uri;
use Laravel\Mcp\Server\Resource;

#[Name('projects-list')]
#[Title('All Registered Projects')]
#[Description('Live inventory of every application/project registered in LaraKube Desktop.')]
#[Uri('projects://list')]
#[MimeType('application/json')]
class ProjectListResource extends Resource
{
    public function handle(): Response
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
}
