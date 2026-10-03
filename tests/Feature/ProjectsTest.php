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

test('a new project runs its framework\'s scaffolder in the chosen folder', function (string $framework, array $arguments) {
    $sandbox = projectsSandbox();
    $parent = dirname($sandbox['app']);
    $fake = ChildProcess::fake();

    $this->post(route('projects.scaffold'), ['name' => 'blog', 'framework' => $framework, 'parent' => $parent])->assertRedirect();

    $bin = "{$sandbox['bin']}/larakube";
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [$bin, ...$arguments, '--no-interaction'] && $cwd === $parent);

    $project = Project::sole();
    expect($project->path)->toBe("{$parent}/blog")
        ->and(Run::sole()->kind)->toBe(RunKind::NewProject)
        ->and(Run::sole()->meta)->toBe(['project' => (string) $project->id, 'arguments' => json_encode($arguments), 'cwd' => $parent]);

    File::deleteDirectory($sandbox['home']);
})->with([
    'nextjs' => ['nextjs', ['nextjs:new', 'blog', '--fast', '--no-plex']],
    'vite' => ['vite', ['vite:new', 'blog', '--fast']],
    'astro' => ['astro', ['astro:new', 'blog', '--fast']],
    'docusaurus' => ['docusaurus', ['docs:new', 'blog', '--fast']],
]);

test('a new project refuses bad names, taken folders and folders outside home', function () {
    $sandbox = projectsSandbox();
    $parent = dirname($sandbox['app']);
    ChildProcess::fake();

    $this->post(route('projects.scaffold'), ['name' => 'My App', 'framework' => 'vite', 'parent' => $parent])->assertSessionHasErrors('name');
    $this->post(route('projects.scaffold'), ['name' => 'console', 'framework' => 'vite', 'parent' => $parent])->assertSessionHasErrors('name');
    $this->post(route('projects.scaffold'), ['name' => 'shop', 'framework' => 'vite', 'parent' => $parent])->assertSessionHasErrors('name');
    $this->post(route('projects.scaffold'), ['name' => 'blog', 'framework' => 'rails', 'parent' => $parent])->assertSessionHasErrors('framework');
    $this->post(route('projects.scaffold'), ['name' => 'blog', 'framework' => 'vite', 'parent' => '/tmp'])->assertSessionHasErrors('parent');

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

    $this->get(route('projects.create', ['parent' => $parent, 'name' => 'blog', 'framework' => 'astro']))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('projects/create')
            ->where('parent', $parent)
            ->where('name', 'blog')
            ->where('framework', 'astro')
            ->has('frameworks', 15));

    File::deleteDirectory($sandbox['home']);
});

function projectsLaravelOptions(bool $available = true): void
{
    $option = fn (string $value, array $unavailableWith = []): array => ['value' => $value, 'label' => ucfirst($value), 'flag' => "--{$value}", 'unavailableWith' => $unavailableWith];

    Process::fake(['*new:options*' => $available
        ? Process::result(output: json_encode(['success' => true, 'questions' => [
            ['key' => 'server', 'label' => 'Server variation', 'multiple' => false, 'nullable' => false, 'default' => 'frankenphp', 'options' => [$option('fpm-nginx'), $option('frankenphp')]],
            ['key' => 'frontend', 'label' => 'Frontend stack', 'multiple' => false, 'nullable' => true, 'default' => null, 'options' => [$option('react'), $option('vue')]],
            ['key' => 'features', 'label' => 'Laravel features', 'multiple' => true, 'nullable' => false, 'default' => null, 'options' => [$option('queues'), $option('horizon'), $option('scout'), $option('octane', ['frankenphp'])], 'conflicts' => [['horizon', 'queues']]],
            ['key' => 'search', 'label' => 'Search driver for Scout', 'multiple' => false, 'nullable' => false, 'default' => 'meilisearch', 'options' => [$option('meilisearch')], 'requiresFeature' => 'scout'],
            ['key' => 'database', 'label' => 'Database', 'multiple' => false, 'nullable' => false, 'default' => 'mysql', 'options' => [$option('mysql'), $option('postgres'), $option('sqlite', ['frankenphp'])]],
        ]]))
        : Process::result(errorOutput: 'Command "new:options" is not defined.', exitCode: 1)]);
}

test('the Laravel form starts from the workshop defaults, not new --fast', function () {
    projectsSandbox();
    projectsLaravelOptions();

    $questions = collect(app(LaravelOptions::class)->questions())->keyBy('key');

    expect($questions['server']['default'])->toBe('fpm-nginx')
        ->and($questions['database']['default'])->toBe('postgres')
        ->and($questions['frontend']['default'])->toBe('react')
        ->and($questions['features']['default'])->toBeNull();
});

