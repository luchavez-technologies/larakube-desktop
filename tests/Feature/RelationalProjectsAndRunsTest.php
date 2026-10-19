<?php

use App\Enums\RunKind;
use App\Models\Project;
use App\Models\Run;
use App\Models\Server;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ProjectInspector;
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

test('Run auto-links server_id by server_name or context', function () {
    $server = Server::create([
        'name' => 'prod-cluster',
        'role' => 'deploy',
        'provider' => 'digitalocean',
        'kind' => 'doks',
        'context' => 'doks-lon1-prod',
        'ip' => '10.0.0.1',
        'status' => 'ready',
    ]);

    // Test auto-linking by server_name
    $run1 = Run::create([
        'label' => 'Run 1',
        'command' => ['larakube', 'status'],
        'server_name' => 'prod-cluster',
    ]);

    expect($run1->server_id)->toBe($server->id)
        ->and($run1->server)->not->toBeNull()
        ->and($run1->server->id)->toBe($server->id);

    // Test auto-linking by context
    $run2 = Run::create([
        'label' => 'Run 2',
        'command' => ['larakube', 'status'],
        'context' => 'doks-lon1-prod',
    ]);

    expect($run2->server_id)->toBe($server->id)
        ->and($run2->server->id)->toBe($server->id);

    // Test relation from Server to runs
    expect($server->runs()->count())->toBe(2);
});

test('CliRunner accepts explicit server_id and resolves it in start()', function () {
    ChildProcess::fake();
    $runner = new CliRunner(new ToolLocator([$this->fakeBinDir]));

    $server = Server::create([
        'name' => 'vps-staging',
        'role' => 'deploy',
        'provider' => 'hetzner',
        'kind' => 'vps',
        'context' => 'k3s-vps-staging',
        'status' => 'ready',
    ]);

    $run = $runner->start(
        label: 'Deploy Staging',
        arguments: ['cloud:deploy', 'staging'],
        kind: RunKind::DeployApp,
        serverId: $server->id,
    );

    expect($run->server_id)->toBe($server->id)
        ->and($run->server->name)->toBe('vps-staging');
});

test('Project links to Server and exposes bidirectional relationship', function () {
    $server = Server::create([
        'name' => 'app-server',
        'role' => 'deploy',
        'provider' => 'digitalocean',
        'kind' => 'doks',
        'context' => 'doks-app',
        'status' => 'ready',
    ]);

    $project = Project::create([
        'path' => '/home/user/apps/backend',
        'name' => 'backend-api',
        'framework' => 'laravel',
        'web_host' => 'backend.dev.test',
        'server_id' => $server->id,
        'environment' => 'production',
        'blueprint_cache' => ['name' => 'backend-api', 'framework' => 'laravel'],
        'last_inspected_at' => now(),
    ]);

    expect($project->server)->not->toBeNull()
        ->and($project->server->id)->toBe($server->id)
        ->and($project->name)->toBe('backend-api')
        ->and($project->framework)->toBe('laravel')
        ->and($project->web_host)->toBe('backend.dev.test');

    expect($server->projects)->toHaveCount(1)
        ->and($server->projects->first()->id)->toBe($project->id);
});

test('ProjectInspector inspect() syncs metadata and resolves server_id to SQLite', function () {
    $tempDir = storage_path('framework/testing/project-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($tempDir);

    $blueprint = [
        'name' => 'crm-portal',
        'framework' => 'laravel',
        'environments' => [
            'production' => [
                'hosts' => ['web' => 'crm.example.com'],
                'features' => ['horizon', 'queues'],
            ],
        ],
    ];

    File::put("{$tempDir}/.larakube.json", json_encode($blueprint, JSON_PRETTY_PRINT));

    $server = Server::create([
        'name' => 'crm-cluster',
        'role' => 'deploy',
        'provider' => 'digitalocean',
        'kind' => 'doks',
        'context' => 'larakube-198.51.100.10',
        'ip' => '198.51.100.10',
        'status' => 'ready',
    ]);

    $localJson = [
        'environments' => [
            'production' => [
                'cloud' => [
                    'ip' => '198.51.100.10',
                    'context' => 'larakube-198.51.100.10',
                ],
            ],
        ],
    ];
    File::put("{$tempDir}/.larakube.local.json", json_encode($localJson, JSON_PRETTY_PRINT));

    $project = Project::create([
        'path' => $tempDir,
    ]);

    $inspector = app(ProjectInspector::class);
    $result = $inspector->inspect($tempDir);

    expect($result['name'])->toBe('crm-portal');

    $project->refresh();
    expect($project->name)->toBe('crm-portal')
        ->and($project->server_id)->toBe($server->id)
        ->and($project->blueprint_cache)->toBeArray()
        ->and($project->last_inspected_at)->not->toBeNull();

    File::deleteDirectory($tempDir);
});

test('Deleting server sets server_id to null on associated projects and runs', function () {
    $server = Server::create([
        'name' => 'delete-test-server',
        'role' => 'deploy',
        'provider' => 'digitalocean',
        'kind' => 'doks',
        'status' => 'ready',
    ]);

    $project = Project::create([
        'path' => '/tmp/delete-test-project',
        'server_id' => $server->id,
    ]);

    $run = Run::create([
        'label' => 'Run for delete-test-server',
        'command' => ['larakube', 'status'],
        'server_id' => $server->id,
    ]);

    expect($project->server_id)->toBe($server->id)
        ->and($run->server_id)->toBe($server->id);

    $server->delete();

    $project->refresh();
    $run->refresh();

    expect($project->server_id)->toBeNull()
        ->and($run->server_id)->toBeNull();
});
