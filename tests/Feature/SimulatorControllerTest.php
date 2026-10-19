<?php

use App\Models\Project;
use App\Models\Server;
use Illuminate\Support\Facades\File;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->tempHome = storage_path('framework/testing/home-sim-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($this->tempHome);
});

afterEach(function () {
    if (isset($this->tempHome) && File::isDirectory($this->tempHome)) {
        File::deleteDirectory($this->tempHome);
    }
});

test('get /simulator renders inertia page with projects, servers, and presets', function () {
    $server = Server::create([
        'name' => 'test-cluster',
        'role' => 'cluster',
        'provider' => 'gke',
        'kind' => 'kubernetes',
        'status' => 'ready',
        'sync_status' => 'synced',
        'domains_sync_status' => 'synced',
        'port' => 22,
    ]);

    $projectDir = $this->tempHome.'/projects/test-app';
    File::ensureDirectoryExists($projectDir);
    $project = Project::create([
        'path' => $projectDir,
    ]);

    $response = $this->get('/simulator');

    $response->assertOk();
    $response->assertInertia(fn (Assert $page) => $page
        ->component('simulator/index')
        ->has('projects', 1)
        ->where('projects.0.id', $project->id)
        ->has('servers', 1)
        ->where('servers.0.id', $server->id)
        ->has('presets', 3)
        ->where('initialProjectId', null)
    );
});

test('get /simulator with project parameter passes initialProjectId', function () {
    $projectDir = $this->tempHome.'/projects/my-app';
    File::ensureDirectoryExists($projectDir);
    $project = Project::create([
        'path' => $projectDir,
    ]);

    $response = $this->get("/simulator?project={$project->id}");

    $response->assertOk();
    $response->assertInertia(fn (Assert $page) => $page
        ->component('simulator/index')
        ->where('initialProjectId', $project->id)
    );
});
