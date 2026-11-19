<?php

use App\Enums\RunKind;
use App\Jobs\Sync\SyncLocalClusterJob;
use App\Models\LocalClusterState;
use App\Models\Project;
use App\Services\Elevation;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\FrameworkCatalog;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\LocalCluster;
use App\Services\LaraKube\ProjectInspector;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\ToolLocator;
use App\Services\Wsl;
use Illuminate\Process\PendingProcess;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Queue;
use Inertia\Testing\AssertableInertia;
use Native\Desktop\Facades\ChildProcess;

const WAKE_LISTING = "  NAME             STATE     VERSION\n* larakube-ubuntu  Stopped   2\n";

test('keeping LaraKube Linux awake holds a sleep process in the distro as a Desktop child process', function () {
    $fake = ChildProcess::fake();
    Process::fake(['*wsl.exe*' => Process::result(output: WAKE_LISTING)]);

    $wsl = new Wsl(windows: true, featureEnabled: true);

    expect($wsl->keepAwake())->toBeTrue()
        ->and($wsl->isWaking())->toBeTrue();
    $fake->assertStarted(fn (array|string $cmd, string $alias, mixed ...$rest): bool => $alias === Wsl::KEEP_AWAKE_ALIAS
        && $cmd === ['wsl.exe', '-d', 'larakube-ubuntu', '--user', 'larakube', '--exec', 'sleep', 'infinity']);
});

test('there is nothing to keep awake off Windows or without the distro', function () {
    $fake = ChildProcess::fake();
    Process::fake(['*wsl.exe*' => Process::result(output: "  NAME     STATE     VERSION\n  Ubuntu   Stopped   2\n")]);

    expect((new Wsl(windows: false, featureEnabled: true))->keepAwake())->toBeFalse()
        ->and((new Wsl(windows: true, featureEnabled: true))->keepAwake())->toBeFalse();
    expect($fake->starts)->toBe([]);
});

test('the Wake up button wakes the distro, shows it starting, and re-syncs the local cluster', function () {
    ChildProcess::fake();
    Queue::fake();
    Process::fake(['*wsl.exe*' => Process::result(output: WAKE_LISTING)]);
    app()->instance(Wsl::class, new Wsl(windows: true, featureEnabled: true));
    LocalClusterState::current()->update(['status' => LocalCluster::ASLEEP_STATUS, 'tone' => 'muted']);

    $this->post(route('local-cluster.wake'))->assertRedirect()->assertSessionHas('success');

    expect(LocalClusterState::current()->status)->toBe(LocalCluster::STARTING_STATUS);
    Queue::assertPushed(SyncLocalClusterJob::class);
});

test('the Wake up button reports an error when there is no distro to wake', function () {
    ChildProcess::fake();
    app()->instance(Wsl::class, new Wsl(windows: false, featureEnabled: false));

    $this->post(route('local-cluster.wake'))->assertRedirect()->assertSessionHasErrors('wake');
});

test('a local up from Desktop keeps the distro awake, so the app does not idle out with it', function () {
    $bin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\nexit 0\n");
    chmod("{$bin}/larakube", 0755);

    $fake = ChildProcess::fake();
    Process::fake(['*wsl.exe*' => Process::result(output: WAKE_LISTING)]);
    app()->instance(Wsl::class, new Wsl(windows: true, featureEnabled: true));

    $runner = new CliRunner(new ToolLocator([$bin]), new Elevation);
    $runner->start(label: 'Start my-app', arguments: ['start'], kind: RunKind::StartProject, environment: 'local');
    $runner->start(label: 'Deploy my-app', arguments: ['cloud:deploy', 'production'], kind: RunKind::DeployApp, environment: 'production');

    $wakes = array_filter($fake->starts, fn (array $start): bool => $start['alias'] === Wsl::KEEP_AWAKE_ALIAS);
    expect($wakes)->toHaveCount(1);

    File::deleteDirectory($bin);
});

