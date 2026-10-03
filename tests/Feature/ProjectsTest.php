<?php

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Models\Project;
use App\Models\Run;
use App\Services\FolderPicker;
use App\Services\LaraKube\LaravelOptions;
use App\Services\LaraKube\ProjectInspector;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Inertia\Testing\AssertableInertia;
use Native\Desktop\Facades\ChildProcess;

/**
 * A fake HOME holding a fake larakube and an app folder, so projects pass
 * the "inside your home folder" check.
 *
 * @return array{home: string, bin: string, app: string}
 */
function projectsSandbox(): array
{
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    $bin = "{$home}/bin";
    $app = "{$home}/code/shop";
    File::ensureDirectoryExists($bin);
    File::ensureDirectoryExists($app);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    $_SERVER['HOME'] = realpath($home);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    return ['home' => realpath($home), 'bin' => $bin, 'app' => realpath($app)];
}

function projectsPicker(?string $path): void
{
    app()->instance(FolderPicker::class, new class($path) extends FolderPicker
    {
        public function __construct(private ?string $path) {}

        public function pick(string $title): ?string
        {
            return $this->path;
        }
    });
}

function projectsStacks(): void
{
    Process::fake(['*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
        ['name' => 'workshop-demo', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'asia-east1', 'ip' => '203.0.113.21', 'context' => 'larakube-203.0.113.21', 'account' => null, 'projectId' => null, 'status' => 'ready'],
    ]]))]);
}

test('adding a project takes a folder inside the home folder only', function () {
    $sandbox = projectsSandbox();

    projectsPicker('/etc');
    $this->post(route('projects.store'))->assertSessionHasErrors('path');
    expect(Project::count())->toBe(0);

    projectsPicker($sandbox['app']);
    $this->post(route('projects.store'))->assertRedirect(route('projects.show', Project::sole()));
    expect(Project::sole()->path)->toBe($sandbox['app']);

    File::deleteDirectory($sandbox['home']);
});

test('a project page reads its framework, host and bound server from the .larakube files', function () {
    $sandbox = projectsSandbox();
    projectsStacks();
    projectsFrameworks();
    File::put("{$sandbox['app']}/.larakube.json", json_encode(['name' => 'shop', 'framework' => 'astro', 'environments' => ['production' => ['hosts' => ['web' => 'shop.example.com']]]]));
    File::put("{$sandbox['app']}/.larakube.local.json", json_encode(['environments' => ['production' => ['cloud' => ['ip' => '203.0.113.21']]]]));
    $project = Project::create(['path' => $sandbox['app']]);

    $this->get(route('projects.show', $project))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('projects/show')
            ->where('project.framework', 'astro')
            ->where('project.webHost', 'shop.example.com')
            ->where('project.deployable', true)
            ->where('project.environments.production.serverName', 'workshop-demo')
            ->where('server.name', 'workshop-demo'));

    File::deleteDirectory($sandbox['home']);
});

test('set up, address and deploy run the CLI inside the project folder', function () {
    $sandbox = projectsSandbox();
    projectsFrameworks();
    $project = Project::create(['path' => $sandbox['app']]);
    $fake = ChildProcess::fake();

    $this->post(route('projects.init', $project), ['framework' => 'rails'])->assertSessionHasErrors('framework');
    $this->post(route('projects.init', $project), ['framework' => 'vite'])->assertRedirect();
    $this->post(route('projects.host', $project), ['host' => 'https://shop.example.com'])->assertSessionHasErrors('host');
    $this->post(route('projects.host', $project), ['host' => 'shop.example.com'])->assertRedirect();
    $this->post(route('projects.deploy', $project))->assertRedirect();

    $bin = "{$sandbox['bin']}/larakube";
    foreach ([
        ['init', '--framework=vite', '--fast'],
        ['cloud:configure', 'production', '--only=hosts', '--web-host=shop.example.com'],
        ['cloud:deploy', 'production'],
    ] as $arguments) {
        $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [$bin, ...$arguments, '--no-interaction'] && $cwd === $sandbox['app']);
    }

    expect(Run::pluck('kind')->all())->toBe([RunKind::InitProject, RunKind::ConfigureHost, RunKind::DeployApp])
        ->and(Run::first()->subject)->toBe("project:{$project->id}");

    File::deleteDirectory($sandbox['home']);
});

