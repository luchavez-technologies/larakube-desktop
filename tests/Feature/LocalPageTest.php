<?php

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Events\RunFinished;
use App\Models\LocalClusterState;
use App\Models\Project;
use App\Models\Run;
use App\Services\LaraKube\LocalCluster;
use App\Services\LaraKube\LocalHealth;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Inertia\Testing\AssertableInertia;
use Native\Desktop\Facades\ChildProcess;

/**
 * The Local section: this machine's cluster across every project. Health from
 * `doctor --json`, the projects running locally, and the shared companions.
 */
beforeEach(function (): void {
    $this->home = storage_path('framework/testing/local-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists("{$this->home}/bin");
    File::put("{$this->home}/bin/larakube", "#!/bin/sh\n");
    chmod("{$this->home}/bin/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator(["{$this->home}/bin"]));

    $cluster = mock(LocalCluster::class);
    $cluster->shouldReceive('detect')->andReturn(['engine' => 'OrbStack', 'context' => 'orbstack', 'status' => 'Ready', 'tone' => 'ok']);
    app()->instance(LocalCluster::class, $cluster);
});

afterEach(function (): void {
    File::deleteDirectory($this->home);
});

function localPageProject(string $home, string $name, array $blueprint = []): Project
{
    $path = "{$home}/code/{$name}";
    File::ensureDirectoryExists($path);
    File::put("{$path}/.larakube.json", (string) json_encode(['name' => $name, ...$blueprint]));

    return Project::create(['path' => $path]);
}

test('the Local page lists set-up projects, running ones first, with what they use', function (): void {
    localPageProject($this->home, 'blog');
    localPageProject($this->home, 'shop', ['database' => 'pgsql', 'cacheDriver' => 'redis']);
    LocalClusterState::current()->update([
        'workloads_data' => ['shop-local' => ['replicas' => 3, 'readyReplicas' => 3, 'deploymentsCount' => 3]],
        'workloads_last_synced_at' => now(),
    ]);

    $this->get(route('local.index'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('local/index')
            ->where('engine.engine', 'OrbStack')
            ->where('projects.0.name', 'shop')
            ->where('projects.0.localStatus.state', 'running')
            ->where('projects.0.database', 'pgsql')
            ->where('projects.0.cacheDriver', 'redis')
            ->where('projects.0.liveReload.enabled', true)
            ->where('projects.1.name', 'blog')
            ->where('projects.1.localStatus.state', 'down'));
});

test('health comes from doctor --json, issues and fixes included', function (): void {
    Process::fake(['*doctor*' => Process::result(output: "banner\n".json_encode([
        'success' => true,
        'issues' => [['title' => 'Local CA', 'description' => '✗ Not trusted', 'fix' => 'Run: larakube trust']],
    ]))]);

    expect(app(LocalHealth::class)->report())->toBe([
        'checked' => true,
        'issues' => [['title' => 'Local CA', 'description' => '✗ Not trusted', 'fix' => 'Run: larakube trust']],
    ]);
});

test('health is cached until Check again forgets it', function (): void {
    Process::fake(['*doctor*' => Process::result(output: (string) json_encode(['success' => true, 'issues' => []]))]);

    app(LocalHealth::class)->report();
    app(LocalHealth::class)->report();
    Process::assertRanTimes(fn ($process) => str_contains(implode(' ', (array) $process->command), 'doctor'), 1);

    $this->post(route('local.health.refresh'))->assertRedirect();
    app(LocalHealth::class)->report();
    Process::assertRanTimes(fn ($process) => str_contains(implode(' ', (array) $process->command), 'doctor'), 2);
});

test('an unreadable doctor report is "not checked", never an error page', function (): void {
    Process::fake(['*doctor*' => Process::result(output: 'Fatal error', exitCode: 255)]);

    expect(app(LocalHealth::class)->report())->toBe(['checked' => false, 'issues' => []]);
});

test('Clean up runs trust:prune, and its finish refreshes the health report', function (): void {
    $fake = ChildProcess::fake();
    Process::fake(['*doctor*' => Process::result(output: (string) json_encode(['success' => true, 'issues' => []]))]);

    $this->post(route('local.certificates.prune'))->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, -4) === [
        'trust:prune', '--force', '--json', '--no-interaction',
    ]);

    app(LocalHealth::class)->report();
    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::TrustPrune);

    $run->forceFill(['status' => RunStatus::Succeeded])->save();
    RunFinished::dispatch($run);
    app(LocalHealth::class)->report();

    Process::assertRanTimes(fn ($process) => str_contains(implode(' ', (array) $process->command), 'doctor'), 2);
});
