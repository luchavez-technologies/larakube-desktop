<?php

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Models\Project;
use App\Models\Run;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Native\Desktop\Facades\ChildProcess;

beforeEach(function () {
    $this->fakeBinDir = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($this->fakeBinDir);
    File::put("{$this->fakeBinDir}/larakube", "#!/bin/sh\nexit 0\n");
    chmod("{$this->fakeBinDir}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$this->fakeBinDir]));
});

afterEach(function () {
    if (isset($this->fakeBinDir) && File::isDirectory($this->fakeBinDir)) {
        File::deleteDirectory($this->fakeBinDir);
    }
});

test('CliRunner::start stores explicit structured columns', function () {
    ChildProcess::fake();
    $runner = new CliRunner(new ToolLocator([$this->fakeBinDir]));

    $project = Project::create(['path' => '/home/user/apps/my-app']);

    $run = $runner->start(
        label: 'Deploy my-app (production)',
        arguments: ['cloud:deploy', 'production'],
        kind: RunKind::DeployApp,
        subject: "project:{$project->id}",
        targetType: 'project',
        targetName: 'my-app',
        projectId: $project->id,
        projectName: 'my-app',
        environment: 'production',
        serverName: 'vps-prod',
        context: 'k3s-vps-prod',
    );

    expect($run->target_type)->toBe('project')
        ->and($run->target_name)->toBe('my-app')
        ->and($run->project_id)->toBe($project->id)
        ->and($run->project_name)->toBe('my-app')
        ->and($run->environment)->toBe('production')
        ->and($run->server_name)->toBe('vps-prod')
        ->and($run->context)->toBe('k3s-vps-prod')
        ->and($run->project)->not->toBeNull()
        ->and($run->project->id)->toBe($project->id);
});

test('CliRunner::start infers structured fields from legacy metadata as fallback', function () {
    ChildProcess::fake();
    $runner = new CliRunner(new ToolLocator([$this->fakeBinDir]));

    $project = Project::create(['path' => '/home/user/apps/legacy-app']);

    $run = $runner->start(
        label: 'Up legacy-app (local)',
        arguments: ['up', 'local'],
        kind: RunKind::UpProject,
        subject: "project:{$project->id}",
        meta: [
            'project' => (string) $project->id,
            'environment' => 'local',
            'server' => 'local-k3d',
            'context' => 'k3d-larakube',
        ],
    );

    expect($run->target_type)->toBe('project')
        ->and($run->project_id)->toBe($project->id)
        ->and($run->environment)->toBe('local')
        ->and($run->server_name)->toBe('local-k3d')
        ->and($run->context)->toBe('k3d-larakube');
});

test('RunController::index formats structured targets and environment correctly', function () {
    $project = Project::create(['path' => '/home/user/apps/blog']);

    Run::create([
        'label' => 'Deploy blog (production)',
        'kind' => RunKind::DeployApp,
        'subject' => "project:{$project->id}",
        'target_type' => 'project',
        'target_name' => 'blog',
        'project_id' => $project->id,
        'project_name' => 'blog',
        'environment' => 'production',
        'status' => RunStatus::Succeeded,
        'command' => ['cloud:deploy', 'production'],
    ]);

    Run::create([
        'label' => 'Create server vps-alpha',
        'kind' => RunKind::CreateServer,
        'subject' => 'vps-alpha',
        'target_type' => 'server',
        'target_name' => 'vps-alpha',
        'server_name' => 'vps-alpha',
        'environment' => 'production',
        'status' => RunStatus::Running,
        'command' => ['cloud:create'],
    ]);

    $catalog = Mockery::mock(StackCatalog::class);
    $catalog->shouldReceive('all')->andReturn([
        ['name' => 'vps-alpha', 'status' => 'ready'],
    ]);
    app()->instance(StackCatalog::class, $catalog);

    $response = $this->get(route('runs.index'));
    $response->assertOk();

    $response->assertInertia(fn ($page) => $page
        ->component('runs/index')
        ->has('runs', 2)
        ->where('runs.0.targetType', 'server')
        ->where('runs.0.targetName', 'vps-alpha')
        ->where('runs.0.targetUrl', route('servers.show', 'vps-alpha'))
        ->where('runs.0.environment', 'production')
        ->where('runs.1.targetType', 'project')
        ->where('runs.1.targetName', 'blog')
        ->where('runs.1.targetUrl', route('projects.show', $project->id))
        ->where('runs.1.environment', 'production')
    );
});
