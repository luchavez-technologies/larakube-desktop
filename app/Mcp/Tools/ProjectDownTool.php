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
use Laravel\Mcp\Server\Completions\CompletionResponse;
use Laravel\Mcp\Server\Contracts\Completable;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsDestructive;

#[Name('project-down')]
#[Title('Bring Project Down')]
#[Description("Brings a project down in the given environment (defaults to local). Plain down is reversible. Setting purge: true also deletes the project's data volumes permanently and requires confirm: true.")]
#[IsDestructive]
class ProjectDownTool extends Tool implements Completable
{
    use PollsRun;

    private const int TIMEOUT_SECONDS = 60;

    public function complete(string $argument, string $value, array $context): CompletionResponse
    {
        if ($argument === 'environment') {
            return CompletionResponse::match(['local', 'production', 'staging']);
        }

        return CompletionResponse::empty();
    }

    public function handle(Request $request): Response
    {
        $projectId = (int) $request->get('project_id');
        $project = Project::query()->find($projectId);

        if ($project === null) {
            return Response::error("No project found with id {$projectId}.");
        }

        $environment = $request->get('environment') ?? 'local';
        $purge = (bool) $request->get('purge');

        if ($purge && $request->get('confirm') !== true) {
            return Response::error("Purging {$project->name}'s data is destructive and cannot be undone. Re-call this tool with confirm: true to proceed.");
        }

        $args = ['down', $environment, '--force'];

        if ($purge) {
            $args[] = '--full';
        }

        $run = app(CliRunner::class)->start(
            label: $purge ? "Down & Purge {$project->name} ({$environment})" : "Down {$project->name} ({$environment})",
            arguments: $args,
            kind: RunKind::DownProject,
            projectId: $project->id,
            projectName: $project->name,
            environment: $environment,
        );

        return $this->pollRun($run, self::TIMEOUT_SECONDS);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'project_id' => $schema->integer()->description('The project ID from list-projects'),
            'environment' => $schema->string()->description('Environment to bring down, e.g. local or production. Defaults to local.')->nullable(),
            'purge' => $schema->boolean()->description("Also deletes the project's data volumes — irreversible. Requires confirm: true.")->nullable(),
            'confirm' => $schema->boolean()->description("Must be true when purge is true. This action is destructive: purging permanently deletes the project's data volumes and cannot be undone.")->nullable(),
        ];
    }
}