test('multi-environment server linking, host configuration, and deployment', function () {
    $sandbox = projectsSandbox();
    projectsStacks();
    $project = Project::create(['path' => $sandbox['app']]);
    $fake = ChildProcess::fake();

    $this->post(route('projects.link', $project), ['server' => 'workshop-demo', 'environment' => 'staging'])->assertRedirect();
    $this->post(route('projects.host', $project), ['host' => 'staging.example.com', 'environment' => 'staging'])->assertRedirect();
    $this->post(route('projects.deploy', $project), ['environment' => 'staging'])->assertRedirect();

    $bin = "{$sandbox['bin']}/larakube";
    foreach ([
        ['env', 'staging', '--context=larakube-203.0.113.21', '--ingress=traefik', '--managed=', '--web-hosts='],
        ['cloud:configure', 'staging', '--only=hosts', '--web-host=staging.example.com'],
        ['cloud:deploy', 'staging'],
    ] as $arguments) {
        $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [$bin, ...$arguments, '--no-interaction'] && $cwd === $sandbox['app']);
    }

    expect(Run::where('subject', "project:{$project->id}")->get()->pluck('meta.environment')->all())
        ->toBe(['staging', 'staging', 'staging']);

    $this->get(route('projects.show', $project))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('projects/show')
            ->has('runs', 3)
            ->where('runs.0.environment', 'staging')
        );

    File::deleteDirectory($sandbox['home']);
});

test('creating a server for a project binds its production environment', function () {
    $sandbox = projectsSandbox();
    $project = Project::create(['path' => $sandbox['app']]);
    $fake = ChildProcess::fake();

    $this->post(route('servers.store'), ['provider' => 'do', 'stack_name' => 'shop-server', 'region' => 'sgp1', 'size' => 's-1vcpu-2gb', 'api_token' => 't', 'project_id' => $project->id])
        ->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => end($cmd) === '--no-interaction'
        && $cmd[count($cmd) - 2] === 'production'
        && $cwd === $sandbox['app']);

    File::deleteDirectory($sandbox['home']);
});

test('framework detection preselects the right deployable framework', function (array $files, ?string $expected) {
    $sandbox = projectsSandbox();
    foreach ($files as $name => $contents) {
        File::put("{$sandbox['app']}/{$name}", $contents);
    }

    expect(app(ProjectInspector::class)->detect($sandbox['app']))->toBe($expected);

    File::deleteDirectory($sandbox['home']);
})->with([
    'laravel' => [['artisan' => '', 'composer.json' => '{"require":{"laravel/framework":"^13"}}'], 'laravel'],
    'statamic' => [['artisan' => '', 'composer.json' => '{"require":{"statamic/cms":"^6"}}'], 'statamic'],
    'wordpress' => [['wp-config-sample.php' => ''], 'wordpress'],
    'nextjs' => [['package.json' => '{"dependencies":{"next":"16"}}'], 'nextjs'],
    'docusaurus' => [['package.json' => '{"dependencies":{"@docusaurus/core":"3"}}'], 'docusaurus'],
    'astro' => [['package.json' => '{"dependencies":{"astro":"5"}}'], 'astro'],
    'vite' => [['package.json' => '{"devDependencies":{"vite":"8"}}'], 'vite'],
    'unknown' => [['README.md' => ''], null],
]);

test('a new project runs its framework\'s scaffolder in the chosen folder', function (string $framework, array $answers, array $arguments) {
    $sandbox = projectsSandbox();
    $parent = dirname($sandbox['app']);
    projectsFrameworks();
    $fake = ChildProcess::fake();

    $this->post(route('projects.scaffold'), ['framework' => $framework, 'parent' => $parent, 'answers' => ['name' => 'blog'] + $answers])->assertRedirect();

    $bin = "{$sandbox['bin']}/larakube";
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [$bin, ...$arguments, '--no-interaction'] && $cwd === $parent);

    $project = Project::sole();
    expect($project->path)->toBe("{$parent}/blog")
        ->and(Run::sole()->kind)->toBe(RunKind::NewProject)
        ->and(Run::sole()->meta)->toBe(['project' => (string) $project->id, 'arguments' => json_encode($arguments), 'cwd' => $parent]);

    File::deleteDirectory($sandbox['home']);
})->with([
    'vite' => ['vite', ['template' => 'react-ts'], ['vite:new', 'blog', '--fast', '--template=react-ts']],
    'astro' => ['astro', [], ['astro:new', 'blog', '--fast']],
]);

