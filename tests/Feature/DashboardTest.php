<?php

use App\Jobs\Sync\SyncAllServerBackupsJob;
use App\Jobs\Sync\SyncAllServerClusterUsersJob;
use App\Jobs\Sync\SyncAllServerExternalDnsJob;
use App\Jobs\Sync\SyncAllServerPlexJob;
use App\Jobs\Sync\SyncAllServerTlsJob;
use App\Jobs\Sync\SyncLocalClusterJob;
use App\Jobs\Sync\SyncPlexJob;
use App\Jobs\Sync\SyncServerBackupJob;
use App\Jobs\Sync\SyncServerClusterUsersJob;
use App\Jobs\Sync\SyncServerExternalDnsJob;
use App\Jobs\Sync\SyncServerTlsJob;
use App\Models\LocalClusterState;
use App\Models\Project;
use App\Models\Server;
use App\Services\LaraKube\ClusterStatus;
use App\Services\LaraKube\FrameworkCatalog;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\LocalCluster;
use App\Services\LaraKube\ProjectInspector;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Queue;
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
                ->where('stats.missingToolsCount', 0)
                ->missing('toolsReady')
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

    $projectDir = storage_path('framework/testing/fast-api-'.bin2hex(random_bytes(4)));
    File::ensureDirectoryExists($projectDir);

    $project = Project::create([
        'path' => $projectDir,
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
    File::deleteDirectory($projectDir);
});

test('missing project folders on disk are excluded from dashboard projects card', function () {
    onboarded();
    $bin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    $existingDir = storage_path('framework/testing/existing-app-'.bin2hex(random_bytes(4)));
    File::ensureDirectoryExists($existingDir);

    Server::create(['name' => 'test-server', 'provider' => 'gcp', 'kind' => 'vps', 'status' => 'ready']);

    Project::create([
        'path' => $existingDir,
        'name' => 'existing-app',
        'framework' => 'laravel',
        'last_inspected_at' => now(),
    ]);

    Project::create([
        'path' => '/nonexistent/path/deleted-app-'.bin2hex(random_bytes(4)),
        'name' => 'deleted-app',
        'framework' => 'laravel',
        'last_inspected_at' => now(),
    ]);

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
                ->where('stats.projectsCount', 1)
                ->where('projects.0.name', 'existing-app')
                ->missing('projects.1')
            )
        );

    File::deleteDirectory($bin);
    File::deleteDirectory($existingDir);
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
        ->andReturn(['success' => true, 'configured' => true, 'destination' => ['bucket' => 'cloud-prod-backups']]);

    $job = new SyncServerBackupJob($server->id);
    $job->handle($status);

    $server->refresh();
    expect($server->backup_data)->toBe(['success' => true, 'configured' => true, 'destination' => ['bucket' => 'cloud-prod-backups']])
        ->and($server->backup_configured)->toBeTrue()
        ->and($server->backup_sync_status)->toBe('fresh')
        ->and($server->backup_last_synced_at)->not->toBeNull();
});

test('SyncLocalClusterJob writes a fresh detection into local_cluster_state', function () {
    $localCluster = mock(LocalCluster::class);
    $localCluster->shouldReceive('detect')->with(fresh: true)->once()->andReturn([
        'engine' => 'k3s',
        'context' => 'k3s-larakube',
        'status' => 'Ready for up',
        'tone' => 'ok',
    ]);

    (new SyncLocalClusterJob)->handle($localCluster);

    $state = LocalClusterState::current();
    expect($state->engine)->toBe('k3s')
        ->and($state->context)->toBe('k3s-larakube')
        ->and($state->sync_status)->toBe('fresh')
        ->and($state->last_synced_at)->not->toBeNull()
        ->and($state->last_sync_error)->toBeNull();
});

