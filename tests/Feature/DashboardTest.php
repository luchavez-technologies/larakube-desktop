<?php

use App\Jobs\Sync\SyncServerBackupJob;
use App\Models\Project;
use App\Models\Server;
use App\Services\LaraKube\ClusterStatus;
use App\Services\LaraKube\FrameworkCatalog;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ProjectInspector;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Inertia\Testing\AssertableInertia;

/**
 * Every test below exercises the dashboard's own content, not the onboarding
 * gate — assume onboarding is already done unless a test says otherwise.
 * `hideProjects`/`experimental` are stubbed too: HandleInertiaRequests::share()
 * calls both on every request, mocked or not.
 */
function onboarded(): void
{
    $settings = mock(GlobalSettings::class);
    $settings->shouldReceive('hasCompletedOnboarding')->andReturnTrue();
    $settings->shouldReceive('hideProjects')->andReturnFalse();
    $settings->shouldReceive('experimental')->andReturnFalse();
    $settings->shouldReceive('demoMode')->andReturnFalse();
    app()->instance(GlobalSettings::class, $settings);
}

test('a first launch that has not finished onboarding is sent to the wizard', function () {
    $settings = mock(GlobalSettings::class);
    $settings->shouldReceive('hasCompletedOnboarding')->andReturnFalse();
    $settings->shouldReceive('hideProjects')->andReturnFalse();
    $settings->shouldReceive('experimental')->andReturnFalse();
    $settings->shouldReceive('demoMode')->andReturnFalse();
    app()->instance(GlobalSettings::class, $settings);

    $this->get(route('dashboard'))->assertRedirect(route('onboarding'));
});

test('dashboard page renders with stats and workspace overview', function () {
    onboarded();
    $bin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    $stacks = mock(StackCatalog::class);
    $stacks->shouldReceive('all')->andReturn([
        ['name' => 'gcp-vps', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'asia-east1', 'ip' => '34.27.253.31', 'context' => 'larakube-34.27.253.31', 'account' => null, 'projectId' => null, 'status' => 'ready'],
    ]);
    app()->instance(StackCatalog::class, $stacks);

    $readiness = mock(ReadinessCheck::class);
    $readiness->shouldReceive('tools')->andReturn([
        ['slug' => 'docker', 'label' => 'Docker', 'purpose' => 'Containers', 'required' => true, 'installable' => false, 'installed' => true, 'path' => '/bin/docker', 'version' => '27.0.0'],
    ]);
    app()->instance(ReadinessCheck::class, $readiness);

    $inspector = mock(ProjectInspector::class);
    $inspector->shouldReceive('inspect')->andReturn([
        'name' => 'test-app',
        'path' => '/code/test-app',
        'exists' => true,
        'initialized' => true,
        'framework' => 'laravel',
        'detectedFramework' => null,
        'webHost' => 'test-app.test',
        'serverIp' => '34.27.253.31',
        'deployable' => true,
        'localTld' => 'test',
        'environments' => [],
    ]);
    app()->instance(ProjectInspector::class, $inspector);

    Project::create(['path' => '/code/test-app']);

    $this->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('dashboard/index')
            ->has('runs')
            ->missing('stats')
            ->missing('projects')
            ->missing('servers')
            ->loadDeferredProps(fn (AssertableInertia $reload) => $reload
                ->has('stats')
                ->where('stats.projectsCount', 1)
                ->where('stats.serversCount', 1)
                ->where('stats.readyServersCount', 1)
                ->where('toolsReady', true)
                ->has('projects', 1)
                ->has('servers', 1)
                ->has('localCluster')
            )
        );

    $this->get(route('home'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('dashboard/index')
        );
});

test('every dashboard server carries hasExternalDns, computed up front for all of them', function () {
    // Quick Launch's cluster picker needs this for every server at once, not
    // just a selected one — an instant DB read (DomainCatalog), never a live
    // DNS check, so it's safe to compute for all of them here.
    onboarded();
    $bin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    $stacks = mock(StackCatalog::class);
    $stacks->shouldReceive('all')->andReturn([
        ['name' => 'with-dns', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'asia-east1', 'ip' => '34.27.253.31', 'context' => 'larakube-with-dns', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ['name' => 'without-dns', 'provider' => 'aws', 'kind' => 'vps', 'region' => 'ap-southeast-1', 'ip' => '3.1.217.1', 'context' => 'larakube-without-dns', 'account' => null, 'projectId' => null, 'status' => 'ready'],
    ]);
    app()->instance(StackCatalog::class, $stacks);

    $readiness = mock(ReadinessCheck::class);
    $readiness->shouldReceive('tools')->andReturn([]);
    app()->instance(ReadinessCheck::class, $readiness);

    $withDns = Server::create(['name' => 'with-dns', 'provider' => 'gcp', 'kind' => 'vps', 'context' => 'larakube-with-dns', 'status' => 'ready', 'domains_sync_status' => 'fresh', 'domains_last_synced_at' => now()]);
    $withDns->domains()->create(['domain' => 'example.com', 'external_dns' => true]);

    Server::create(['name' => 'without-dns', 'provider' => 'aws', 'kind' => 'vps', 'context' => 'larakube-without-dns', 'status' => 'ready', 'domains_sync_status' => 'fresh', 'domains_last_synced_at' => now()]);

    $this->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->missing('servers')
            ->loadDeferredProps(fn (AssertableInertia $reload) => $reload
                ->where('servers.0.hasExternalDns', true)
                ->where('servers.1.hasExternalDns', false)
            )
        );
});