test('projects page uses cached DB columns and checks distroIsRunning once without touching WSL filesystem when LaraKube Linux is asleep', function () {
    $bin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube.exe", "#!/bin/sh\n");

    app()->instance(ToolLocator::class, new ToolLocator([$bin], windows: true, wslFeatureEnabled: true));
    app()->instance(Wsl::class, new Wsl(windows: true, featureEnabled: true));

    $wslListCount = 0;
    Process::fake(function (PendingProcess $process) use (&$wslListCount) {
        $cmd = is_array($process->command) ? implode(' ', $process->command) : (string) $process->command;
        if (str_contains($cmd, 'wsl.exe') && str_contains($cmd, '--list')) {
            $wslListCount++;

            return Process::result(output: WAKE_LISTING);
        }

        return Process::result();
    });

    LocalClusterState::current()->update([
        'status' => LocalCluster::ASLEEP_STATUS,
        'tone' => 'muted',
        'workloads_last_synced_at' => now(),
        'workloads_data' => [],
    ]);

    Project::create([
        'path' => '/home/larakube/code/app-one',
        'name' => 'app-one',
        'framework' => 'laravel',
        'web_host' => 'app-one.dev.test',
        'blueprint_cache' => ['name' => 'app-one', 'framework' => 'laravel'],
        'last_inspected_at' => now(),
    ]);
    Project::create([
        'path' => '/home/larakube/code/app-two',
        'name' => 'app-two',
        'framework' => 'docusaurus',
        'web_host' => 'app-two.dev.test',
        'blueprint_cache' => ['name' => 'app-two', 'framework' => 'docusaurus'],
        'last_inspected_at' => now(),
    ]);

    // Guard against any filesystem / git access on \\wsl.localhost by asserting
    // detectGit() and detect() are never invoked while the distro is Stopped.
    $inspector = new class(app(FrameworkCatalog::class)) extends ProjectInspector
    {
        public int $filesystemReads = 0;

        public function detectGit(string $path): array
        {
            $this->filesystemReads++;

            return parent::detectGit($path);
        }

        public function detect(string $path): ?string
        {
            $this->filesystemReads++;

            return parent::detect($path);
        }
    };
    app()->instance(ProjectInspector::class, $inspector);

    $this->get(route('projects.index'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('localAsleep', true)
            ->has('projects', 2)
            ->where('projects.0.name', 'app-two')
            ->where('projects.1.name', 'app-one'));

    expect($inspector->filesystemReads)->toBe(0);

    // Verify wsl.exe --list --running --verbose ran at most once per request, not once per project.
    expect($wslListCount)->toBeLessThanOrEqual(1);

    File::deleteDirectory($bin);
});

test('dashboard defers use cached DB columns without waking a stopped LaraKube Linux distro', function () {
    $settings = mock(GlobalSettings::class);
    $settings->shouldReceive('hasCompletedOnboarding')->andReturnTrue();
    $settings->shouldReceive('hideProjects')->andReturnFalse();
    $settings->shouldReceive('experimental')->andReturnFalse();
    $settings->shouldReceive('demoMode')->andReturnFalse();
    app()->instance(GlobalSettings::class, $settings);

    $bin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube.exe", "#!/bin/sh\n");

    app()->instance(ToolLocator::class, new ToolLocator([$bin], windows: true, wslFeatureEnabled: true));
    app()->instance(Wsl::class, new Wsl(windows: true, featureEnabled: true));

    $wslListCount = 0;
    Process::fake(function (PendingProcess $process) use (&$wslListCount) {
        $cmd = is_array($process->command) ? implode(' ', $process->command) : (string) $process->command;
        if (str_contains($cmd, 'wsl.exe') && str_contains($cmd, '--list')) {
            $wslListCount++;

            return Process::result(output: WAKE_LISTING);
        }

        return Process::result();
    });

    LocalClusterState::current()->update([
        'status' => LocalCluster::ASLEEP_STATUS,
        'tone' => 'muted',
        'last_synced_at' => now(),
    ]);

    Project::create([
        'path' => '/home/larakube/code/cached-app',
        'name' => 'cached-app',
        'framework' => 'laravel',
        'web_host' => 'cached-app.dev.test',
        'blueprint_cache' => ['name' => 'cached-app', 'framework' => 'laravel'],
        'last_inspected_at' => null,
    ]);

    $inspector = new class(app(FrameworkCatalog::class)) extends ProjectInspector
    {
        public int $filesystemReads = 0;

        public function detectGit(string $path): array
        {
            $this->filesystemReads++;

            return parent::detectGit($path);
        }
    };
    app()->instance(ProjectInspector::class, $inspector);

    $readiness = mock(ReadinessCheck::class);
    $readiness->shouldReceive('tools')->andReturn([]);
    app()->instance(ReadinessCheck::class, $readiness);

    $this->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->loadDeferredProps(fn (AssertableInertia $reload) => $reload
                ->where('stats.projectsCount', 1)
                ->has('projects', 1)
                ->where('projects.0.name', 'cached-app')));

    expect($inspector->filesystemReads)->toBe(0);

    File::deleteDirectory($bin);

    File::deleteDirectory($bin);
});

test('a list of projects asks wsl.exe whether LaraKube Linux is running once, not once per project', function () {
    app()->instance(ToolLocator::class, new ToolLocator([], windows: true, wslFeatureEnabled: true));
    app()->instance(Wsl::class, new Wsl(windows: true, featureEnabled: true));
    app()->forgetScopedInstances();
    Process::fake(['*wsl.exe*' => Process::result(output: WAKE_LISTING)]);

    $projects = collect(['app-one', 'app-two', 'app-three'])
        ->map(fn (string $name): Project => new Project(['path' => "/home/larakube/code/{$name}"]));

    expect($projects->every(fn (Project $p): bool => $p->existsOnHost()))->toBeTrue();
    Process::assertRanTimes(fn ($process): bool => str_contains(implode(' ', (array) $process->command), '--list'), 1);
});
