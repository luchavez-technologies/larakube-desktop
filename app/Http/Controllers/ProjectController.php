<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Models\Project;
use App\Models\Run;
use App\Services\EditorLauncher;
use App\Services\FolderPicker;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\LaravelOptions;
use App\Services\LaraKube\ProjectInspector;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
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

    /** The Let's Encrypt email last used for a new Laravel app, prefilled next time. */
    private const EMAIL_CACHE_KEY = 'desktop.new-app.email';

    /**
     * The apps the desktop can start from scratch, and the CLI command that
     * scaffolds each. `--fast` takes each scaffolder's scripted defaults; a
     * Laravel app adds the answers from its form (see LaravelOptions).
     * `--no-plex` keeps a Next.js app self-contained, so deploying it doesn't
     * also need the Plex Commons on the server.
     *
     * @var array<string, array{label: string, description: string, command: list<string>}>
     */
    public const SCAFFOLDERS = [
        'laravel' => ['label' => 'Laravel', 'description' => 'A full PHP web app with a database.', 'command' => ['new', '--fast']],
        'nextjs' => ['label' => 'Next.js', 'description' => 'A React app with server rendering.', 'command' => ['nextjs:new', '--fast', '--no-plex']],
        'vite' => ['label' => 'Vite', 'description' => 'A React single-page app, served as static files.', 'command' => ['vite:new', '--fast']],
        'astro' => ['label' => 'Astro', 'description' => 'A content site, served as static files.', 'command' => ['astro:new', '--fast']],
        'docusaurus' => ['label' => 'Docusaurus', 'description' => 'A documentation site, served as static files.', 'command' => ['docs:new', '--fast']],
    ];

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

        if (! $this->insideHome($path)) {
            return to_route('projects.index')->withErrors(['path' => 'Choose a folder inside your home folder.']);
        }

        $project = Project::firstOrCreate(['path' => realpath($path) ?: $path]);

        return to_route('projects.show', $project);
    }

    public function create(Request $request, LaravelOptions $laravel): Response
    {
        $parent = (string) $request->query('parent', '');

        return Inertia::render('projects/create', [
            'laravelOptions' => Inertia::defer(fn (): ?array => $laravel->questions()),
            'email' => (string) Cache::get(self::EMAIL_CACHE_KEY, ''),
            'frameworks' => array_map(fn (array $scaffolder): array => ['label' => $scaffolder['label'], 'description' => $scaffolder['description']], self::SCAFFOLDERS),
            'parent' => $this->insideHome($parent) && is_dir($parent) ? $parent : ToolLocator::home(),
            'name' => (string) $request->query('name', ''),
            'framework' => array_key_exists((string) $request->query('framework'), self::SCAFFOLDERS) ? (string) $request->query('framework') : 'laravel',
        ]);
    }

    /** Opens the native folder dialog, then returns to the form with the choice. */
    public function chooseFolder(Request $request, FolderPicker $picker): RedirectResponse
    {
        $path = $picker->pick('Choose where to create your app');
        $query = array_filter([
            'name' => (string) $request->input('name', ''),
            'framework' => (string) $request->input('framework', ''),
        ]);

        if ($path !== null && ! $this->insideHome($path)) {
            return to_route('projects.create', $query)->withErrors(['parent' => 'Choose a folder inside your home folder.']);
        }

        return to_route('projects.create', $query + array_filter(['parent' => $path === null ? null : (realpath($path) ?: $path)]));
    }

    public function scaffold(Request $request, CliRunner $runner, LaravelOptions $laravel): RedirectResponse
    {
        $input = $request->validate([
            'name' => ['required', 'string', 'max:50', 'regex:/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/', Rule::notIn(['console'])],
            'framework' => ['required', Rule::in(array_keys(self::SCAFFOLDERS))],
            'parent' => ['required', 'string'],
        ], [
            'name.regex' => 'Use lowercase letters, numbers and dashes, starting with a letter.',
            'name.not_in' => 'The name "console" is reserved for the LaraKube Console.',
        ]);

        $parent = realpath($input['parent']) ?: $input['parent'];

        if (! is_dir($parent) || ! $this->insideHome($parent)) {
            return back()->withErrors(['parent' => 'Choose a folder inside your home folder.']);
        }

        $path = "{$parent}/{$input['name']}";

        if (file_exists($path)) {
            return back()->withErrors(['name' => "{$input['name']} already exists in this folder."]);
        }

        $scaffolder = self::SCAFFOLDERS[$input['framework']];
        $extra = [];

        if ($input['framework'] === 'laravel') {
            if ($laravel->questions() === null) {
                return back()->withErrors(['framework' => 'Update the LaraKube CLI from Setup to create Laravel apps.']);
            }

            $email = $request->validate(['email' => ['required', 'email']])['email'];
            $answers = $request->input('laravel', []);
            $resolved = $laravel->flags(is_array($answers) ? $answers : []);

            if ($resolved['errors'] !== []) {
                return back()->withErrors(collect($resolved['errors'])->mapWithKeys(fn (string $error, string $key): array => ["laravel.{$key}" => $error])->all());
            }

            Cache::forever(self::EMAIL_CACHE_KEY, $email);
            $extra = ["--email={$email}", ...$resolved['flags']];
        }

        $project = Project::firstOrCreate(['path' => $path]);

        $run = $runner->start(
            label: "Create {$scaffolder['label']} app {$input['name']}",
            arguments: [$scaffolder['command'][0], $input['name'], ...array_slice($scaffolder['command'], 1), ...$extra],
            kind: RunKind::NewProject,
            subject: "project:{$project->id}",
            meta: ['project' => (string) $project->id],
            cwd: $parent,
        );

        return to_route('runs.show', $run);
    }

    public function show(Project $project, StackCatalog $stacks, EditorLauncher $editors): Response
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
            'editors' => $editors->available(),
            'scaffold' => Run::query()->where('subject', "project:{$project->id}")->where('kind', RunKind::NewProject)->latest('id')->first(['id', 'status']),
        ]);
    }

    public function openInEditor(Request $request, Project $project, EditorLauncher $editors): RedirectResponse
    {
        $editor = $request->validate(['editor' => ['required', Rule::in(array_keys(EditorLauncher::EDITORS))]])['editor'];

        if (! $editors->open($editor, $project->path)) {
            return back()->withErrors(['editor' => EditorLauncher::EDITORS[$editor]['label']." couldn't open this folder."]);
        }

        return back();
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

    private function insideHome(string $path): bool
    {
        $home = ToolLocator::home();

        return $home !== '' && $path !== '' && str_starts_with(realpath($path) ?: $path, $home.'/');
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
