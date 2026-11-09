<?php

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Mcp\Servers\LaraKubeDesktopServer;
use App\Mcp\Tools\RemoveClusterToolTool;
use App\Models\Run;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Sleep;
use Native\Desktop\Events\ChildProcess\ErrorReceived;
use Native\Desktop\Events\ChildProcess\ProcessExited;
use Native\Desktop\Facades\ChildProcess;

function removeClusterToolSandbox(): array
{
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    $bin = "{$home}/bin";
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    return ['home' => realpath($home), 'bin' => $bin];
}

function removeFinishLatestRunOnSleep(int $exitCode = 0, string $output = 'done'): void
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

test('removes a cluster tool and blocks until the run finishes', function () {
    $sandbox = removeClusterToolSandbox();
    ChildProcess::fake();
    Sleep::fake();
    removeFinishLatestRunOnSleep();

    $response = LaraKubeDesktopServer::tool(RemoveClusterToolTool::class, [
        'server' => 'workshop-demo',
        'context' => 'larakube-203.0.113.21',
        'tool' => 'pocketbase',
    ]);

    $response->assertOk()->assertSee('succeeded');

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::RemoveClusterTool)
        ->and($run->status)->toBe(RunStatus::Succeeded)
        ->and($run->command)->toBe([
            "{$sandbox['bin']}/larakube",
            'pocketbase:remove',
            'production',
            '--context=larakube-203.0.113.21',
            '--force',
            '--no-interaction',
        ]);

    File::deleteDirectory($sandbox['home']);
});

test('rejects a purge without confirm, and never starts a run', function () {
    $sandbox = removeClusterToolSandbox();
    ChildProcess::fake();

    $response = LaraKubeDesktopServer::tool(RemoveClusterToolTool::class, [
        'server' => 'workshop-demo',
        'context' => 'larakube-203.0.113.21',
        'tool' => 'pocketbase',
        'purge' => true,
    ]);

    $response->assertHasErrors(['confirm: true']);
    expect(Run::count())->toBe(0);

    File::deleteDirectory($sandbox['home']);
});

test('purges when confirmed, and includes a domain when given', function () {
    $sandbox = removeClusterToolSandbox();
    ChildProcess::fake();
    Sleep::fake();
    removeFinishLatestRunOnSleep();

    LaraKubeDesktopServer::tool(RemoveClusterToolTool::class, [
        'server' => 'workshop-demo',
        'context' => 'larakube-203.0.113.21',
        'tool' => 'pocketbase',
        'domain' => 'pb.example.com',
        'purge' => true,
        'confirm' => true,
    ]);

    expect(Run::sole()->command)->toBe([
        "{$sandbox['bin']}/larakube",
        'pocketbase:remove',
        'production',
        '--context=larakube-203.0.113.21',
        '--domain=pb.example.com',
        '--purge',
        '--force',
        '--no-interaction',
    ]);

    File::deleteDirectory($sandbox['home']);
});
