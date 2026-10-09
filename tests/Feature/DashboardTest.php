<?php

use App\Models\Project;
use App\Models\Server;
use App\Services\LaraKube\ClusterStatus;
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
    app()->instance(GlobalSettings::class, $settings);
}

test('a first launch that has not finished onboarding is sent to the wizard', function () {
    $settings = mock(GlobalSettings::class);
    $settings->shouldReceive('hasCompletedOnboarding')->andReturnFalse();
    $settings->shouldReceive('hideProjects')->andReturnFalse();
    $settings->shouldReceive('experimental')->andReturnFalse();
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
            ->has('stats')
            ->where('stats.projectsCount', 1)
            ->where('stats.serversCount', 1)
            ->where('stats.readyServersCount', 1)
            ->where('toolsReady', true)
            ->has('projects', 1)
            ->has('servers', 1)
            ->has('localCluster')
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
            ->where('servers.0.hasExternalDns', true)
            ->where('servers.1.hasExternalDns', false)
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
        ->loadDeferredProps(fn (AssertableInertia $reload) => $reload->where('unprotectedServers', ['bare-vps'])));

    File::deleteDirectory($bin);
});
