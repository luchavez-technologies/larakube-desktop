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
use Laravel\Mcp\Server\Tools\Annotations\IsIdempotent;

#[Name('project-up')]
#[Title('Bring Project Up')]
#[Description('Brings a project up in the given environment (defaults to local). Reversible — safe to call without confirmation.')]
#[IsIdempotent]
class ProjectUpTool extends Tool implements Completable
{
    use PollsRun;

    private const int TIMEOUT_SECONDS = 120;

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

        $run = app(CliRunner::class)->start(
            label: "Up {$project->name} ({$environment})",
            arguments: ['up', $environment, '--no-console', '--no-test'],
            kind: RunKind::UpProject,
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
            'environment' => $schema->string()->description('Environment to bring up, e.g. local or production. Defaults to local.')->nullable(),
        ];
    }
}
