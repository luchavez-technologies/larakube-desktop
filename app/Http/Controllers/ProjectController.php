<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Models\Project;
use App\Models\Run;
use App\Services\FolderPicker;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ProjectInspector;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Apps the user deploys. Every step runs the LaraKube CLI inside the project
 * folder, against its `production` environment.
 */
class ProjectController extends Controller
{
    public const ENVIRONMENT = 'production';

    public function __construct(private ProjectInspector $inspector) {}

    public function index(): Response
    {
        return Inertia::render('projects/index', [
            'projects' => Project::query()->latest('id')->get()->map(fn (Project $project): array => ['id' => $project->id] + $this->inspector->inspect($project->path))->all(),
        ]);
    }

    public function store(FolderPicker $picker): RedirectResponse
    {
        $path = $picker->pick('Choose your app folder');

        if ($path === null) {
            return to_route('projects.index');
        }

        $home = ToolLocator::home();

        if ($home === '' || ! str_starts_with(realpath($path) ?: $path, $home.'/')) {
            return to_route('projects.index')->withErrors(['path' => 'Choose a folder inside your home folder.']);
        }

        $project = Project::firstOrCreate(['path' => realpath($path) ?: $path]);

        return to_route('projects.show', $project);
    }

    public function show(Project $project, StackCatalog $stacks): Response
    {
        $inspection = $this->inspector->inspect($project->path);
        $servers = array_values(array_filter($stacks->all() ?? [], fn (array $stack): bool => $stack['status'] === 'ready'));
        $server = null;

        foreach ($servers as $stack) {
            if ($inspection['serverIp'] !== null && $stack['ip'] === $inspection['serverIp']) {
                $server = $stack;
            }
        }

        return Inertia::render('projects/show', [
            'project' => ['id' => $project->id] + $inspection,
            'server' => $server,
            'frameworks' => ProjectInspector::DEPLOYABLE,
            'runs' => Run::query()->where('subject', "project:{$project->id}")->latest('id')->limit(5)->get(['id', 'label', 'kind', 'status', 'created_at'])->all(),
        ]);
    }

    public function destroy(Project $project): RedirectResponse
    {
        $project->delete();

        return to_route('projects.index');
    }

    public function init(Request $request, Project $project, CliRunner $runner): RedirectResponse
    {
        $framework = $request->validate(['framework' => ['required', Rule::in(array_keys(ProjectInspector::DEPLOYABLE))]])['framework'];

        return $this->run($runner, $project, RunKind::InitProject, 'Set up '.basename($project->path).' for LaraKube', ['init', "--framework={$framework}", '--fast']);
    }

    public function host(Request $request, Project $project, CliRunner $runner): RedirectResponse
    {
        $host = $request->validate([
            'host' => ['required', 'string', 'max:253', 'regex:/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/'],
        ], ['host.regex' => 'Enter a hostname like app.example.com, without https://.'])['host'];

        return $this->run($runner, $project, RunKind::ConfigureHost, "Set the address of {$this->name($project)}", ['cloud:configure', self::ENVIRONMENT, '--only=hosts', "--web-hosts={$host}"]);
    }

    public function deploy(Project $project, CliRunner $runner): RedirectResponse
    {
        return $this->run($runner, $project, RunKind::DeployApp, "Deploy {$this->name($project)}", ['cloud:deploy', self::ENVIRONMENT]);
    }

    private function name(Project $project): string
    {
        return $this->inspector->inspect($project->path)['name'];
    }

    /**
     * @param  list<string>  $arguments
     */
    private function run(CliRunner $runner, Project $project, RunKind $kind, string $label, array $arguments): RedirectResponse
    {
        abort_unless(is_dir($project->path), 404);

        $run = $runner->start(
            label: $label,
            arguments: $arguments,
            kind: $kind,
            subject: "project:{$project->id}",
            meta: ['project' => (string) $project->id],
            cwd: $project->path,
        );

        return to_route('runs.show', $run);
    }
}
