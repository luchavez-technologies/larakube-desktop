<?php

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Mcp\Servers\LaraKubeDesktopServer;
use App\Mcp\Tools\ProjectHealTool;
use App\Models\Project;
use App\Models\Run;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Sleep;
use Native\Desktop\Events\ChildProcess\ErrorReceived;
use Native\Desktop\Events\ChildProcess\ProcessExited;
use Native\Desktop\Facades\ChildProcess;

function projectHealToolSandbox(): array
{
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    $bin = "{$home}/bin";
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    return ['home' => realpath($home), 'bin' => $bin];
}

function healFinishLatestRunOnSleep(int $exitCode = 0, string $output = 'done'): void
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

test('heals a project and blocks until the run finishes', function () {
    $sandbox = projectHealToolSandbox();
    ChildProcess::fake();
    Sleep::fake();
    healFinishLatestRunOnSleep();

    $project = Project::create(['path' => '/code/shop', 'name' => 'shop', 'environment' => 'local']);

    $response = LaraKubeDesktopServer::tool(ProjectHealTool::class, ['project_id' => $project->id]);

    $response->assertOk()->assertSee('succeeded');

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::HealProject)
        ->and($run->status)->toBe(RunStatus::Succeeded)
        ->and($run->command)->toBe(["{$sandbox['bin']}/larakube", 'heal', '--force', '--prune', '--no-interaction']);

    File::deleteDirectory($sandbox['home']);
});

test('errors cleanly when the project does not exist', function () {
    $response = LaraKubeDesktopServer::tool(ProjectHealTool::class, ['project_id' => 999999]);

    $response->assertHasErrors(['No project found']);
    expect(Run::count())->toBe(0);
});
