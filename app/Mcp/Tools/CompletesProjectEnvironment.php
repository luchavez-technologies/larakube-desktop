<?php

namespace App\Mcp\Tools;

use App\Models\Project;
use App\Services\LaraKube\ProjectInspector;
use Laravel\Mcp\Server\Completions\CompletionResponse;

trait CompletesProjectEnvironment
{
    /**
     * Dynamically resolve declared environments for a project (`local` plus any inspected remote envs).
     *
     * @param  array<string, mixed>  $context
     */
    protected function completeProjectEnvironment(array $context): CompletionResponse
    {
        $arguments = is_array($context['arguments'] ?? null) ? $context['arguments'] : [];
        $projectId = isset($arguments['project_id']) ? (int) $arguments['project_id'] : 0;

        if ($projectId > 0) {
            $project = Project::query()->find($projectId);
            if ($project !== null && $project->path !== '') {
                $inspected = app(ProjectInspector::class)->inspect($project->path);
                $envs = ['local'];
                foreach ($inspected['environments'] as $envRow) {
                    $name = (string) $envRow['name'];
                    if ($name !== '') {
                        $envs[] = $name;
                    }
                }

                return CompletionResponse::match(array_values(array_unique($envs)));
            }
        }

        // Fallback aggregated from all registered projects before failing back to reserved local/production
        $discovered = ['local'];
        foreach (Project::query()->limit(10)->get(['path']) as $project) {
            if ($project->path === '') {
                continue;
            }
            $inspected = app(ProjectInspector::class)->inspect($project->path);
            foreach ($inspected['environments'] as $envRow) {
                $name = (string) $envRow['name'];
                if ($name !== '') {
                    $discovered[] = $name;
                }
            }
        }

        if (count($discovered) === 1) {
            array_push($discovered, 'production', 'staging');
        }

        return CompletionResponse::match(array_values(array_unique($discovered)));
    }
}
