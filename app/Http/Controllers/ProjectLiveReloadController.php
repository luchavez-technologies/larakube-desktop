<?php

namespace App\Http\Controllers;

use App\Models\LocalClusterState;
use App\Models\Project;
use App\Services\LaraKube\ProjectWatcher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Live reload for a local project: what the watcher is doing, and the switch
 * that turns it on or off. The page polls `show` while it is open.
 */
class ProjectLiveReloadController extends Controller
{
    public function __construct(private ProjectWatcher $watcher) {}

    public function show(Project $project): JsonResponse
    {
        return response()->json($this->watcher->summary($project));
    }

    public function update(Request $request, Project $project): JsonResponse
    {
        $validated = $request->validate(['enabled' => ['required', 'boolean']]);

        $project->update(['live_reload' => $validated['enabled']]);

        if ($project->live_reload) {
            $this->watcher->reset($project);
        }

        $workloads = LocalClusterState::current()->workloads_data ?? [];
        $this->watcher->reconcile($project, $this->watcher->isRunningLocally($project, $workloads));

        return response()->json($this->watcher->summary($project->refresh()));
    }
}