test('a new project refuses bad names, taken folders and folders outside home', function () {
    $sandbox = projectsSandbox();
    $parent = dirname($sandbox['app']);
    projectsFrameworks();
    ChildProcess::fake();
    $answers = fn (string $name): array => ['name' => $name, 'template' => 'react-ts'];

    $this->post(route('projects.scaffold'), ['framework' => 'vite', 'parent' => $parent, 'answers' => $answers('My App')])->assertSessionHasErrors('answers.name');
    $this->post(route('projects.scaffold'), ['framework' => 'vite', 'parent' => $parent, 'answers' => $answers('console')])->assertSessionHasErrors('answers.name');
    $this->post(route('projects.scaffold'), ['framework' => 'vite', 'parent' => $parent, 'answers' => $answers('shop')])->assertSessionHasErrors('answers.name');
    $this->post(route('projects.scaffold'), ['framework' => 'rails', 'parent' => $parent, 'answers' => $answers('blog')])->assertSessionHasErrors('framework');
    $this->post(route('projects.scaffold'), ['framework' => 'vite', 'parent' => '/tmp', 'answers' => $answers('blog')])->assertSessionHasErrors('parent');

    expect(Project::count())->toBe(0)->and(Run::count())->toBe(0);

    File::deleteDirectory($sandbox['home']);
});

test('choosing where to create a project keeps what was typed', function () {
    $sandbox = projectsSandbox();
    $parent = dirname($sandbox['app']);

    projectsPicker($parent);
    $this->post(route('projects.choose-folder'), ['name' => 'blog', 'framework' => 'astro'])
        ->assertRedirect(route('projects.create', ['name' => 'blog', 'framework' => 'astro', 'parent' => $parent]));

    projectsPicker('/etc');
    $this->post(route('projects.choose-folder'), ['name' => 'blog'])->assertSessionHasErrors('parent');

    projectsFrameworks();
    $this->get(route('projects.create', ['parent' => $parent, 'name' => 'blog', 'framework' => 'astro']))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('projects/create')
            ->where('parent', $parent)
            ->where('name', 'blog')
            ->where('framework', 'astro'));

    File::deleteDirectory($sandbox['home']);
});

/**
 * What `new:frameworks --json` sends: a trimmed catalog with the shapes the form depends on.
 */
