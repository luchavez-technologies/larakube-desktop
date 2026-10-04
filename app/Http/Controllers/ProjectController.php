<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Models\Project;
use App\Models\Run;
use App\Services\EditorLauncher;
use App\Services\FolderPicker;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ClusterStatus;
use App\Services\LaraKube\DevBoxShell;
use App\Services\LaraKube\FrameworkCatalog;
use App\Services\LaraKube\FrameworkForm;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\LaravelOptions;
use App\Services\LaraKube\LocalCluster;
use App\Services\LaraKube\ProjectInspector;
use App\Services\LaraKube\ProjectServices;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Process;
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

    public function __construct(private ProjectInspector $inspector) {}

    public function index(Request $request, ToolLocator $locator): Response
    {
        // The latest create run per project: keyBy keeps the last of each subject.
        $scaffolds = Run::query()->where('kind', RunKind::NewProject)->orderBy('id')->get(['subject', 'project_id', 'status'])->keyBy(fn (Run $r) => $r->project_id ? "project:{$r->project_id}" : (string) $r->subject);

        $activeRuns = Run::query()
            ->where('status', RunStatus::Running)
            ->whereIn('kind', [
                RunKind::UpProject,
                RunKind::DownProject,
                RunKind::StartProject,
                RunKind::StopProject,
            ])
            ->get()
            ->keyBy(fn (Run $r) => (int) ($r->project_id ?: (str_starts_with((string) $r->subject, 'project:') ? substr((string) $r->subject, 8) : 0)));

        $workloads = $this->localWorkloadStatuses($locator);

        $projects = Project::query()->latest('id')->get()->map(function (Project $project) use ($scaffolds, $activeRuns, $workloads): array {
            $inspection = $this->inspector->inspect($project->path);
            $activeRun = $activeRuns->get($project->id);

            return [
                'id' => $project->id,
                'scaffoldStatus' => $scaffolds->get("project:{$project->id}")?->status,
                'localStatus' => $this->resolveLocalStatus($project, $inspection, $activeRun, $workloads),
                'activeRun' => $activeRun ? [
                    'id' => $activeRun->id,
                    'label' => $activeRun->label,
                    'kind' => $activeRun->kind?->value,
                    'status' => $activeRun->status->value,
                ] : null,
            ] + $inspection;
        })->all();

        return Inertia::render('projects/index', [
            'projects' => $projects,
            'hasActiveRuns' => $activeRuns->isNotEmpty(),
            // Dev boxes to switch to (experimental), and the apps on the chosen one, asked of the box itself.
            'devBoxes' => Inertia::defer(fn (): array => $this->readyDevBoxNames(), 'devBoxes'),
            'box' => $this->chosenDevBox($request),
            'boxProjects' => Inertia::defer(function () use ($request): ?array {
                $box = $this->chosenDevBox($request);
                $stack = $box === null ? null : collect(app(StackCatalog::class)->devBoxes() ?? [])->firstWhere('name', $box);

                if ($stack === null || $stack['status'] !== 'ready') {
                    return null;
                }

                $result = app(DevBoxShell::class)->json($stack, ['project:list', '--json']);

                return is_array($result['projects'] ?? null) ? array_values($result['projects']) : null;
            }, 'boxProjects'),
            'hasRunningLocal' => collect($projects)->some(fn (array $p): bool => $p['localStatus']['state'] === 'running'),
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

    /** @return list<string> the names of the dev boxes that can be switched to, none unless experimental features are on */
    private function readyDevBoxNames(): array
    {
        if (! app(GlobalSettings::class)->experimental()) {
            return [];
        }

        return array_values(array_map(
            fn (array $box): string => $box['name'],
            array_filter(app(StackCatalog::class)->devBoxes() ?? [], fn (array $box): bool => $box['status'] === 'ready'),
        ));
    }

    /** The dev box named in ?box=, when the feature is on and the name is a plain one. */
    private function chosenDevBox(Request $request): ?string
    {
        $box = $request->query('box');

        return is_string($box) && preg_match('/^[a-z0-9][a-z0-9-]*$/', $box) === 1 && app(GlobalSettings::class)->experimental() ? $box : null;
    }

    public function create(Request $request, FrameworkCatalog $frameworks, LocalCluster $local, ClusterStatus $status): Response
    {
        $parent = (string) $request->query('parent', '');
        $requestedFramework = (string) $request->query('framework', '');
        $offered = array_column($frameworks->visible(), 'slug');
        $defaultFramework = in_array($requestedFramework, $offered, true) ? $requestedFramework : 'laravel';

        $activeRun = null;
        if ($request->filled('run')) {
            $r = Run::query()->whereKey($request->query('run'))->first();
            if ($r instanceof Run) {
                $activeRun = [
                    'id' => $r->id,
                    'label' => $r->label,
                    'kind' => $r->kind?->value,
                    'status' => $r->status->value,
                    'output' => (string) $r->output,
                    'startedAt' => $r->created_at?->toIso8601String(),
                    'finishedAt' => $r->finished_at?->toIso8601String(),
                    'meta' => $r->meta,
                ];
            }
        }

        return Inertia::render('projects/create', [
            'catalog' => Inertia::defer(fn (): ?array => $frameworks->catalog() === null ? null : [
                'categories' => $frameworks->catalog()['categories'],
                'frameworks' => $frameworks->visible(),
            ]),
            // The local Commons as it is now, so the form can say what creating the app will start.
            'commons' => Inertia::defer(function () use ($local, $status): ?array {
                $context = $local->detect()['context'];
                $plex = $context === null ? null : $status->plex($context);

                return $plex === null ? null : ['context' => $context, 'initialized' => $plex['initialized'], 'services' => $plex['services']];
            }),
            // Dev boxes the app can be created on instead (experimental), so the form can offer them.
            'devBoxes' => Inertia::defer(fn (): array => app(GlobalSettings::class)->experimental()
                ? array_map(fn (array $box): array => ['name' => $box['name'], 'ip' => $box['ip'] ?? null], array_values(array_filter(app(StackCatalog::class)->devBoxes() ?? [], fn (array $box): bool => $box['status'] === 'ready')))
                : []),
            'initialBox' => $this->chosenDevBox($request) ?? '',
            'email' => (string) Cache::get(self::EMAIL_CACHE_KEY, ''),
            'parent' => $this->insideHome($parent, allowHome: true) && is_dir($parent) ? $parent : ToolLocator::home(),
            'name' => (string) $request->query('name', ''),
            'framework' => $defaultFramework,
            'activeRun' => $activeRun,
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

        if ($path !== null && ! $this->insideHome($path, allowHome: true)) {
            return to_route('projects.create', $query)->withErrors(['parent' => 'Choose a folder inside your home folder.']);
        }

        return to_route('projects.create', $query + array_filter(['parent' => $path === null ? null : (realpath($path) ?: $path)]));
    }

    public function scaffold(Request $request, CliRunner $runner, FrameworkCatalog $frameworks, FrameworkForm $form): RedirectResponse
    {
        $input = $request->validate([
            'framework' => ['required', 'string'],
            'parent' => ['required', 'string'],
            'answers' => ['array'],
        ]);

        $framework = $frameworks->framework($input['framework']);

        if ($framework === null || ! empty($framework['hidden'])) {
            return back()->withErrors(['framework' => 'Update the LaraKube CLI from Setup to create this app.']);
        }

        if (! empty($framework['comingSoon'])) {
            return back()->withErrors(['framework' => "{$framework['label']} is coming soon!"]);
        }

        $resolved = $form->resolve($framework['fields'], (array) ($input['answers'] ?? []));

        if ($resolved['errors'] !== []) {
            return back()->withErrors(collect($resolved['errors'])->mapWithKeys(fn (string $error, string $key): array => ["answers.{$key}" => $error])->all());
        }

        $name = (string) $resolved['positional'];

        $parent = realpath($input['parent']) ?: $input['parent'];

        if (! is_dir($parent) || ! $this->insideHome($parent, allowHome: true)) {
            return back()->withErrors(['parent' => 'Choose a folder inside your home folder.']);
        }

        $path = "{$parent}/{$name}";

        if (file_exists($path)) {
            return back()->withErrors(['answers.name' => "{$name} already exists in this folder."]);
        }

        if (is_string($email = $input['answers']['email'] ?? null)) {
            Cache::forever(self::EMAIL_CACHE_KEY, trim($email));
        }

        $project = Project::firstOrCreate(['path' => $path]);
        $arguments = $frameworks->scaffoldArguments($framework, $name, $resolved['flags']);

        // The arguments and folder are kept so a failed create can be retried as is.
        $run = $runner->start(
            label: "Create {$framework['label']} app {$name}",
            arguments: $arguments,
            kind: RunKind::NewProject,
            subject: "project:{$project->id}",
            meta: ['project' => (string) $project->id, 'arguments' => (string) json_encode($arguments), 'cwd' => $parent],
            cwd: $parent,
            targetType: 'project',
            targetName: $name,
            projectId: $project->id,
            projectName: $name,
            environment: 'local',
        );

        return to_route('projects.create', [
            'run' => $run->id,
            'parent' => $parent,
            'name' => $name,
            'framework' => $input['framework'],
        ]);
    }

    /**
     * Experimental. Creates the app on a dev box over SSH, in its projects folder. The same form and answers as a local
     * app; the project then lives on the box, so nothing is registered on this computer.
     */
    public function scaffoldOnDevBox(Request $request, CliRunner $runner, FrameworkCatalog $frameworks, FrameworkForm $form, StackCatalog $stacks): RedirectResponse
    {
        abort_unless(app(GlobalSettings::class)->experimental(), 404);

        $input = $request->validate([
            'framework' => ['required', 'string'],
            'box' => ['required', 'string'],
            'answers' => ['array'],
        ]);

        $box = collect($stacks->devBoxes() ?? [])->firstWhere('name', $input['box']);

        if ($box === null || $box['status'] !== 'ready') {
            return back()->withErrors(['box' => 'That dev box is not ready.']);
        }

        $framework = $frameworks->framework($input['framework']);

        if ($framework === null || ! empty($framework['hidden']) || ! empty($framework['comingSoon'])) {
            return back()->withErrors(['framework' => 'This app cannot be created yet.']);
        }

        $resolved = $form->resolve($framework['fields'], (array) ($input['answers'] ?? []));

        if ($resolved['errors'] !== []) {
            return back()->withErrors(collect($resolved['errors'])->mapWithKeys(fn (string $error, string $key): array => ["answers.{$key}" => $error])->all());
        }

        $name = (string) $resolved['positional'];

        if (is_string($email = $input['answers']['email'] ?? null)) {
            Cache::forever(self::EMAIL_CACHE_KEY, trim($email));
        }

        $run = $runner->start(
            label: "Create {$framework['label']} app {$name} on {$box['name']}",
            arguments: $frameworks->scaffoldArguments($framework, $name, $resolved['flags']),
            kind: RunKind::NewDevBoxProject,
            subject: $name,
            meta: ['server' => $box['name'], 'role' => 'dev', 'app' => $name],
            targetType: 'server',
            targetName: $box['name'],
            serverName: $box['name'],
            devBox: $box,
        );

        return to_route('projects.create', ['run' => $run->id, 'framework' => $input['framework'], 'name' => $name]);
    }

    /** Runs a failed or cancelled create again, with the same answers, if nothing was left behind. */
    public function retry(Project $project, CliRunner $runner): RedirectResponse
    {
        $last = $this->lastScaffold($project);

        abort_unless($last !== null && $this->canRetry($project, $last), 404);

        $projectName = $last->project_name ?? $this->name($project);

        $run = $runner->start(
            label: $last->label,
            arguments: $this->recordedArguments($last),
            kind: RunKind::NewProject,
            subject: "project:{$project->id}",
            meta: $last->meta ?? [],
            cwd: $last->meta['cwd'] ?? '',
            targetType: 'project',
            targetName: $last->target_name ?? $projectName,
            projectId: $project->id,
            projectName: $projectName,
            environment: $last->environment ?? 'local',
        );

        return to_route('runs.show', $run);
    }

    public function show(Project $project, StackCatalog $stacks, EditorLauncher $editors, LaravelOptions $laravel, FrameworkCatalog $frameworks, ToolLocator $locator, ProjectServices $services): Response
    {
        $scaffold = $this->lastScaffold($project);

        $inspection = $this->inspector->inspect($project->path);
        $servers = array_values(array_filter($stacks->all() ?? [], fn (array $stack): bool => $stack['status'] === 'ready'));
        $server = null;

        foreach ($servers as $stack) {
            if ($inspection['serverIp'] !== null && $stack['ip'] === $inspection['serverIp']) {
                $server = $stack;
            }
        }

        $enrichedEnvs = [];
        foreach ($inspection['environments'] as $name => $env) {
            $matchedServerName = null;
            if ($env['serverIp'] !== null || $env['serverContext'] !== null) {
                foreach ($servers as $stack) {
                    if (($env['serverIp'] !== null && $stack['ip'] === $env['serverIp'])
                        || ($env['serverContext'] !== null && is_string($stack['context'] ?? null) && $stack['context'] === $env['serverContext'])) {
                        $matchedServerName = $stack['name'];
                        break;
                    }
                }
            }
            $enrichedEnvs[$name] = $env + ['serverName' => $matchedServerName];
        }
        $inspection['environments'] = $enrichedEnvs;

        $latestRun = Run::query()
            ->where(fn ($q) => $q->where('project_id', $project->id)->orWhere('subject', "project:{$project->id}"))
            ->latest('id')
            ->first();

        return Inertia::render('projects/show', [
            'project' => ['id' => $project->id, 'localStatus' => $this->resolveLocalStatus($project, $inspection, $latestRun, $this->localWorkloadStatuses($locator))] + $inspection,
            'server' => $server,
            'frameworks' => $this->inspector->deployableFrameworks(),
            'runs' => Run::query()
                ->where(fn ($q) => $q->where('project_id', $project->id)->orWhere('subject', "project:{$project->id}"))
                ->latest('id')
                ->limit(20)
                ->get()
                ->map(fn (Run $run): array => [
                    'id' => $run->id,
                    'label' => $run->label,
                    'kind' => $run->kind?->value,
                    'status' => $run->status->value,
                    'created_at' => $run->created_at?->toIso8601String() ?? '',
                    'environment' => $run->environment ?: $this->resolveRunEnvironment($run),
                ])
                ->all(),
            'latestRun' => $latestRun ? [
                'id' => $latestRun->id,
                'label' => $latestRun->label,
                'kind' => $latestRun->kind?->value,
                'status' => $latestRun->status->value,
                'output' => (string) $latestRun->output,
                'startedAt' => $latestRun->created_at?->toISOString(),
                'finishedAt' => $latestRun->finished_at?->toISOString(),
                'environment' => $latestRun->environment ?: $this->resolveRunEnvironment($latestRun),
            ] : null,
            'editors' => $editors->available(),
            'readyServers' => array_map(fn (array $stack): array => ['name' => $stack['name'], 'ip' => $stack['ip']], $servers),
            'scaffold' => $scaffold === null ? null : ['id' => $scaffold->id, 'status' => $scaffold->status, 'canRetry' => $this->canRetry($project, $scaffold)],
            'wizardFrameworks' => $this->initEmailFrameworks($frameworks),
            'email' => (string) Cache::get(self::EMAIL_CACHE_KEY, ''),
            'laravelOptions' => Inertia::optional(fn (): ?array => $laravel->questions()),
            // Where each environment's database, cache and storage run, from the CLI.
            'backing' => Inertia::defer(fn (): array => collect(array_keys($inspection['environments']))
                ->mapWithKeys(fn (string $environment): array => [$environment => $services->get($project->path, $environment)])
                ->all()),
        ]);
    }

    /** The same, for one environment, with the secrets in it: what "reveal" fetches. */
    public function services(Request $request, Project $project, ProjectServices $services): JsonResponse
    {
        $environment = $request->validate(['environment' => ['required', 'string', 'alpha_dash']])['environment'];
        $result = $services->get($project->path, $environment, reveal: true);

        abort_if($result === null, 404);

        return response()->json($result)->header('Cache-Control', 'no-store');
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

    public function init(Request $request, Project $project, CliRunner $runner, LaravelOptions $laravel, FrameworkCatalog $frameworks): RedirectResponse
    {
        $framework = $request->validate(['framework' => ['required', Rule::in(array_keys($this->inspector->deployableFrameworks()))]])['framework'];
        $extra = [];

        if (in_array($framework, $this->initEmailFrameworks($frameworks), true)) {
            // An existing app's frontend is detected, never set from the form.
            $extra = $this->wizardFlags($request, $laravel, withOptions: $framework === 'laravel', skip: ['frontend']);

            if ($extra instanceof RedirectResponse) {
                return $extra;
            }
        }

        return $this->run($runner, $project, RunKind::InitProject, 'Set up '.basename($project->path).' for LaraKube', ['init', "--framework={$framework}", '--fast', ...$extra], 'local');
    }

    /**
     * Creates the project's cloud environment bound to one of the user's ready
     * servers: `env` with every wizard answer as a flag, so nothing prompts.
     */
    public function link(Request $request, Project $project, CliRunner $runner, StackCatalog $stacks): RedirectResponse
    {
        $validated = $request->validate([
            'server' => ['required', 'string'],
            'environment' => ['nullable', 'string', 'alpha_dash'],
        ]);
        $environment = $validated['environment'] ?? self::ENVIRONMENT;
        $name = $validated['server'];
        $server = $stacks->find($name);

        if ($server === null || $server['status'] !== 'ready' || ! is_string($server['context'])) {
            return back()->withErrors(['server' => 'Choose one of your ready servers.']);
        }

        $args = [
            'env', $environment, "--context={$server['context']}", '--ingress=traefik', '--managed=', '--web-hosts=',
        ];

        if (! empty($server['sshKey'])) {
            $args[] = "--ssh-key={$server['sshKey']}";
        }

        return $this->run($runner, $project, RunKind::LinkServer, "Link {$this->name($project)} ({$environment}) to {$name}", $args, $environment);
    }

    public function host(Request $request, Project $project, CliRunner $runner): RedirectResponse
    {
        $validated = $request->validate([
            'host' => ['required', 'string', 'max:253', 'regex:/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/'],
            'environment' => ['nullable', 'string', 'alpha_dash'],
        ], ['host.regex' => 'Enter a hostname like app.example.com, without https://.']);

        $environment = $validated['environment'] ?? self::ENVIRONMENT;
        $host = $validated['host'];

        return $this->run($runner, $project, RunKind::ConfigureHost, "Set the address of {$this->name($project)} ({$environment})", ['cloud:configure', $environment, '--only=hosts', "--web-host={$host}"], $environment);
    }

    public function deploy(Request $request, Project $project, CliRunner $runner): RedirectResponse
    {
        $environment = (string) $request->input('environment', self::ENVIRONMENT);

        $running = Run::query()
            ->where(fn ($q) => $q->where('project_id', $project->id)->orWhere('subject', "project:{$project->id}"))
            ->where('kind', RunKind::DeployApp)
            ->where('status', RunStatus::Running)
            ->first();

        if ($running !== null) {
            return to_route('projects.show', $project);
        }

        return $this->run($runner, $project, RunKind::DeployApp, "Deploy {$this->name($project)} ({$environment})", ['cloud:deploy', $environment], $environment);
    }

    public function up(Request $request, Project $project, CliRunner $runner): RedirectResponse
    {
        $environment = (string) $request->input('environment', 'local');
        $args = ['up', $environment, '--no-console', '--no-test'];

        return $this->run($runner, $project, RunKind::UpProject, "Up {$this->name($project)} ({$environment})", $args, $environment);
    }

    public function down(Request $request, Project $project, CliRunner $runner): RedirectResponse
    {
        $environment = (string) $request->input('environment', 'local');
        $purge = $request->boolean('purge');

        // A purge deletes the project's data volumes, so the project's name has to be typed back.
        if ($purge && $request->string('confirm')->toString() !== $this->name($project)) {
            return back()->withErrors(['confirm' => 'Type the project name to confirm purging its data.']);
        }

        $args = ['down', $environment, '--force'];
        if ($purge) {
            $args[] = '--full';
        }

        $label = $purge
            ? "Down & Purge {$this->name($project)} ({$environment})"
            : "Down {$this->name($project)} ({$environment})";

        return $this->run($runner, $project, RunKind::DownProject, $label, $args, $environment);
    }

    public function stopAll(CliRunner $runner, ToolLocator $locator): RedirectResponse
    {
        $projects = Project::all();
        $workloads = $this->localWorkloadStatuses($locator);

        foreach ($projects as $project) {
            $inspection = $this->inspector->inspect($project->path);
            if (! $inspection['exists'] || ! $inspection['initialized']) {
                continue;
            }

            $appName = $inspection['name'];
            $ns = "{$appName}-local";
            $workload = $workloads[$ns] ?? null;

            if ($workload === null || $workload['replicas'] === 0) {
                continue;
            }

            $this->run(
                $runner,
                $project,
                RunKind::StopProject,
                "Stop {$appName} (local)",
                ['stop', 'local'],
                'local',
            );
        }

        return back();
    }

    public function downAll(Request $request, CliRunner $runner, ToolLocator $locator): RedirectResponse
    {
        $purge = $request->boolean('purge');

        if ($purge && $request->string('confirm')->toString() !== 'purge all') {
            return back()->withErrors(['confirm' => 'Type "purge all" to confirm purging every local project.']);
        }

        $args = ['down', 'local', '--force'];
        if ($purge) {
            $args[] = '--full';
        }

        $projects = Project::all();
        $workloads = $this->localWorkloadStatuses($locator);

        foreach ($projects as $project) {
            $inspection = $this->inspector->inspect($project->path);
            if (! $inspection['exists'] || ! $inspection['initialized']) {
                continue;
            }

            $appName = $inspection['name'];
            $ns = "{$appName}-local";
            $workload = $workloads[$ns] ?? null;

            if ($workload === null && ! $purge) {
                continue;
            }

            $label = $purge
                ? "Down & Purge {$appName} (local)"
                : "Down {$appName} (local)";

            $this->run(
                $runner,
                $project,
                RunKind::DownProject,
                $label,
                $args,
                'local',
            );
        }

        return back();
    }

    public function start(Request $request, Project $project, CliRunner $runner): RedirectResponse
    {
        $environment = (string) $request->input('environment', 'local');
        $args = ['start', $environment];

        return $this->run($runner, $project, RunKind::StartProject, "Start {$this->name($project)} ({$environment})", $args, $environment);
    }

    public function stop(Request $request, Project $project, CliRunner $runner): RedirectResponse
    {
        $environment = (string) $request->input('environment', 'local');
        $args = ['stop', $environment];

        return $this->run($runner, $project, RunKind::StopProject, "Stop {$this->name($project)} ({$environment})", $args, $environment);
    }

    public function tld(Request $request, Project $project): RedirectResponse
    {
        $validated = $request->validate([
            'tld' => ['nullable', 'string', 'in:kube,localhost,test,local,internal'],
        ]);

        $blueprintPath = "{$project->path}/.larakube.json";
        if (is_file($blueprintPath)) {
            $data = json_decode((string) file_get_contents($blueprintPath), true);
            if (is_array($data)) {
                $tld = $validated['tld'] ?? null;
                $data['localTld'] = ! empty($tld) ? ltrim(strtolower(trim($tld)), '.') : null;
                file_put_contents($blueprintPath, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            }
        }

        return back();
    }

    /**
     * Whether $path is under the home folder. $allowHome also accepts the home
     * folder itself: fine to create an app in, not to add as a project.
     */
    private function insideHome(string $path, bool $allowHome = false): bool
    {
        $home = ToolLocator::home();
        $resolved = realpath($path) ?: $path;

        return $home !== '' && $path !== '' && (str_starts_with($resolved, $home.'/') || ($allowHome && $resolved === $home));
    }

    /**
     * The frameworks whose `init` wizard asks for a Let's Encrypt email, as the CLI says.
     *
     * @return list<string>
     */
    private function initEmailFrameworks(FrameworkCatalog $frameworks): array
    {
        return array_column(array_filter($frameworks->catalog()['frameworks'] ?? [], fn (array $framework): bool => ! empty($framework['initEmail'])), 'slug');
    }

    /**
     * The wizard's answers as LaraKube CLI flags: the Let's Encrypt email and,
     * with $withOptions, the Laravel options form (minus the $skip questions).
     *
     * @param  list<string>  $skip
     * @return list<string>|RedirectResponse
     */
    private function wizardFlags(Request $request, LaravelOptions $laravel, bool $withOptions, array $skip = []): array|RedirectResponse
    {
        if ($withOptions && $laravel->questions() === null) {
            return back()->withErrors(['framework' => 'Update the LaraKube CLI from Setup to set up Laravel apps.']);
        }

        $email = $request->validate(['email' => ['required', 'email']])['email'];
        $flags = [];

        if ($withOptions) {
            $answers = $request->input('laravel', []);
            $resolved = $laravel->flags(array_diff_key(is_array($answers) ? $answers : [], array_flip($skip)));

            if ($resolved['errors'] !== []) {
                return back()->withErrors(collect($resolved['errors'])->mapWithKeys(fn (string $error, string $key): array => ["laravel.{$key}" => $error])->all());
            }

            $flags = $resolved['flags'];
        }

        Cache::forever(self::EMAIL_CACHE_KEY, $email);

        return ["--email={$email}", ...$flags];
    }

    private function lastScaffold(Project $project): ?Run
    {
        return Run::query()
            ->where(fn ($q) => $q->where('project_id', $project->id)->orWhere('subject', "project:{$project->id}"))
            ->where('kind', RunKind::NewProject)
            ->latest('id')
            ->first();
    }

    /**
     * A create can run again when it failed or was cancelled, recorded what it
     * ran, and left no folder behind to collide with.
     */
    private function canRetry(Project $project, Run $run): bool
    {
        return in_array($run->status, [RunStatus::Failed, RunStatus::Cancelled], true)
            && $this->recordedArguments($run) !== []
            && is_dir($run->meta['cwd'] ?? '')
            && ! file_exists($project->path);
    }

    /**
     * What a create run ran, as recorded in its meta.
     *
     * @return list<string>
     */
    private function recordedArguments(Run $run): array
    {
        $decoded = json_decode($run->meta['arguments'] ?? '', true);

        return is_array($decoded) ? array_values(array_filter($decoded, is_string(...))) : [];
    }

    private function name(Project $project): string
    {
        return $this->inspector->inspect($project->path)['name'];
    }

    private function resolveRunEnvironment(Run $run): string
    {
        if ($run->environment !== null && $run->environment !== '') {
            return $run->environment;
        }

        $meta = $run->meta;
        if (is_array($meta) && ! empty($meta['environment'])) {
            return strtolower(trim((string) $meta['environment']));
        }

        if (preg_match('/\(([^)]+)\)/', $run->label, $matches)) {
            return strtolower(trim($matches[1]));
        }

        if (in_array($run->kind, [RunKind::UpProject, RunKind::DownProject, RunKind::StartProject, RunKind::StopProject, RunKind::InitProject, RunKind::NewProject], true)) {
            return 'local';
        }

        if (in_array($run->kind, [RunKind::DeployApp, RunKind::LinkServer, RunKind::ConfigureHost], true)) {
            return 'production';
        }

        return 'local';
    }

    /**
     * @param  list<string>  $arguments
     */
    private function run(CliRunner $runner, Project $project, RunKind $kind, string $label, array $arguments, ?string $environment = null): RedirectResponse
    {
        abort_unless(is_dir($project->path), 404);

        $projectName = $this->name($project);
        $env = $environment !== null && $environment !== '' ? $environment : 'local';

        $meta = ['project' => (string) $project->id];
        if ($environment !== null && $environment !== '') {
            $meta['environment'] = $environment;
        }

        $run = $runner->start(
            label: $label,
            arguments: $arguments,
            kind: $kind,
            subject: "project:{$project->id}",
            meta: $meta,
            cwd: $project->path,
            targetType: 'project',
            targetName: $projectName,
            projectId: $project->id,
            projectName: $projectName,
            environment: $env,
        );

        return back();
    }

    /**
     * @return array<string, array{replicas: int, readyReplicas: int, deploymentsCount: int}>
     */
    private function localWorkloadStatuses(ToolLocator $locator): array
    {
        $cli = $locator->find('kubectl');
        if ($cli === null) {
            return [];
        }

        try {
            $isolated = $locator->isolate([$cli, 'get', 'deployments,statefulsets', '-A', '-o', 'json']);
            $result = Process::env($isolated['environment'])->timeout(2)->run($isolated['command']);
            if (! $result->successful()) {
                return [];
            }

            $items = json_decode($result->output(), true)['items'] ?? [];
            if (! is_array($items)) {
                return [];
            }

            $namespaces = [];
            foreach ($items as $item) {
                $ns = (string) ($item['metadata']['namespace'] ?? '');
                if (! str_ends_with($ns, '-local')) {
                    continue;
                }

                $replicas = (int) ($item['spec']['replicas'] ?? 0);
                $readyReplicas = (int) ($item['status']['readyReplicas'] ?? 0);

                $namespaces[$ns] ??= ['replicas' => 0, 'readyReplicas' => 0, 'deploymentsCount' => 0];
                $namespaces[$ns]['replicas'] += $replicas;
                $namespaces[$ns]['readyReplicas'] += $readyReplicas;
                $namespaces[$ns]['deploymentsCount']++;
            }

            return $namespaces;
        } catch (\Throwable) {
            return [];
        }
    }

    /**
     * @param  array<string, mixed>  $inspection
     * @param  array<string, array{replicas: int, readyReplicas: int, deploymentsCount: int}>  $workloads
     * @return array{state: 'running'|'paused'|'starting'|'stopping'|'down'|'uninitialized', label: string, tone: 'ok'|'warn'|'busy'|'muted', domain?: string, replicas?: int, readyReplicas?: int}
     */
    private function resolveLocalStatus(Project $project, array $inspection, ?Run $activeRun, array $workloads): array
    {
        if (! $inspection['exists'] || ! $inspection['initialized']) {
            return [
                'state' => 'uninitialized',
                'label' => 'Not set up',
                'tone' => 'muted',
            ];
        }

        $appName = $inspection['name'];
        $effectiveTld = (string) ($inspection['effectiveTld'] ?? 'test');
        $domain = "{$appName}.{$effectiveTld}";

        if ($activeRun !== null) {
            $isStopping = in_array($activeRun->kind, [RunKind::StopProject, RunKind::DownProject], true);

            return [
                'state' => $isStopping ? 'stopping' : 'starting',
                'label' => $isStopping ? 'Stopping…' : 'Starting…',
                'tone' => 'busy',
                'domain' => $domain,
            ];
        }

        $ns = "{$appName}-local";
        $workload = $workloads[$ns] ?? null;

        if ($workload !== null) {
            if ($workload['readyReplicas'] > 0) {
                return [
                    'state' => 'running',
                    'label' => 'Running',
                    'tone' => 'ok',
                    'domain' => $domain,
                    'replicas' => $workload['replicas'],
                    'readyReplicas' => $workload['readyReplicas'],
                ];
            }

            if ($workload['replicas'] === 0) {
                return [
                    'state' => 'paused',
                    'label' => 'Paused',
                    'tone' => 'warn',
                    'domain' => $domain,
                    'replicas' => 0,
                    'readyReplicas' => 0,
                ];
            }

            return [
                'state' => 'starting',
                'label' => 'Starting…',
                'tone' => 'busy',
                'domain' => $domain,
                'replicas' => $workload['replicas'],
                'readyReplicas' => $workload['readyReplicas'],
            ];
        }

        return [
            'state' => 'down',
            'label' => 'Down',
            'tone' => 'muted',
            'domain' => $domain,
        ];
    }
}