test('a new Laravel app turns the form answers into new flags', function () {
    $sandbox = projectsSandbox();
    $parent = dirname($sandbox['app']);
    projectsLaravelOptions();
    $fake = ChildProcess::fake();

    $this->post(route('projects.scaffold'), [
        'name' => 'blog', 'framework' => 'laravel', 'parent' => $parent, 'email' => 'dev@example.com',
        'laravel' => ['server' => 'fpm-nginx', 'frontend' => 'react', 'features' => ['queues', 'octane'], 'database' => 'postgres'],
    ])->assertRedirect();

    $bin = "{$sandbox['bin']}/larakube";
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'new', 'blog', '--fast', '--email=dev@example.com', '--fpm-nginx', '--react', '--queues', '--octane', '--postgres', '--no-interaction',
    ] && $cwd === $parent);

    File::deleteDirectory($sandbox['home']);
});

test('a new Laravel app refuses answers the CLI would not offer', function (array $overrides, string $error) {
    $sandbox = projectsSandbox();
    projectsLaravelOptions();
    ChildProcess::fake();

    $this->post(route('projects.scaffold'), array_replace_recursive([
        'name' => 'blog', 'framework' => 'laravel', 'parent' => dirname($sandbox['app']), 'email' => 'dev@example.com',
        'laravel' => ['server' => 'frankenphp', 'frontend' => null, 'features' => [], 'database' => 'mysql'],
    ], $overrides))->assertSessionHasErrors($error);

    expect(Run::count())->toBe(0)->and(Project::count())->toBe(0);

    File::deleteDirectory($sandbox['home']);
})->with([
    'SQLite on FrankenPHP' => [['laravel' => ['database' => 'sqlite']], 'laravel.database'],
    'Octane named on FrankenPHP' => [['laravel' => ['features' => ['octane']]], 'laravel.features'],
    'Horizon with Queues' => [['laravel' => ['features' => ['horizon', 'queues']]], 'laravel.features'],
    'no database' => [['laravel' => ['database' => null]], 'laravel.database'],
    'no email' => [['email' => ''], 'email'],
]);

test('a new Laravel app needs a LaraKube CLI that lists its options', function () {
    $sandbox = projectsSandbox();
    projectsLaravelOptions(available: false);
    ChildProcess::fake();

    $this->post(route('projects.scaffold'), ['name' => 'blog', 'framework' => 'laravel', 'parent' => dirname($sandbox['app']), 'email' => 'dev@example.com'])
        ->assertSessionHasErrors('framework');

    expect(Run::count())->toBe(0);

    File::deleteDirectory($sandbox['home']);
});

test('a new project can go straight into the home folder, the form\'s default', function () {
    $sandbox = projectsSandbox();
    $fake = ChildProcess::fake();

    $this->post(route('projects.scaffold'), ['name' => 'blog', 'framework' => 'vite', 'parent' => $sandbox['home']])->assertRedirect();

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
    projectsLaravelOptions();
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

test('frameworks are categorized, emdash is marked coming soon and WordPress is not offered', function () {
    $sandbox = projectsSandbox();
    $parent = dirname($sandbox['app']);

    $this->get(route('projects.create', ['parent' => $parent]))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('projects/create')
            ->where('frameworks.statamic.category', 'cms')
            ->missing('frameworks.wordpress')
            ->where('frameworks.emdash.category', 'cms')
            ->where('frameworks.emdash.comingSoon', true)
            ->where('frameworks.statamic.comingSoon', false)
            ->where('frameworks.laravel.category', 'fullstack')
            ->where('frameworks.vite.category', 'frontend')
            ->where('frameworks.docusaurus.category', 'docs'));

    File::deleteDirectory($sandbox['home']);
});

test('a coming soon framework cannot be scaffolded', function () {
    $sandbox = projectsSandbox();
    $parent = dirname($sandbox['app']);

    $this->post(route('projects.scaffold'), [
        'name' => 'my-emdash-blog',
        'framework' => 'emdash',
        'parent' => $parent,
    ])->assertSessionHasErrors(['framework']);

    File::deleteDirectory($sandbox['home']);
});

test('scaffolding Statamic passes super user email when provided', function () {
    $sandbox = projectsSandbox();
    $parent = dirname($sandbox['app']);
    $fake = ChildProcess::fake();

    $this->post(route('projects.scaffold'), [
        'name' => 'my-statamic-site',
        'framework' => 'statamic',
        'parent' => $parent,
        'email' => 'admin@example.com',
    ])->assertRedirect();

    $bin = "{$sandbox['bin']}/larakube";
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'statamic:new', 'my-statamic-site', '--fast', '--no-plex', '--email=admin@example.com', '--no-interaction',
    ]);

    File::deleteDirectory($sandbox['home']);
});

test('WordPress cannot be started from Desktop, even by posting the form directly', function () {
    $sandbox = projectsSandbox();
    $parent = dirname($sandbox['app']);
    ChildProcess::fake();

    $this->post(route('projects.scaffold'), ['name' => 'blog', 'framework' => 'wordpress', 'parent' => $parent])
        ->assertSessionHasErrors('framework');

    expect(Run::count())->toBe(0)->and(Project::count())->toBe(0);

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
