<?php

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Events\RunFinished;
use App\Listeners\RecordProjectWatchEvents;
use App\Models\LocalClusterState;
use App\Models\Project;
use App\Models\Run;
use App\Services\LaraKube\ProjectWatcher;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Native\Desktop\Facades\ChildProcess;

beforeEach(function (): void {
    $this->fakeBinDir = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($this->fakeBinDir);
    File::put("{$this->fakeBinDir}/larakube", "#!/bin/sh\nexit 0\n");
    chmod("{$this->fakeBinDir}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$this->fakeBinDir]));
    $this->appsDir = storage_path('framework/testing/apps-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists("{$this->appsDir}/shop");
    File::ensureDirectoryExists("{$this->appsDir}/blog");
});

afterEach(function (): void {
    File::deleteDirectory($this->fakeBinDir);
    File::deleteDirectory($this->appsDir);
});

function liveReloadProject(array $attributes = []): Project
{
    return Project::create([
        'path' => test()->appsDir.'/shop',
        'blueprint_cache' => ['name' => 'shop', 'features' => ['horizon']],
        ...$attributes,
    ]);
}

/** @return list<string> */
function watchStarts(object $fake): array
{
    return array_values(array_map(fn (array $start): string => $start['alias'], $fake->starts));
}

test('a running project with live reload on gets a watcher', function (): void {
    $fake = ChildProcess::fake();
    $project = liveReloadProject();

    app(ProjectWatcher::class)->reconcile($project, running: true);

    expect($fake->starts)->toHaveCount(1)
        ->and($fake->starts[0]['alias'])->toBe("watch-project-{$project->id}")
        ->and(implode(' ', (array) $fake->starts[0]['cmd']))->toContain('watch --environment=local --json')
        ->and(app(ProjectWatcher::class)->state($project)['status'])->toBe('starting');
});

test('no watcher starts while the project is down or live reload is off', function (): void {
    $fake = ChildProcess::fake();
    $watcher = app(ProjectWatcher::class);

    $watcher->reconcile(liveReloadProject(), running: false);
    $watcher->reconcile(liveReloadProject(['path' => test()->appsDir.'/blog', 'live_reload' => false]), running: true);

    expect($fake->starts)->toBe([]);
});

test('a project that stops running stops its watcher', function (): void {
    $fake = ChildProcess::fake();
    $project = liveReloadProject();
    $watcher = app(ProjectWatcher::class);

    $watcher->reconcile($project, running: true);
    $watcher->reconcile($project, running: false);

    $fake->assertStop("watch-project-{$project->id}");
    expect($watcher->state($project)['status'])->toBe('stopped');
});

test('events split across chunks are folded into the state', function (): void {
    ChildProcess::fake();
    $project = liveReloadProject();
    $watcher = app(ProjectWatcher::class);
    $watcher->start($project);

    $watcher->record($project->id, '{"event":"watching","targets":["horizon",');
    $watcher->record($project->id, "\"reverb\"]}\n{\"event\":\"changed\",\"at\":\"2026-11-22T10:00:00+00:00\",\"files\":[\"app/Jobs/SendInvoice.php\"]}\n");
    $watcher->record($project->id, '{"event":"reloaded","at":"2026-11-22T10:00:02+00:00","ms":840,"results":[{"target":"horizon","ok":true,"error":null},{"target":"reverb","ok":false,"error":"container not found"}]}'."\n");

    $state = $watcher->state($project);

    expect($state['status'])->toBe('watching')
        ->and($state['targets'])->toBe(['horizon', 'reverb'])
        ->and($state['events'])->toHaveCount(1)
        ->and($state['events'][0]['files'])->toBe(['app/Jobs/SendInvoice.php'])
        ->and($state['events'][0]['reload'])->toBe([
            'targets' => ['horizon', 'reverb'],
            'ok' => false,
            'ms' => 840,
            'errors' => ['reverb' => 'container not found'],
        ])
        ->and($state['lastReloadAt'])->toBe('2026-11-22T10:00:02+00:00')
        ->and($state['lastReloadOk'])->toBeFalse();
});

test('a project with nothing to reload stops watching and is not restarted until its blueprint changes', function (): void {
    $fake = ChildProcess::fake();
    $project = liveReloadProject(['blueprint_cache' => ['name' => 'shop', 'features' => []]]);
    $watcher = app(ProjectWatcher::class);

    $watcher->reconcile($project, running: true);
    $watcher->record($project->id, "{\"event\":\"watching\",\"targets\":[]}\n");

    $fake->assertStop("watch-project-{$project->id}");
    expect($watcher->state($project)['status'])->toBe('idle');

    $watcher->reconcile($project, running: true);
    expect($fake->starts)->toHaveCount(1);

    $project->update(['blueprint_cache' => ['name' => 'shop', 'features' => ['horizon']]]);
    $watcher->reconcile($project, running: true);
    expect($fake->starts)->toHaveCount(2);
});

test('a watcher that exits on its own is a failure', function (): void {
    ChildProcess::fake();
    $project = liveReloadProject();
    $watcher = app(ProjectWatcher::class);
    $watcher->start($project);

    $watcher->exited($project->id, 255);

    expect($watcher->state($project))->toMatchArray([
        'status' => 'failed',
        'error' => 'Live reload stopped unexpectedly (exit code 255).',
    ]);
});

test('a successful local up tries again after an earlier failure', function (): void {
    $fake = ChildProcess::fake();
    $project = liveReloadProject();
    $watcher = app(ProjectWatcher::class);
    $watcher->start($project);
    $watcher->exited($project->id, 1);

    $run = Run::create([
        'label' => 'Up shop',
        'kind' => RunKind::UpProject,
        'status' => RunStatus::Succeeded,
        'project_id' => $project->id,
        'environment' => 'local',
        'command' => [],
        'started_at' => now(),
    ]);

    app(RecordProjectWatchEvents::class)->handleRunFinished(new RunFinished($run));

    expect($fake->starts)->toHaveCount(2)
        ->and($watcher->state($project)['status'])->toBe('starting');
});

test('the workload sync starts watchers for running projects only', function (): void {
    $fake = ChildProcess::fake();
    $running = liveReloadProject();
    liveReloadProject(['path' => test()->appsDir.'/blog', 'blueprint_cache' => ['name' => 'blog']]);
    LocalClusterState::current()->update([
        'workloads_data' => [
            'shop-local' => ['replicas' => 3, 'readyReplicas' => 3, 'deploymentsCount' => 3],
            'blog-local' => ['replicas' => 0, 'readyReplicas' => 0, 'deploymentsCount' => 2],
        ],
    ]);

    app(ProjectWatcher::class)->reconcileAll();

    expect(watchStarts($fake))->toBe(["watch-project-{$running->id}"]);
});

test('the switch turns live reload off and stops the watcher', function (): void {
    $fake = ChildProcess::fake();
    $project = liveReloadProject();
    LocalClusterState::current()->update(['workloads_data' => ['shop-local' => ['replicas' => 1, 'readyReplicas' => 1, 'deploymentsCount' => 1]]]);

    $this->postJson(route('projects.live-reload.update', $project), ['enabled' => true])
        ->assertOk()
        ->assertJson(['enabled' => true, 'status' => 'starting']);

    $this->postJson(route('projects.live-reload.update', $project), ['enabled' => false])
        ->assertOk()
        ->assertJson(['enabled' => false, 'status' => 'stopped'])
        ->assertJsonMissingPath('buffer');

    $fake->assertStop("watch-project-{$project->id}");
    expect($project->refresh()->live_reload)->toBeFalse();

    $this->getJson(route('projects.live-reload.show', $project))->assertOk()->assertJson(['enabled' => false]);
});