function projectsFrameworks(bool $available = true): void
{
    $option = fn (string $value, array $unavailableWith = []): array => ['value' => $value, 'label' => ucfirst($value), 'flag' => "--{$value}", 'unavailableWith' => $unavailableWith];
    $name = ['key' => 'name', 'type' => 'text', 'label' => 'App name', 'description' => 'Lowercase letters, numbers and dashes.', 'required' => true, 'arg' => 'positional', 'pattern' => '^[a-z][a-z0-9]*(-[a-z0-9]+)*$', 'maxLength' => 50, 'reserved' => ['console'], 'group' => 'essential'];
    $email = ['key' => 'email', 'type' => 'text', 'label' => 'Your email', 'required' => true, 'flag' => '--email=', 'format' => 'email', 'group' => 'essential'];
    $select = fn (string $key, string $label, array $options, array $extra = []): array => array_replace(['key' => $key, 'type' => 'select', 'label' => $label, 'required' => true, 'multiple' => false, 'nullable' => false, 'default' => null, 'options' => $options, 'group' => 'advanced'], $extra);
    $framework = fn (string $slug, string $label, string $category, array $fields, array $extra = []): array => array_replace(['slug' => $slug, 'label' => $label, 'description' => "{$label} app", 'category' => $category, 'tech' => 'PHP', 'logo' => $slug, 'deployable' => true, 'hidden' => false, 'comingSoon' => false, 'command' => "{$slug}:new", 'args' => ['--fast'], 'fields' => $fields], $extra);

    $optOut = ['key' => 'selfContained', 'type' => 'confirm', 'role' => 'commons-opt-out', 'label' => 'Keep this app self-contained', 'required' => false, 'default' => false, 'flag' => '--no-plex', 'group' => 'essential'];
    $laravel = $framework('laravel', 'Laravel', 'fullstack', [
        $name, $email,
        $select('server', 'Server variation', [$option('fpm-nginx'), $option('frankenphp')], ['default' => 'frankenphp', 'suggested' => 'fpm-nginx', 'implies' => ['frankenphp' => ['features' => 'octane']]]),
        $select('frontend', 'Frontend stack', [$option('react'), $option('vue')], ['required' => false, 'nullable' => true, 'suggested' => 'react', 'group' => 'essential']),
        ['key' => 'features', 'type' => 'multiselect', 'label' => 'Laravel features', 'required' => false, 'multiple' => true, 'nullable' => false, 'default' => null, 'options' => [$option('queues'), $option('horizon'), $option('scout'), $option('octane', ['frankenphp'])], 'conflicts' => [['horizon', 'queues']], 'group' => 'advanced'],
        $select('search', 'Search driver for Scout', [$option('meilisearch')], ['default' => 'meilisearch', 'visibleWhen' => ['features' => 'scout'], 'requiresFeature' => 'scout']),
        $select('database', 'Database', [$option('mysql') + ['commons' => 'mysql'], $option('postgres') + ['commons' => 'postgres'], $option('sqlite', ['frankenphp'])], ['default' => 'mysql', 'suggested' => 'postgres', 'group' => 'essential']),
        $optOut,
    ], ['command' => 'new', 'initEmail' => true]);
    $statamic = $framework('statamic', 'Statamic', 'cms', [$name, $email, $select('content', 'Where content lives', [['value' => 'database', 'label' => 'Database'], ['value' => 'files', 'label' => 'Files']], ['default' => 'database', 'flag' => '--content='])], ['args' => ['--fast', '--no-plex'], 'initEmail' => true]);
    $vite = $framework('vite', 'Vite', 'frontend', [$name, $select('template', 'Template', [['value' => 'react-ts', 'label' => 'React'], ['value' => 'vue-ts', 'label' => 'Vue']], ['default' => 'react-ts', 'flag' => '--template=', 'group' => 'essential']), ['key' => 'typescript', 'type' => 'confirm', 'label' => 'Use TypeScript', 'required' => false, 'default' => true, 'flag' => '--typescript', 'group' => 'essential']]);
    $astro = $framework('astro', 'Astro', 'frontend', [$name]);
    $wordpress = $framework('wordpress', 'WordPress', 'cms', [$name], ['hidden' => true]);
    $emdash = $framework('emdash', 'Emdash', 'cms', [$name], ['comingSoon' => true]);

    Process::fake(['*new:frameworks*' => $available
        ? Process::result(output: json_encode(['success' => true, 'categories' => [['id' => 'fullstack', 'label' => 'Full Stack'], ['id' => 'cms', 'label' => 'CMS'], ['id' => 'frontend', 'label' => 'Frontend']], 'frameworks' => [$laravel, $statamic, $vite, $astro, $wordpress, $emdash]]))
        : Process::result(errorOutput: 'Command "new:frameworks" is not defined.', exitCode: 1)]);
}

test('the New project page lists what the CLI offers, minus what it hides', function () {
    $sandbox = projectsSandbox();
    projectsFrameworks();

    $this->get(route('projects.create', ['framework' => 'wordpress']))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('projects/create')
            ->where('framework', 'laravel')
            ->loadDeferredProps(fn (AssertableInertia $page) => $page
                ->has('catalog.frameworks', 5)
                ->has('catalog.categories', 3)
                ->where('catalog.frameworks.0.slug', 'laravel')));

    File::deleteDirectory($sandbox['home']);
});

test('the Laravel form starts from what the CLI suggests, not its --fast defaults', function () {
    projectsSandbox();
    projectsFrameworks();

    $questions = collect(app(LaravelOptions::class)->questions())->keyBy('key');

    expect($questions['server']['default'])->toBe('fpm-nginx')
        ->and($questions['database']['default'])->toBe('postgres')
        ->and($questions['frontend']['default'])->toBe('react')
        ->and($questions['features']['default'])->toBeNull()
        ->and($questions->has('name'))->toBeFalse();
});

test('a new Laravel app turns the form answers into new flags', function () {
    $sandbox = projectsSandbox();
    $parent = dirname($sandbox['app']);
    projectsFrameworks();
    $fake = ChildProcess::fake();

    $this->post(route('projects.scaffold'), [
        'framework' => 'laravel', 'parent' => $parent,
        'answers' => ['name' => 'blog', 'email' => 'dev@example.com', 'server' => 'fpm-nginx', 'frontend' => 'react', 'features' => ['queues', 'octane'], 'database' => 'postgres'],
    ])->assertRedirect();

    $bin = "{$sandbox['bin']}/larakube";
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'new', 'blog', '--fast', '--email=dev@example.com', '--fpm-nginx', '--react', '--queues', '--octane', '--postgres', '--no-interaction',
    ] && $cwd === $parent);

    File::deleteDirectory($sandbox['home']);
});