test('SyncLocalClusterJob keeps the last known state and records the error on failure, instead of flashing to unknown', function () {
    LocalClusterState::current()->update([
        'engine' => 'OrbStack',
        'context' => 'orbstack',
        'status' => 'Ready for up',
        'tone' => 'ok',
        'sync_status' => 'fresh',
        'last_synced_at' => now()->subMinute(),
    ]);

    $localCluster = mock(LocalCluster::class);
    $localCluster->shouldReceive('detect')->with(fresh: true)->once()->andThrow(new RuntimeException('kubectl timed out'));

    (new SyncLocalClusterJob)->handle($localCluster);

    $state = LocalClusterState::current();
    expect($state->engine)->toBe('OrbStack')
        ->and($state->context)->toBe('orbstack')
        ->and($state->sync_status)->toBe('error')
        ->and($state->last_sync_error)->toBe('kubectl timed out');
});

test('SyncAllServerBackupsJob dispatches a per-server sync for every ready server with a context', function () {
    Queue::fake();

    $ready = Server::create(['name' => 'ready-with-context', 'provider' => 'gcp', 'kind' => 'vps', 'context' => 'ctx-ready', 'status' => 'ready']);
    Server::create(['name' => 'ready-no-context', 'provider' => 'gcp', 'kind' => 'vps', 'status' => 'ready']);
    Server::create(['name' => 'not-ready', 'provider' => 'gcp', 'kind' => 'vps', 'context' => 'ctx-missing', 'status' => 'missing']);

    (new SyncAllServerBackupsJob)->handle();

    Queue::assertPushed(SyncServerBackupJob::class, 1);
    Queue::assertPushed(fn (SyncServerBackupJob $job): bool => $job->serverId === $ready->id);
});

test('SyncAllServerPlexJob dispatches a per-server sync for every ready server with a context', function () {
    Queue::fake();

    $ready = Server::create(['name' => 'ready-with-context', 'provider' => 'gcp', 'kind' => 'vps', 'context' => 'ctx-ready', 'status' => 'ready']);
    Server::create(['name' => 'ready-no-context', 'provider' => 'gcp', 'kind' => 'vps', 'status' => 'ready']);
    Server::create(['name' => 'not-ready', 'provider' => 'gcp', 'kind' => 'vps', 'context' => 'ctx-missing', 'status' => 'missing']);

    (new SyncAllServerPlexJob)->handle();

    Queue::assertPushed(SyncPlexJob::class, 1);
    Queue::assertPushed(fn (SyncPlexJob $job): bool => $job->serverId === $ready->id);
});

test('SyncServerExternalDnsJob writes a fresh dns report into the server, and keeps the last known one on failure', function () {
    $server = Server::create(['name' => 'cloud-prod', 'role' => 'deploy', 'provider' => 'digitalocean', 'kind' => 'doks', 'context' => 'doks-lon1-prod', 'status' => 'ready']);

    $status = mock(ClusterStatus::class);
    $status->shouldReceive('dns')->with('doks-lon1-prod')->once()->andReturn([['group' => 'alpha', 'zones' => ['example.com'], 'ready' => true, 'provider' => 'cloudflare']]);

    (new SyncServerExternalDnsJob($server->id))->handle($status);

    $server->refresh();
    expect($server->externaldns_data)->toBe([['group' => 'alpha', 'zones' => ['example.com'], 'ready' => true, 'provider' => 'cloudflare']])
        ->and($server->externaldns_sync_status)->toBe('fresh')
        ->and($server->externaldns_last_synced_at)->not->toBeNull();

    $status2 = mock(ClusterStatus::class);
    $status2->shouldReceive('dns')->andThrow(new RuntimeException('kubectl timed out'));
    (new SyncServerExternalDnsJob($server->id))->handle($status2);

    $server->refresh();
    expect($server->externaldns_data)->toBe([['group' => 'alpha', 'zones' => ['example.com'], 'ready' => true, 'provider' => 'cloudflare']])
        ->and($server->externaldns_sync_status)->toBe('error')
        ->and($server->externaldns_last_sync_error)->toBe('kubectl timed out');
});

test('SyncServerTlsJob writes a fresh tls report into the server', function () {
    $server = Server::create(['name' => 'cloud-prod', 'role' => 'deploy', 'provider' => 'digitalocean', 'kind' => 'doks', 'context' => 'doks-lon1-prod', 'status' => 'ready']);

    $status = mock(ClusterStatus::class);
    $status->shouldReceive('tls')->with('doks-lon1-prod')->once()->andReturn(['success' => true, 'provider' => 'letsencrypt']);

    (new SyncServerTlsJob($server->id))->handle($status);

    $server->refresh();
    expect($server->tls_data)->toBe(['success' => true, 'provider' => 'letsencrypt'])
        ->and($server->tls_sync_status)->toBe('fresh');
});

