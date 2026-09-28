<?php

use App\Enums\RunKind;
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
        ['cloud:configure', 'production', '--only=hosts', '--web-hosts=shop.example.com'],
        ['cloud:deploy', 'production'],
    ] as $arguments) {
        $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [$bin, ...$arguments, '--no-interaction'] && $cwd === $sandbox['app']);
    }

    expect(Run::pluck('kind')->all())->toBe([RunKind::InitProject, RunKind::ConfigureHost, RunKind::DeployApp])
        ->and(Run::first()->subject)->toBe("project:{$project->id}");

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
        ->and(Run::sole()->meta)->toBe(['project' => (string) $project->id]);

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
    $this->post(route('projects.scaffold'), ['name' => 'blog', 'framework' => 'statamic', 'parent' => $parent])->assertSessionHasErrors('framework');
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
            ->has('frameworks', 5));

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