test('any framework is created from its own schema: its command, fixed arguments and flags', function () {
    $sandbox = projectsSandbox();
    $parent = dirname($sandbox['app']);
    projectsFrameworks();
    $fake = ChildProcess::fake();

    $this->post(route('projects.scaffold'), ['framework' => 'statamic', 'parent' => $parent, 'answers' => ['name' => 'site', 'email' => 'dev@example.com', 'content' => 'files']])->assertRedirect();
    $this->post(route('projects.scaffold'), ['framework' => 'vite', 'parent' => $parent, 'answers' => ['name' => 'spa', 'template' => 'vue-ts', 'typescript' => true]])->assertRedirect();

    $bin = "{$sandbox['bin']}/larakube";
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [$bin, 'statamic:new', 'site', '--fast', '--no-plex', '--email=dev@example.com', '--content=files', '--no-interaction']);
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [$bin, 'vite:new', 'spa', '--fast', '--template=vue-ts', '--typescript', '--no-interaction']);

    File::deleteDirectory($sandbox['home']);
});

test('a new app refuses answers the CLI would not offer', function (array $overrides, string $error) {
    $sandbox = projectsSandbox();
    projectsFrameworks();
    ChildProcess::fake();

    $this->post(route('projects.scaffold'), array_replace_recursive([
        'framework' => 'laravel', 'parent' => dirname($sandbox['app']),
        'answers' => ['name' => 'blog', 'email' => 'dev@example.com', 'server' => 'frankenphp', 'frontend' => null, 'features' => [], 'database' => 'mysql'],
    ], $overrides))->assertSessionHasErrors($error);

    expect(Run::count())->toBe(0)->and(Project::count())->toBe(0);

    File::deleteDirectory($sandbox['home']);
})->with([
    'SQLite on FrankenPHP' => [['answers' => ['database' => 'sqlite']], 'answers.database'],
    'Octane named on FrankenPHP' => [['answers' => ['features' => ['octane']]], 'answers.features'],
    'Horizon with Queues' => [['answers' => ['features' => ['horizon', 'queues']]], 'answers.features'],
    'no database' => [['answers' => ['database' => null]], 'answers.database'],
    'no email' => [['answers' => ['email' => '']], 'answers.email'],
    'a bad email' => [['answers' => ['email' => 'nope']], 'answers.email'],
    'a bad name' => [['answers' => ['name' => 'My App']], 'answers.name'],
    'the reserved name' => [['answers' => ['name' => 'console']], 'answers.name'],
]);

test('a new app needs a LaraKube CLI that lists its frameworks, and never a hidden one', function (string $framework, bool $available) {
    $sandbox = projectsSandbox();
    projectsFrameworks($available);
    ChildProcess::fake();

    $this->post(route('projects.scaffold'), ['framework' => $framework, 'parent' => dirname($sandbox['app']), 'answers' => ['name' => 'blog', 'email' => 'dev@example.com']])
        ->assertSessionHasErrors('framework');

    expect(Run::count())->toBe(0);

    File::deleteDirectory($sandbox['home']);
})->with([
    'an old CLI' => ['laravel', false],
    'a hidden framework' => ['wordpress', true],
    'an unknown framework' => ['cobol', true],
]);

test('a new project can go straight into the home folder, the form\'s default', function () {
    $sandbox = projectsSandbox();
    $fake = ChildProcess::fake();

    projectsFrameworks();
    $this->post(route('projects.scaffold'), ['framework' => 'vite', 'parent' => $sandbox['home'], 'answers' => ['name' => 'blog', 'template' => 'react-ts']])->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => $cwd === $sandbox['home']);
    expect(Project::sole()->path)->toBe("{$sandbox['home']}/blog");

    // Adding the home folder itself as a project is still refused.
    projectsPicker($sandbox['home']);
    $this->post(route('projects.store'))->assertSessionHasErrors('path');

    File::deleteDirectory($sandbox['home']);
});

/**
 * A create run that ended with $status, for a project whose folder was never made.
 *
 * @param  array<string, string>|null  $meta
 */
