<?php

use App\Enums\RunKind;
use App\Models\Run;
use App\Services\FolderPicker;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Native\Desktop\Facades\ChildProcess;

function setupCloneCli(): string
{
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);
    File::put("{$directory}/larakube", "#!/bin/sh\n");
    chmod("{$directory}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$directory]));

    return $directory;
}

function setupCloneExperimental(bool $on): void
{
    $settings = mock(GlobalSettings::class);
    $settings->shouldReceive('hideProjects')->andReturnFalse();
    $settings->shouldReceive('experimental')->andReturn($on);
    $settings->shouldReceive('get')->andReturn(['cliChannel' => 'canary']);
    app()->instance(GlobalSettings::class, $settings);
}

function setupCloneStacks(string $status = 'ready'): void
{
    Process::fake(['*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
        ['name' => 'my-dev-box', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'us-central1', 'ip' => '203.0.113.50', 'sshKey' => '/home/me/.ssh/devbox', 'context' => null, 'role' => 'dev', 'account' => null, 'projectId' => null, 'status' => $status],
    ]]))]);
}

test('cloning a project locally validates repo is required', function () {
    $response = $this->post(route('projects.clone'), []);

    $response->assertSessionHasErrors('repo');
});

test('cloning a project locally dispatches RunKind::CloneProject', function () {
    $cliDir = setupCloneCli();
    ChildProcess::fake();

    $parent = storage_path('framework/testing/projects-'.bin2hex(random_bytes(4)));
    File::ensureDirectoryExists($parent);

    $response = $this->post(route('projects.clone'), [
        'repo' => 'https://github.com/laravel/laravel.git',
        'directory' => 'my-cloned-app',
        'branch' => '11.x',
        'parent' => $parent,
    ]);

    $response->assertRedirect();
    $run = Run::sole();

    expect($run->kind)->toBe(RunKind::CloneProject)
        ->and($run->target_name)->toBe('my-cloned-app')
        ->and($run->environment)->toBe('local');

    File::deleteDirectory($parent);
    File::deleteDirectory($cliDir);
});

test('cloning a project locally auto-derives directory from repo url', function () {
    $cliDir = setupCloneCli();
    ChildProcess::fake();

    $parent = storage_path('framework/testing/projects-'.bin2hex(random_bytes(4)));
    File::ensureDirectoryExists($parent);

    $response = $this->post(route('projects.clone'), [
        'repo' => 'https://github.com/owner/cool-repo.git',
        'parent' => $parent,
    ]);

    $response->assertRedirect();
    $run = Run::sole();

    expect($run->kind)->toBe(RunKind::CloneProject)
        ->and($run->target_name)->toBe('cool-repo');

    File::deleteDirectory($parent);
    File::deleteDirectory($cliDir);
});

test('cloning a project locally fails if directory already exists', function () {
    $cliDir = setupCloneCli();
    ChildProcess::fake();

    $parent = ToolLocator::home().'/projects-test-'.bin2hex(random_bytes(4));
    File::ensureDirectoryExists($parent);
    $existing = "{$parent}/existing-app";
    File::ensureDirectoryExists($existing);

    $response = $this->from(route('projects.index'))->post(route('projects.clone'), [
        'repo' => 'https://github.com/laravel/laravel.git',
        'directory' => 'existing-app',
        'parent' => $parent,
    ]);

    $response->assertSessionHasErrors('directory');
    expect(Run::count())->toBe(0);

    File::deleteDirectory($parent);
    File::deleteDirectory($cliDir);
});

test('cloning on a dev box dispatches RunKind::CloneDevBoxProject over SSH', function () {
    $cliDir = setupCloneCli();
    setupCloneExperimental(true);
    setupCloneStacks('ready');
    ChildProcess::fake();

    $response = $this->post(route('projects.clone-dev-box'), [
        'repo' => 'https://github.com/laravel/laravel.git',
        'box' => 'my-dev-box',
        'directory' => 'remote-app',
        'branch' => 'main',
    ]);

    $response->assertRedirect();
    $run = Run::sole();

    expect($run->kind)->toBe(RunKind::CloneDevBoxProject)
        ->and($run->target_name)->toBe('my-dev-box')
        ->and($run->meta['server'])->toBe('my-dev-box')
        ->and($run->meta['app'])->toBe('remote-app');

    File::deleteDirectory($cliDir);
});

test('cloning on a dev box requires experimental settings and ready box', function () {
    setupCloneExperimental(false);

    $response = $this->post(route('projects.clone-dev-box'), [
        'repo' => 'https://github.com/laravel/laravel.git',
        'box' => 'my-dev-box',
    ]);

    $response->assertNotFound();
});

test('pickParentFolder returns JSON path when folder is picked', function () {
    $home = ToolLocator::home();
    $folder = "{$home}/testing-clone-parent-".bin2hex(random_bytes(4));
    File::ensureDirectoryExists($folder);

    $picker = mock(FolderPicker::class);
    $picker->shouldReceive('pick')->once()->andReturn($folder);
    app()->instance(FolderPicker::class, $picker);

    $response = $this->postJson(route('projects.pick-folder'));

    $response->assertOk()
        ->assertJson(['path' => $folder]);

    File::deleteDirectory($folder);
});
