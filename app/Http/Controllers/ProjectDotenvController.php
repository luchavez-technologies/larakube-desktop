<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Models\Project;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ProjectDotenv;
use App\Services\LaraKube\ProjectInspector;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class ProjectDotenvController extends Controller
{
    public function __construct(
        private ProjectInspector $inspector,
        private ProjectDotenv $dotenv,
        private CliRunner $runner,
    ) {}

    public function status(Request $request, Project $project): JsonResponse
    {
        $environment = (string) $request->input('environment', 'production');
        $reveal = $request->boolean('reveal');

        $status = $this->dotenv->get($project->path, $environment, $reveal);

        return response()->json([
            'environment' => $environment,
            'status' => $status,
        ]);
    }

    public function push(Request $request, Project $project): RedirectResponse
    {
        $environment = (string) $request->input('environment', 'production');
        $label = "Push secret keys to {$environment}";

        return $this->run($project, RunKind::DotenvPush, $label, ['dotenv:push', $environment], $environment);
    }

    public function pull(Request $request, Project $project): RedirectResponse
    {
        $environment = (string) $request->input('environment', 'production');
        $label = "Pull secret keys from {$environment}";

        return $this->run($project, RunKind::DotenvPull, $label, ['dotenv:pull', $environment], $environment);
    }

    /**
     * @param  list<string>  $arguments
     */
    private function run(Project $project, RunKind $kind, string $label, array $arguments, string $environment): RedirectResponse
    {
        abort_unless(is_dir($project->path), 404);

        $projectName = $this->inspector->inspect($project->path)['name'];

        $this->runner->start(
            label: $label,
            arguments: $arguments,
            kind: $kind,
            subject: "project:{$project->id}",
            meta: [
                'project' => (string) $project->id,
                'environment' => $environment,
            ],
            cwd: $project->path,
            targetType: 'project',
            targetName: $projectName,
            projectId: $project->id,
            projectName: $projectName,
            environment: $environment,
        );

        return back();
    }
}