function projectsFailedScaffold(string $parent, RunStatus $status = RunStatus::Failed, ?array $meta = null): Project
{
    $project = Project::create(['path' => "{$parent}/blog"]);
    Run::create([
        'label' => 'Create Vite app blog', 'kind' => RunKind::NewProject, 'subject' => "project:{$project->id}", 'status' => $status, 'command' => ['larakube'],
        'meta' => $meta ?? ['project' => (string) $project->id, 'arguments' => json_encode(['vite:new', 'blog', '--fast']), 'cwd' => $parent],
    ]);

    return $project;
}

test('a failed create shows as such on the list and can be tried again with the same answers', function () {
    $sandbox = projectsSandbox();
    $parent = dirname($sandbox['app']);
    $project = projectsFailedScaffold($parent);
    $fake = ChildProcess::fake();

    $this->get(route('projects.index'))
        ->assertInertia(fn (AssertableInertia $page) => $page->where('projects.0.scaffoldStatus', RunStatus::Failed->value)->where('projects.0.exists', false));

    $this->post(route('projects.retry', $project))->assertRedirect();

    $bin = "{$sandbox['bin']}/larakube";
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [$bin, 'vite:new', 'blog', '--fast', '--no-interaction'] && $cwd === $parent);
    expect(Run::query()->latest('id')->first()->status)->toBe(RunStatus::Running);

    File::deleteDirectory($sandbox['home']);
});

test('a create is not retried while running, once its folder exists, or without a record of what it ran', function (Closure $arrange) {
    $sandbox = projectsSandbox();
    $project = $arrange(dirname($sandbox['app']));
    ChildProcess::fake();

    $this->post(route('projects.retry', $project))->assertNotFound();

    File::deleteDirectory($sandbox['home']);
})->with([
    'still running' => [fn (string $parent): Project => projectsFailedScaffold($parent, RunStatus::Running)],
    'folder exists' => [function (string $parent): Project {
        File::ensureDirectoryExists("{$parent}/blog");

        return projectsFailedScaffold($parent);
    }],
    'nothing recorded' => [fn (string $parent): Project => projectsFailedScaffold($parent, meta: ['project' => '1'])],
]);

test('setting up a PHP app passes the email, and Laravel also its options minus the detected frontend', function () {
    $sandbox = projectsSandbox();
    projectsFrameworks();
    $project = Project::create(['path' => $sandbox['app']]);
    $fake = ChildProcess::fake();

    $this->post(route('projects.init', $project), ['framework' => 'statamic'])->assertSessionHasErrors('email');

    $this->post(route('projects.init', $project), ['framework' => 'statamic', 'email' => 'dev@example.com'])->assertRedirect();
    $this->post(route('projects.init', $project), [
        'framework' => 'laravel', 'email' => 'dev@example.com',
        'laravel' => ['server' => 'fpm-nginx', 'frontend' => 'vue', 'features' => [], 'database' => 'postgres'],
    ])->assertRedirect();

    $bin = "{$sandbox['bin']}/larakube";
    foreach ([
        ['init', '--framework=statamic', '--fast', '--email=dev@example.com'],
        ['init', '--framework=laravel', '--fast', '--email=dev@example.com', '--fpm-nginx', '--postgres'],
    ] as $arguments) {
        $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [$bin, ...$arguments, '--no-interaction']);
    }

    File::deleteDirectory($sandbox['home']);
});

test('a blueprint with no framework reads as Laravel, as the LaraKube CLI does', function () {
    $sandbox = projectsSandbox();
    projectsFrameworks();
    File::put("{$sandbox['app']}/.larakube.json", json_encode(['name' => 'shop', 'framework' => null, 'blueprints' => ['laravel']]));

    expect(app(ProjectInspector::class)->inspect($sandbox['app']))
        ->framework->toBe('laravel')
        ->deployable->toBeTrue();

    File::deleteDirectory($sandbox['home']);
});

test('linking a ready server creates the production environment on it, with no prompts', function () {
    $sandbox = projectsSandbox();
    projectsStacks();
    $project = Project::create(['path' => $sandbox['app']]);
    $fake = ChildProcess::fake();

    $this->post(route('projects.link', $project), ['server' => 'not-a-server'])->assertSessionHasErrors('server');
    $this->post(route('projects.link', $project), ['server' => 'workshop-demo'])->assertRedirect();

    $bin = "{$sandbox['bin']}/larakube";
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'env', 'production', '--context=larakube-203.0.113.21', '--ingress=traefik', '--managed=', '--web-hosts=', '--no-interaction',
    ] && $cwd === $sandbox['app']);
    expect(Run::sole()->kind)->toBe(RunKind::LinkServer);

    File::deleteDirectory($sandbox['home']);
});