test('SyncServerClusterUsersJob writes a fresh cluster-users report into the server', function () {
    $server = Server::create(['name' => 'cloud-prod', 'role' => 'deploy', 'provider' => 'digitalocean', 'kind' => 'doks', 'context' => 'doks-lon1-prod', 'status' => 'ready']);

    $status = mock(ClusterStatus::class);
    $status->shouldReceive('clusterUsers')->with('doks-lon1-prod')->once()->andReturn([['name' => 'alice', 'person' => 'Alice', 'namespace' => 'production', 'createdAt' => null]]);

    (new SyncServerClusterUsersJob($server->id))->handle($status);

    $server->refresh();
    expect($server->cluster_users_data)->toBe([['name' => 'alice', 'person' => 'Alice', 'namespace' => 'production', 'createdAt' => null]])
        ->and($server->cluster_users_sync_status)->toBe('fresh');
});

test('SyncAllServerExternalDnsJob, SyncAllServerTlsJob, and SyncAllServerClusterUsersJob each dispatch a per-server sync for every ready server with a context', function () {
    Queue::fake();

    $ready = Server::create(['name' => 'ready-with-context', 'provider' => 'gcp', 'kind' => 'vps', 'context' => 'ctx-ready', 'status' => 'ready']);
    Server::create(['name' => 'ready-no-context', 'provider' => 'gcp', 'kind' => 'vps', 'status' => 'ready']);
    Server::create(['name' => 'not-ready', 'provider' => 'gcp', 'kind' => 'vps', 'context' => 'ctx-missing', 'status' => 'missing']);

    (new SyncAllServerExternalDnsJob)->handle();
    (new SyncAllServerTlsJob)->handle();
    (new SyncAllServerClusterUsersJob)->handle();

    Queue::assertPushed(SyncServerExternalDnsJob::class, 1);
    Queue::assertPushed(fn (SyncServerExternalDnsJob $job): bool => $job->serverId === $ready->id);
    Queue::assertPushed(SyncServerTlsJob::class, 1);
    Queue::assertPushed(fn (SyncServerTlsJob $job): bool => $job->serverId === $ready->id);
    Queue::assertPushed(SyncServerClusterUsersJob::class, 1);
    Queue::assertPushed(fn (SyncServerClusterUsersJob $job): bool => $job->serverId === $ready->id);
});

test('dashboard reads local cluster status from the database once synced, never calling kubectl live', function () {
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

    $localCluster = mock(LocalCluster::class);
    $localCluster->shouldNotReceive('detect');
    app()->instance(LocalCluster::class, $localCluster);

    LocalClusterState::current()->update([
        'engine' => 'OrbStack',
        'context' => 'orbstack',
        'status' => 'Ready for up',
        'tone' => 'ok',
        'sync_status' => 'fresh',
        'last_synced_at' => now(),
    ]);

    $this->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->loadDeferredProps(fn (AssertableInertia $reload) => $reload
                ->where('localCluster.engine', 'OrbStack')
                ->where('localCluster.context', 'orbstack')
                ->where('localCluster.status', 'Ready for up')
                ->where('localCluster.tone', 'ok')
            )
        );

    File::deleteDirectory($bin);
});

test('dashboard falls back to a live detect and queues a sync when local cluster has never synced', function () {
    onboarded();
    Queue::fake();

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

    $localCluster = mock(LocalCluster::class);
    $localCluster->shouldReceive('detect')->once()->andReturn([
        'engine' => 'None',
        'context' => null,
        'status' => 'kubectl missing',
        'tone' => 'muted',
    ]);
    app()->instance(LocalCluster::class, $localCluster);

    $this->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->loadDeferredProps(fn (AssertableInertia $reload) => $reload
                ->where('localCluster.status', 'kubectl missing')
            )
        );

    Queue::assertPushed(SyncLocalClusterJob::class);

    File::deleteDirectory($bin);
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
