<?php

use App\Models\Project;
use App\Services\LaraKube\ProjectInspector;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Inertia\Testing\AssertableInertia;

test('dashboard page renders with stats and workspace overview', function () {
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

test('a first launch with no CLI sends the user to Setup', function () {
    $empty = storage_path('framework/testing/empty-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($empty);
    app()->instance(ToolLocator::class, new ToolLocator([$empty]));

    $this->get(route('dashboard'))->assertRedirect(route('readiness'));
});
