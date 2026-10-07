<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Models\Project;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ProjectInspector;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProjectScalingController extends Controller
{
    public function __construct(
        private ProjectInspector $inspector,
        private CliRunner $runner,
    ) {}

    public function updateReplicas(Request $request, Project $project): RedirectResponse
    {
        $validated = $request->validate([
            'environment' => ['required', 'string', 'alpha_dash'],
            'component' => ['required', 'string', 'alpha_dash'],
            'count' => ['nullable', 'integer', 'min:0'],
            'reset' => ['boolean'],
        ]);

        $env = $validated['environment'];
        $component = $validated['component'];
        $reset = $request->boolean('reset');
        $count = $validated['count'] ?? 1;

        $args = ['replicas', $env, "--component={$component}"];
        if ($reset) {
            $args[] = '--reset';
            $label = "Reset replicas for {$component} ({$env})";
        } else {
            $args[] = "--count={$count}";
            $label = "Set replicas for {$component} to {$count} ({$env})";
        }

        return $this->run($project, RunKind::ConfigureReplicas, $label, $args, $env);
    }

    public function updateAutoscale(Request $request, Project $project): RedirectResponse
    {
        $validated = $request->validate([
            'environment' => ['required', 'string', 'alpha_dash'],
            'component' => ['required', 'string', 'alpha_dash'],
            'min' => ['nullable', 'integer', 'min:1'],
            'max' => ['nullable', 'integer', 'min:1'],
            'cpu' => ['nullable', 'integer', 'min:1', 'max:100'],
            'disable' => ['boolean'],
        ]);

        $env = $validated['environment'];
        $component = $validated['component'];
        $disable = $request->boolean('disable');

        $args = ['autoscale', $env, "--component={$component}"];
        if ($disable) {
            $args[] = '--disable';
            $label = "Disable autoscaling for {$component} ({$env})";
        } else {
            $min = $validated['min'] ?? 1;
            $max = $validated['max'] ?? max($min, 5);
            $cpu = $validated['cpu'] ?? 70;
            $args[] = "--min={$min}";
            $args[] = "--max={$max}";
            $args[] = "--cpu={$cpu}";
            $label = "Configure autoscale for {$component} ({$min}..{$max} @ {$cpu}%) ({$env})";
        }

        return $this->run($project, RunKind::ConfigureAutoscale, $label, $args, $env);
    }

    public function updateResources(Request $request, Project $project): RedirectResponse
    {
        $validated = $request->validate([
            'environment' => ['required', 'string', 'alpha_dash'],
            'component' => ['required', 'string', 'alpha_dash'],
            'tier' => ['nullable', 'string', Rule::in(['eco', 'standard', 'pro', 'custom'])],
            'requests_cpu' => ['nullable', 'string', 'max:32'],
            'requests_memory' => ['nullable', 'string', 'max:32'],
            'limits_cpu' => ['nullable', 'string', 'max:32'],
            'limits_memory' => ['nullable', 'string', 'max:32'],
            'reset' => ['boolean'],
        ]);

        $env = $validated['environment'];
        $component = $validated['component'];
        $reset = $request->boolean('reset');
        $tier = $validated['tier'] ?? null;

        $args = ['resources', $env, "--component={$component}"];
        if ($reset) {
            $args[] = '--reset';
            $label = "Reset resources for {$component} ({$env})";
        } elseif ($tier !== null && $tier !== 'custom') {
            $args[] = "--tier={$tier}";
            $label = "Set resources tier for {$component} to {$tier} ({$env})";
        } else {
            if ($request->filled('requests_cpu')) {
                $args[] = "--requests-cpu={$request->input('requests_cpu')}";
            }
            if ($request->filled('requests_memory')) {
                $args[] = "--requests-memory={$request->input('requests_memory')}";
            }
            if ($request->filled('limits_cpu')) {
                $args[] = "--limits-cpu={$request->input('limits_cpu')}";
            }
            if ($request->filled('limits_memory')) {
                $args[] = "--limits-memory={$request->input('limits_memory')}";
            }
            $label = "Configure custom resources for {$component} ({$env})";
        }

        return $this->run($project, RunKind::ConfigureResources, $label, $args, $env);
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
