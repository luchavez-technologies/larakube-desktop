<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Models\Project;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\StackCatalog;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class PlexController extends Controller
{
    public function initServer(string $server, StackCatalog $stacks, CliRunner $runner): RedirectResponse
    {
        $stack = $stacks->find($server);
        abort_unless($stack !== null && is_string($stack['context']), 404);

        $run = $runner->start(
            label: "Initialize Plex Commons on {$server}",
            arguments: ['plex:init', "--context={$stack['context']}"],
            kind: RunKind::PlexInit,
            subject: "server:{$server}",
            meta: ['server' => $server, 'context' => $stack['context']],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $stack['context'],
        );

        return to_route('runs.show', $run);
    }

    public function startServer(string $server, StackCatalog $stacks, CliRunner $runner): RedirectResponse
    {
        $stack = $stacks->find($server);
        abort_unless($stack !== null && is_string($stack['context']), 404);

        $run = $runner->start(
            label: "Resume Plex Commons on {$server}",
            arguments: ['plex:start', "--context={$stack['context']}"],
            kind: RunKind::PlexStart,
            subject: "server:{$server}",
            meta: ['server' => $server, 'context' => $stack['context']],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $stack['context'],
        );

        return to_route('runs.show', $run);
    }

    public function stopServer(string $server, StackCatalog $stacks, CliRunner $runner): RedirectResponse
    {
        $stack = $stacks->find($server);
        abort_unless($stack !== null && is_string($stack['context']), 404);

        $run = $runner->start(
            label: "Pause Plex Commons on {$server}",
            arguments: ['plex:stop', "--context={$stack['context']}"],
            kind: RunKind::PlexStop,
            subject: "server:{$server}",
            meta: ['server' => $server, 'context' => $stack['context']],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $stack['context'],
        );

        return to_route('runs.show', $run);
    }

    public function joinProject(Request $request, Project $project, CliRunner $runner): RedirectResponse
    {
        abort_unless(is_dir($project->path), 404);

        $projectName = basename($project->path);
        $env = $request->input('environment');
        $label = $env ? "Join Plex Commons ({$env})" : 'Join Plex Commons';
        $arguments = $env ? ['plex:join', (string) $env] : ['plex:join', '--fast'];

        $run = $runner->start(
            label: $label,
            arguments: $arguments,
            kind: RunKind::PlexJoin,
            subject: "project:{$project->id}",
            meta: array_filter(['project' => (string) $project->id, 'environment' => $env ? (string) $env : null]),
            cwd: $project->path,
            targetType: 'project',
            targetName: $projectName,
            projectId: $project->id,
            projectName: $projectName,
            environment: $env ? (string) $env : 'local',
        );

        return to_route('projects.show', $project);
    }

    public function leaveProject(Request $request, Project $project, CliRunner $runner): RedirectResponse
    {
        abort_unless(is_dir($project->path), 404);

        $projectName = basename($project->path);
        $env = $request->input('environment');
        $label = $env ? "Leave Plex Commons ({$env})" : 'Leave Plex Commons';
        $arguments = $env ? ['plex:leave', (string) $env, '--force'] : ['plex:leave', '--force'];

        $run = $runner->start(
            label: $label,
            arguments: $arguments,
            kind: RunKind::PlexLeave,
            subject: "project:{$project->id}",
            meta: array_filter(['project' => (string) $project->id, 'environment' => $env ? (string) $env : null]),
            cwd: $project->path,
            targetType: 'project',
            targetName: $projectName,
            projectId: $project->id,
            projectName: $projectName,
            environment: $env ? (string) $env : 'local',
        );

        return to_route('projects.show', $project);
    }
}
