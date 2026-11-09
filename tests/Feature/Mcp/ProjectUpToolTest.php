<?php

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Mcp\Servers\LaraKubeDesktopServer;
use App\Mcp\Tools\ProjectUpTool;
use App\Models\Project;
use App\Models\Run;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Sleep;
use Native\Desktop\Events\ChildProcess\ErrorReceived;
use Native\Desktop\Events\ChildProcess\ProcessExited;
use Native\Desktop\Facades\ChildProcess;

/**
 * Mirrors the sandbox tests/Feature/ProjectsTest.php's projectsSandbox() helper uses
 * (a fake larakube binary on disk, so ToolLocator::find('larakube') resolves).
 */
function projectUpToolSandbox(): array
{
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    $bin = "{$home}/bin";
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    return ['home' => realpath($home), 'bin' => $bin];
}

/**
 * The poll loop's Sleep::sleep(1) is the only hook point to simulate the run
 * finishing, since Sleep::fake() makes every call instant rather than running
 * a real NativePHP ChildProcess event round-trip during the test.
 */
function finishLatestRunOnSleep(int $exitCode = 0, string $output = 'done'): void
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

test('brings a project up and blocks until the run finishes', function () {
    $sandbox = projectUpToolSandbox();
    ChildProcess::fake();
    Sleep::fake();
    finishLatestRunOnSleep();

    $project = Project::create(['path' => '/code/shop', 'name' => 'shop', 'environment' => 'local']);

    $response = LaraKubeDesktopServer::tool(ProjectUpTool::class, ['project_id' => $project->id]);

    $response->assertOk()->assertSee('succeeded');

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::UpProject)
        ->and($run->status)->toBe(RunStatus::Succeeded)
        ->and($run->command)->toBe(["{$sandbox['bin']}/larakube", 'up', 'local', '--no-console', '--no-test', '--no-interaction']);

    File::deleteDirectory($sandbox['home']);
});

test('errors cleanly when the project does not exist', function () {
    $response = LaraKubeDesktopServer::tool(ProjectUpTool::class, ['project_id' => 999999]);

    $response->assertHasErrors(['No project found']);
    expect(Run::count())->toBe(0);
});

test('times out without failing the run when it runs long', function () {
    $sandbox = projectUpToolSandbox();
    ChildProcess::fake();
    // syncWithCarbon: true advances now() by each slept duration, so the poll
    // loop's 120s deadline is reached instantly instead of hanging the test.
    // No finishLatestRunOnSleep() call — the run deliberately never finishes.
    Sleep::fake(syncWithCarbon: true);

    $project = Project::create(['path' => '/code/shop', 'name' => 'shop', 'environment' => 'local']);

    $response = LaraKubeDesktopServer::tool(ProjectUpTool::class, ['project_id' => $project->id]);

    $response->assertHasErrors(['Timed out', 'get-run-status']);
    expect(Run::sole()->status)->toBe(RunStatus::Running);

    File::deleteDirectory($sandbox['home']);
});