test('project lifecycle commands dispatch correctly for local and custom environments', function () {
    $sandbox = projectsSandbox();
    $project = Project::create(['path' => $sandbox['app']]);
    $fake = ChildProcess::fake();
    $bin = "{$sandbox['bin']}/larakube";

    $this->post(route('projects.up', $project))->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'up', 'local', '--no-console', '--no-test', '--no-interaction',
    ] && $cwd === $sandbox['app']);

    $this->post(route('projects.down', $project))->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'down', 'local', '--force', '--no-interaction',
    ] && $cwd === $sandbox['app']);

    $this->post(route('projects.start', $project))->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'start', 'local', '--no-interaction',
    ] && $cwd === $sandbox['app']);

    $this->post(route('projects.stop', $project))->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'stop', 'local', '--no-interaction',
    ] && $cwd === $sandbox['app']);

    File::deleteDirectory($sandbox['home']);
});

test('tld endpoint can pin and clear project localTld in blueprint', function () {
    $sandbox = projectsSandbox();
    $project = Project::create(['path' => $sandbox['app']]);
    File::put("{$sandbox['app']}/.larakube.json", json_encode(['name' => 'shop', 'localTld' => null]));

    $this->post(route('projects.tld', $project), ['tld' => 'test'])->assertRedirect();
    $saved = json_decode((string) file_get_contents("{$sandbox['app']}/.larakube.json"), true);
    expect($saved['localTld'])->toBe('test');

    $this->post(route('projects.tld', $project), ['tld' => ''])->assertRedirect();
    $cleared = json_decode((string) file_get_contents("{$sandbox['app']}/.larakube.json"), true);
    expect($cleared['localTld'])->toBeNull();

    File::deleteDirectory($sandbox['home']);
});

test('linking a server supports custom environments like staging', function () {
    $sandbox = projectsSandbox();
    projectsStacks();
    $project = Project::create(['path' => $sandbox['app']]);
    $fake = ChildProcess::fake();

    $this->post(route('projects.link', $project), [
        'server' => 'workshop-demo',
        'environment' => 'staging',
    ])->assertRedirect();

    $bin = "{$sandbox['bin']}/larakube";
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'env', 'staging', '--context=larakube-203.0.113.21', '--ingress=traefik', '--managed=', '--web-hosts=', '--no-interaction',
    ] && $cwd === $sandbox['app']);

    File::deleteDirectory($sandbox['home']);
});

test('a coming soon framework cannot be scaffolded', function () {
    $sandbox = projectsSandbox();
    projectsFrameworks();
    ChildProcess::fake();

    $this->post(route('projects.scaffold'), ['framework' => 'emdash', 'parent' => dirname($sandbox['app']), 'answers' => ['name' => 'my-emdash-blog']])->assertSessionHasErrors('framework');

    expect(Run::count())->toBe(0);

    File::deleteDirectory($sandbox['home']);
});

test('purging a project deletes its data, so its name has to be typed back', function () {
    $sandbox = projectsSandbox();
    $project = Project::create(['path' => $sandbox['app']]);
    $fake = ChildProcess::fake();
    $bin = "{$sandbox['bin']}/larakube";
    $name = basename($sandbox['app']);

    $this->post(route('projects.down', $project), ['purge' => true])->assertSessionHasErrors('confirm');
    $this->post(route('projects.down', $project), ['purge' => true, 'confirm' => 'wrong'])->assertSessionHasErrors('confirm');
    expect(Run::count())->toBe(0);

    $this->post(route('projects.down', $project), ['purge' => true, 'confirm' => $name])->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'down', 'local', '--force', '--full', '--no-interaction',
    ]);

    File::deleteDirectory($sandbox['home']);
});

test('purging every local project needs "purge all" typed', function () {
    $sandbox = projectsSandbox();
    Project::create(['path' => $sandbox['app']]);
    ChildProcess::fake();

    $this->post(route('projects.down-all'), ['purge' => true])->assertSessionHasErrors('confirm');
    expect(Run::count())->toBe(0);

    File::deleteDirectory($sandbox['home']);
});

