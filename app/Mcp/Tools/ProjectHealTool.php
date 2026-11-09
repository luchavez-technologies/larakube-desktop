<?php

namespace App\Mcp\Tools;

use App\Enums\RunKind;
use App\Models\Project;
use App\Services\LaraKube\CliRunner;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Title;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsIdempotent;

#[Name('project-heal')]
#[Title('Heal Project')]
#[Description('Reconciles/repairs a project back to its blueprint. Not destructive — safe to call without confirmation.')]
#[IsIdempotent]
class ProjectHealTool extends Tool
{
    use PollsRun;

    private const int TIMEOUT_SECONDS = 120;

    public function handle(Request $request): Response
    {
        $projectId = (int) $request->get('project_id');
        $project = Project::query()->find($projectId);

        if ($project === null) {
            return Response::error("No project found with id {$projectId}.");
        }

        $run = app(CliRunner::class)->start(
            label: "Heal {$project->name}",
            arguments: ['heal', '--force', '--prune'],
            kind: RunKind::HealProject,
            projectId: $project->id,
            projectName: $project->name,
        );

        return $this->pollRun($run, self::TIMEOUT_SECONDS);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'project_id' => $schema->integer()->description('The project ID from list-projects'),
        ];
    }
}
