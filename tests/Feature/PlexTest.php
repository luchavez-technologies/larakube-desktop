<?php

use App\Enums\RunKind;
use App\Models\Project;
use App\Models\Run;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Inertia\Testing\AssertableInertia;
use Native\Desktop\Facades\ChildProcess;

function plexSandbox(): array
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

test('server plex lifecycle commands run plex:init, plex:start, and plex:stop', function () {
    $sandbox = plexSandbox();
    $stacks = mock(StackCatalog::class);
    $stacks->shouldReceive('find')->with('demo-vps')->andReturn([
        'name' => 'demo-vps',
        'provider' => 'gcp',
        'context' => 'larakube-34.27.253.31',
        'status' => 'ready',
    ]);
    app()->instance(StackCatalog::class, $stacks);

    $fake = ChildProcess::fake();
    $bin = "{$sandbox['bin']}/larakube";

    $this->post(route('servers.plex.init', ['server' => 'demo-vps']))->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'plex:init', '--context=larakube-34.27.253.31', '--no-interaction',
    ]);
    expect(Run::sole()->kind)->toBe(RunKind::PlexInit);

    $this->post(route('servers.plex.start', ['server' => 'demo-vps']))->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'plex:start', '--context=larakube-34.27.253.31', '--no-interaction',
    ]);

    $this->post(route('servers.plex.stop', ['server' => 'demo-vps']))->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'plex:stop', '--context=larakube-34.27.253.31', '--no-interaction',
    ]);

    File::deleteDirectory($sandbox['home']);
});

test('project plex commands run plex:join and plex:leave', function () {
    $sandbox = plexSandbox();
    $project = Project::create(['path' => $sandbox['app']]);
    $fake = ChildProcess::fake();
    $bin = "{$sandbox['bin']}/larakube";

    $this->post(route('projects.plex.join', $project))->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'plex:join', '--fast', '--no-interaction',
    ] && $cwd === $sandbox['app']);
    expect(Run::sole()->kind)->toBe(RunKind::PlexJoin);

    $this->post(route('projects.plex.leave', $project))->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'plex:leave', '--force', '--no-interaction',
    ] && $cwd === $sandbox['app']);

    File::deleteDirectory($sandbox['home']);
});

test('project plex commands accept optional environment', function () {
    $sandbox = plexSandbox();
    $project = Project::create(['path' => $sandbox['app']]);
    $fake = ChildProcess::fake();
    $bin = "{$sandbox['bin']}/larakube";

    $this->post(route('projects.plex.join', $project), ['environment' => 'staging'])->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'plex:join', 'staging', '--no-interaction',
    ] && $cwd === $sandbox['app']);

    $this->post(route('projects.plex.leave', $project), ['environment' => 'staging'])->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'plex:leave', 'staging', '--force', '--no-interaction',
    ] && $cwd === $sandbox['app']);

    File::deleteDirectory($sandbox['home']);
});

// --- the dedicated /plex page ------------------------------------------

function plexPageFakes(): array
{
    return [
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'workshop-demo', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'us-central1', 'ip' => '34.27.253.31', 'context' => 'larakube-34.27.253.31', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ]])),
        '*plex:show*' => Process::result(output: json_encode([
            'initialized' => true,
            'context' => 'larakube-34.27.253.31',
            'services' => ['postgres' => ['enabled' => true, 'host' => 'postgres.larakube-plex', 'port' => 5432]],
            'tenants' => [
                'tool' => [['name' => 'outline_wiki', 'database' => 'outline_wiki', 'databaseService' => 'postgres', 'redisIndex' => null, 's3Bucket' => null, 'rotation' => null]],
                'project' => [['name' => 'shop_production', 'database' => 'shop_production', 'databaseService' => 'postgres', 'redisIndex' => 3, 's3Bucket' => null, 'rotation' => ['state' => 'managed', 'nextRotation' => '2026-10-20T00:00:00Z']]],
                'custom' => [],
            ],
        ])),
        '*top*pods*' => Process::result(output: "postgres-7d9f8b6c45-x8k2p 15m 64Mi\n"),
    ];
}

test('Plex Commons in the sidebar opens the first ready server', function () {
    $sandbox = plexSandbox();
    Process::fake(plexPageFakes());

    $this->get(route('plex'))->assertRedirect(route('servers.plex.index', 'workshop-demo'));

    File::deleteDirectory($sandbox['home']);
});

test('the Plex Commons page loads plex, services, and pod-metrics deferred props', function () {
    $sandbox = plexSandbox();
    File::put("{$sandbox['bin']}/kubectl", "#!/bin/sh\n");
    chmod("{$sandbox['bin']}/kubectl", 0755);
    Process::fake(plexPageFakes());

    $this->get(route('servers.plex.index', 'workshop-demo'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('plex/index')
            ->loadDeferredProps(fn (AssertableInertia $page) => $page
                ->where('plex.initialized', true)
                ->where('services.services.0.name', 'Postgres')
                ->where('plex.tenants.tool.0.name', 'outline_wiki')
                ->where('plex.tenants.project.0.name', 'shop_production')
                ->where('podMetrics.available', true)
                ->where('podMetrics.components.postgres.podCount', 1)));

    File::deleteDirectory($sandbox['home']);
});

test('refreshing Plex Commons forgets the cached report', function () {
    $sandbox = plexSandbox();
    Process::fake(plexPageFakes());

    $this->post(route('servers.plex.refresh', 'workshop-demo'))->assertRedirect();

    File::deleteDirectory($sandbox['home']);
});

test('provisioning custom Commons credentials runs plex:provision', function () {
    $sandbox = plexSandbox();
    $stacks = mock(StackCatalog::class);
    $stacks->shouldReceive('find')->with('workshop-demo')->andReturn([
        'name' => 'workshop-demo',
        'provider' => 'gcp',
        'kind' => 'vps',
        'context' => 'larakube-34.27.253.31',
        'status' => 'ready',
        'account' => null,
        'projectId' => null,
    ]);
    app()->instance(StackCatalog::class, $stacks);

    $fake = ChildProcess::fake();
    $bin = "{$sandbox['bin']}/larakube";

    $this->post(route('servers.plex.provision', 'workshop-demo'), [
        'tenant' => 'my-side-project',
        'services' => ['db', 'redis'],
    ])->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'plex:provision', 'local', '--context=larakube-34.27.253.31', '--tenant=my-side-project', '--force', '--service=db', '--service=redis', '--no-interaction',
    ]);
    expect(Run::sole()->kind)->toBe(RunKind::PlexProvision);

    File::deleteDirectory($sandbox['home']);
});