test('a new Laravel app joins the Commons unless the form says it is self-contained', function (bool $selfContained) {
    $sandbox = projectsSandbox();
    projectsFrameworks();
    $fake = ChildProcess::fake();

    $this->post(route('projects.scaffold'), [
        'framework' => 'laravel', 'parent' => dirname($sandbox['app']),
        'answers' => ['name' => 'blog', 'email' => 'dev@example.com', 'server' => 'fpm-nginx', 'frontend' => null, 'features' => [], 'database' => 'postgres', 'selfContained' => $selfContained],
    ])->assertRedirect();

    $bin = "{$sandbox['bin']}/larakube";
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'new', 'blog', '--fast', '--email=dev@example.com', '--fpm-nginx', '--postgres', ...($selfContained ? ['--no-plex'] : []), '--no-interaction',
    ]);

    File::deleteDirectory($sandbox['home']);
})->with([[false], [true]]);

test('the New project page reports the local Commons so the form can say what it will start', function () {
    $sandbox = projectsSandbox();
    File::put("{$sandbox['bin']}/kubectl", "#!/bin/sh\n");
    chmod("{$sandbox['bin']}/kubectl", 0755);
    projectsFrameworks();
    Process::fake([
        '*current-context*' => Process::result(output: "orbstack\n"),
        '*cluster-info*' => Process::result(output: 'ok'),
        '*plex-commons*' => Process::result(output: json_encode(['services' => ['postgres' => ['enabled' => true], 'redis' => ['enabled' => false]]])),
        '*plex-registry*' => Process::result(output: json_encode(['tenants' => ['blog' => []]])),
        '*new:frameworks*' => Process::result(output: json_encode(['success' => true, 'categories' => [], 'frameworks' => []])),
    ]);

    $this->get(route('projects.create'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->loadDeferredProps(fn (AssertableInertia $page) => $page
                ->where('commons.context', 'orbstack')
                ->where('commons.initialized', true)
                ->where('commons.services.postgres.enabled', true)
                ->where('commons.services.redis.enabled', false)));

    File::deleteDirectory($sandbox['home']);
});

function projectsBackingFake(): void
{
    Process::fake(['*services:show*' => fn ($process) => Process::result(output: json_encode(['success' => true, 'commons' => true, 'services' => [
        ['kind' => 'database', 'label' => 'Database', 'driver' => 'postgres', 'name' => 'PostgreSQL', 'mode' => 'commons', 'details' => [['label' => 'Username', 'value' => 'blog_local', 'secret' => false], ['label' => 'Password', 'value' => str_contains(is_array($process->command) ? implode(' ', $process->command) : (string) $process->command, '--reveal') ? 's3cret' : null, 'secret' => true]]],
        ['kind' => 'storage', 'label' => 'Object storage', 'driver' => 'seaweedfs', 'name' => 'SeaweedFS', 'mode' => 'commons', 'details' => [['label' => 'Bucket', 'value' => 'blog-local', 'secret' => false]]],
    ]]))]);
}

test('the project page shows each environment\'s backing services as the CLI reports them, with secrets withheld', function () {
    $sandbox = projectsSandbox();
    projectsStacks();
    projectsBackingFake();
    File::put("{$sandbox['app']}/.larakube.json", json_encode(['name' => 'shop', 'framework' => 'laravel', 'environments' => ['local' => ['plex' => ['postgres']]]]));
    $project = Project::create(['path' => $sandbox['app']]);

    $this->get(route('projects.show', $project))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('projects/show')
            ->loadDeferredProps(fn (AssertableInertia $page) => $page
                ->where('backing.local.commons', true)
                ->where('backing.local.services.0.name', 'PostgreSQL')
                ->where('backing.local.services.0.details.1.value', null)
                ->where('backing.local.services.1.details.0.value', 'blog-local')));

    Process::assertRan(function ($process): bool {
        $command = is_array($process->command) ? implode(' ', $process->command) : (string) $process->command;

        return str_contains($command, 'services:show local --json') && ! str_contains($command, '--reveal');
    });

    File::deleteDirectory($sandbox['home']);
});

test('revealing asks the CLI again with --reveal and never caches the answer', function () {
    $sandbox = projectsSandbox();
    projectsBackingFake();
    $project = Project::create(['path' => $sandbox['app']]);

    $this->getJson(route('projects.services', ['project' => $project, 'environment' => 'local']))
        ->assertOk()
        ->assertHeader('Cache-Control', 'no-store, private')
        ->assertJsonPath('services.0.details.1.value', 's3cret');

    $this->getJson(route('projects.services', ['project' => $project]))->assertUnprocessable();

    File::deleteDirectory($sandbox['home']);
});
