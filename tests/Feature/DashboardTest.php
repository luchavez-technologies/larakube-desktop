<?php

use App\Models\Project;
use App\Services\LaraKube\ProjectInspector;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\StackCatalog;
use Inertia\Testing\AssertableInertia;

test('dashboard page renders with stats and workspace overview', function () {
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
