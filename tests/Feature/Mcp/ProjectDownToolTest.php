<?php

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Mcp\Servers\LaraKubeDesktopServer;
use App\Mcp\Tools\ProjectDownTool;
use App\Models\Project;
use App\Models\Run;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Sleep;
use Native\Desktop\Events\ChildProcess\ErrorReceived;
use Native\Desktop\Events\ChildProcess\ProcessExited;
use Native\Desktop\Facades\ChildProcess;

function projectDownToolSandbox(): array
{
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    $bin = "{$home}/bin";
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    return ['home' => realpath($home), 'bin' => $bin];
}

function downFinishLatestRunOnSleep(int $exitCode = 0, string $output = 'done'): void
{
    Sleep::whenFakingSleep(function () use ($exitCode, $output): void {
        $run = Run::query()->latest('id')->first();

        if ($run === null) {
            return;
        }

        event(new ErrorReceived($run->alias(), $output));
        event(new ProcessExited($run->alias(), $exitCode));
    });
}

test('brings a project down and blocks until the run finishes', function () {
    $sandbox = projectDownToolSandbox();
    ChildProcess::fake();
    Sleep::fake();
    downFinishLatestRunOnSleep();

    $project = Project::create(['path' => '/code/shop', 'name' => 'shop', 'environment' => 'local']);

    $response = LaraKubeDesktopServer::tool(ProjectDownTool::class, ['project_id' => $project->id]);

    $response->assertOk()->assertSee('succeeded');

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::DownProject)
        ->and($run->status)->toBe(RunStatus::Succeeded)
        ->and($run->command)->toBe(["{$sandbox['bin']}/larakube", 'down', 'local', '--force', '--no-interaction']);

    File::deleteDirectory($sandbox['home']);
});

test('rejects a purge without confirm, and never starts a run', function () {
    $sandbox = projectDownToolSandbox();
    ChildProcess::fake();

    $project = Project::create(['path' => '/code/shop', 'name' => 'shop', 'environment' => 'local']);

    $response = LaraKubeDesktopServer::tool(ProjectDownTool::class, ['project_id' => $project->id, 'purge' => true]);

    $response->assertHasErrors(['confirm: true']);
    expect(Run::count())->toBe(0);

    File::deleteDirectory($sandbox['home']);
});

test('purges when confirmed', function () {
    $sandbox = projectDownToolSandbox();
    ChildProcess::fake();
    Sleep::fake();
    downFinishLatestRunOnSleep();

    $project = Project::create(['path' => '/code/shop', 'name' => 'shop', 'environment' => 'local']);

    $response = LaraKubeDesktopServer::tool(ProjectDownTool::class, ['project_id' => $project->id, 'purge' => true, 'confirm' => true]);

    $response->assertOk();

    $run = Run::sole();
    expect($run->command)->toBe(["{$sandbox['bin']}/larakube", 'down', 'local', '--force', '--full', '--no-interaction']);

    File::deleteDirectory($sandbox['home']);
});

test('errors cleanly when the project does not exist', function () {
    $response = LaraKubeDesktopServer::tool(ProjectDownTool::class, ['project_id' => 999999]);

    $response->assertHasErrors(['No project found']);
    expect(Run::count())->toBe(0);
});