test('a first launch with no CLI sends the user to Setup', function () {
    onboarded();
    $empty = storage_path('framework/testing/empty-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($empty);
    app()->instance(ToolLocator::class, new ToolLocator([$empty]));

    $this->get(route('dashboard'))->assertRedirect(route('readiness'));
});

test('the dashboard warns about ready servers that have no backups', function () {
    onboarded();
    $bin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    $stacks = mock(StackCatalog::class);
    $stacks->shouldReceive('all')->andReturn([
        ['name' => 'safe-vps', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'r', 'ip' => '1.1.1.1', 'context' => 'ctx-safe', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ['name' => 'bare-vps', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'r', 'ip' => '2.2.2.2', 'context' => 'ctx-bare', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ['name' => 'new-vps', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'r', 'ip' => null, 'context' => null, 'account' => null, 'projectId' => null, 'status' => 'creating'],
    ]);
    app()->instance(StackCatalog::class, $stacks);

    $backups = mock(ClusterStatus::class);
    $backups->shouldReceive('backup')->with('ctx-safe')->andReturn(['success' => true, 'configured' => true]);
    $backups->shouldReceive('backup')->with('ctx-bare')->andReturn(['success' => true, 'configured' => false]);
    app()->instance(ClusterStatus::class, $backups);

    $this->get(route('dashboard'))->assertInertia(fn (AssertableInertia $page) => $page
        ->missing('unprotectedServers')
        ->missing('backups')
        ->loadDeferredProps(fn (AssertableInertia $reload) => $reload
            ->where('unprotectedServers', ['bare-vps'])
            ->where('backups.total', 2)
            ->where('backups.protected', 1)
            ->where('backups.unprotected', ['bare-vps'])
        ));

    File::deleteDirectory($bin);
});

test('local clusters like orbstack or docker are excluded from backup protection checks', function () {
    onboarded();
    $bin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    $stacks = mock(StackCatalog::class);
    $stacks->shouldReceive('all')->andReturn([
        ['name' => 'orbstack', 'provider' => 'orbstack', 'kind' => 'discovered', 'region' => 'local', 'ip' => '127.0.0.1', 'context' => 'orbstack', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ['name' => 'bare-vps', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'asia-east1', 'ip' => '34.27.253.31', 'context' => 'ctx-bare', 'account' => null, 'projectId' => null, 'status' => 'ready'],
    ]);
    app()->instance(StackCatalog::class, $stacks);

    $backups = mock(ClusterStatus::class);
    // OrbStack should never even have backup() queried because it is local
    $backups->shouldReceive('backup')->with('ctx-bare')->andReturn(['success' => true, 'configured' => false]);
    app()->instance(ClusterStatus::class, $backups);

    $this->get(route('dashboard'))->assertInertia(fn (AssertableInertia $page) => $page
        ->loadDeferredProps(fn (AssertableInertia $reload) => $reload
            ->where('backups.total', 1)
            ->where('backups.protected', 0)
            ->where('backups.unprotected', ['bare-vps'])
            ->where('unprotectedServers', ['bare-vps'])
        ));

    File::deleteDirectory($bin);
});

test('the dashboard defers the project catalog, dev boxes, and default parent for Quick Launch Projects', function () {
    onboarded();
    $bin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    $stacks = mock(StackCatalog::class);
    $stacks->shouldReceive('all')->andReturn([]);
    app()->instance(StackCatalog::class, $stacks);

    $readiness = mock(ReadinessCheck::class);
    $readiness->shouldReceive('tools')->andReturn([]);
    app()->instance(ReadinessCheck::class, $readiness);

    $frameworks = mock(FrameworkCatalog::class);
    $frameworks->shouldReceive('catalog')->andReturn([
        'categories' => [['id' => 'web', 'label' => 'Web']],
        'frameworks' => [],
    ]);
    $frameworks->shouldReceive('visible')->andReturn([
        ['slug' => 'laravel', 'label' => 'Laravel', 'description' => 'PHP', 'category' => 'web', 'tech' => 'PHP', 'fields' => []],
    ]);
    app()->instance(FrameworkCatalog::class, $frameworks);

    $this->get(route('dashboard'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->missing('projectCatalog')
            ->missing('projectDevBoxes')
            ->where('defaultProjectParent', ToolLocator::home())
            ->loadDeferredProps(fn (AssertableInertia $reload) => $reload
                ->where('projectCatalog.frameworks.0.slug', 'laravel')
                ->where('projectDevBoxes', [])
            ));

    File::deleteDirectory($bin);
});

test('dashboard reads servers and projects directly from database without invoking CLI or disk inspect', function () {
    onboarded();
    $bin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    $server = Server::create([
        'name' => 'db-cluster',
        'provider' => 'digitalocean',
        'kind' => 'doks',
        'region' => 'nyc1',
        'ip' => '157.245.1.1',
        'context' => 'doks-nyc1-db',
        'status' => 'ready',
    ]);
    $server->domains()->create([
        'domain' => 'api.example.com',
        'external_dns' => true,
    ]);

    $project = Project::create([
        'path' => '/home/apps/fast-api',
        'name' => 'fast-api',
        'framework' => 'laravel',
        'web_host' => 'fast-api.dev.test',
        'last_inspected_at' => now(),
    ]);

    $stacks = mock(StackCatalog::class);
    $stacks->shouldNotReceive('all');
    app()->instance(StackCatalog::class, $stacks);

    $inspector = mock(ProjectInspector::class);
    $inspector->shouldNotReceive('inspect');
    app()->instance(ProjectInspector::class, $inspector);

    $readiness = mock(ReadinessCheck::class);
    $readiness->shouldReceive('tools')->andReturn([]);
    app()->instance(ReadinessCheck::class, $readiness);

    $this->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->loadDeferredProps(fn (AssertableInertia $reload) => $reload
                ->where('stats.projectsCount', 1)
                ->where('stats.serversCount', 1)
                ->where('stats.readyServersCount', 1)
                ->where('projects.0.name', 'fast-api')
                ->where('projects.0.framework', 'laravel')
                ->where('projects.0.webHost', 'fast-api.dev.test')
                ->where('servers.0.name', 'db-cluster')
                ->where('servers.0.hasExternalDns', true)
            )
        );

    File::deleteDirectory($bin);
});

test('SyncServerBackupJob updates server backup status', function () {
    $server = Server::create([
        'name' => 'cloud-prod',
        'role' => 'deploy',
        'provider' => 'digitalocean',
        'kind' => 'doks',
        'context' => 'doks-lon1-prod',
        'status' => 'ready',
    ]);

    $status = mock(ClusterStatus::class);
    $status->shouldReceive('backup')
        ->with('doks-lon1-prod')
        ->once()
        ->andReturn(['success' => true, 'configured' => true]);

    $job = new SyncServerBackupJob($server->id);
    $job->handle($status);

    $server->refresh();
    expect($server->backup_configured)->toBeTrue()
        ->and($server->backup_sync_status)->toBe('fresh')
        ->and($server->backup_last_synced_at)->not->toBeNull();
});

test('destroyed and missing servers are excluded from active fleet count and health score', function () {
    onboarded();
    $bin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    // 2 active ready servers
    Server::create(['name' => 'active-1', 'role' => 'deploy', 'provider' => 'gcp', 'kind' => 'vps', 'status' => 'ready']);
    Server::create(['name' => 'active-2', 'role' => 'deploy', 'provider' => 'aws', 'kind' => 'vps', 'status' => 'ready']);

    // 1 destroyed / missing server
    Server::create(['name' => 'destroyed-cluster', 'role' => 'deploy', 'provider' => 'gcp', 'kind' => 'managed', 'status' => 'missing']);

    // 1 dev box
    Server::create(['name' => 'my-devbox', 'role' => 'dev', 'provider' => 'gcp', 'kind' => 'vps', 'status' => 'ready']);

    $stacks = mock(StackCatalog::class);
    $stacks->shouldNotReceive('all');
    app()->instance(StackCatalog::class, $stacks);

    $readiness = mock(ReadinessCheck::class);
    $readiness->shouldReceive('tools')->andReturn([]);
    app()->instance(ReadinessCheck::class, $readiness);

    $this->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->loadDeferredProps(fn (AssertableInertia $reload) => $reload
                ->where('stats.serversCount', 2)
                ->where('stats.readyServersCount', 2)
                ->where('fleetMetrics.totalServers', 2)
                ->where('fleetMetrics.readyServers', 2)
                ->where('fleetMetrics.fleetHealthScore', 100)
            )
        );

    File::deleteDirectory($bin);
});
