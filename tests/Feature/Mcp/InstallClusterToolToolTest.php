<?php

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Mcp\Servers\LaraKubeDesktopServer;
use App\Mcp\Tools\InstallClusterToolTool;
use App\Models\Run;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Sleep;
use Native\Desktop\Events\ChildProcess\ErrorReceived;
use Native\Desktop\Events\ChildProcess\ProcessExited;
use Native\Desktop\Facades\ChildProcess;

function installClusterToolSandbox(): array
{
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    $bin = "{$home}/bin";
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    return ['home' => realpath($home), 'bin' => $bin];
}

function installFinishLatestRunOnSleep(int $exitCode = 0, string $output = 'done'): void
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

test('installs a cluster tool and blocks until the run finishes', function () {
    $sandbox = installClusterToolSandbox();
    ChildProcess::fake();
    Sleep::fake();
    installFinishLatestRunOnSleep();

    $response = LaraKubeDesktopServer::tool(InstallClusterToolTool::class, [
        'server' => 'workshop-demo',
        'context' => 'larakube-203.0.113.21',
        'tool' => 'pocketbase',
        'domain' => 'pocketbase.example.com',
    ]);

    $response->assertOk()->assertSee('succeeded');

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::InstallClusterTool)
        ->and($run->status)->toBe(RunStatus::Succeeded)
        ->and($run->command)->toBe([
            "{$sandbox['bin']}/larakube",
            'tool:add',
            '--tool=pocketbase',
            '--context=larakube-203.0.113.21',
            '--domain=pocketbase.example.com',
            '--no-wire-sso',
            '--no-wire-mail',
            '--force',
            '--no-interaction',
        ]);

    File::deleteDirectory($sandbox['home']);
});

test('includes an admin email flag when one is given', function () {
    $sandbox = installClusterToolSandbox();
    ChildProcess::fake();
    Sleep::fake();
    installFinishLatestRunOnSleep();

    LaraKubeDesktopServer::tool(InstallClusterToolTool::class, [
        'server' => 'workshop-demo',
        'context' => 'larakube-203.0.113.21',
        'tool' => 'freescout',
        'domain' => 'desk.example.com',
        'admin_email' => 'admin@example.com',
    ]);

    expect(Run::sole()->command)->toContain('--admin-email=admin@example.com');

    File::deleteDirectory($sandbox['home']);
});
