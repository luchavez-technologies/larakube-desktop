<?php

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Mcp\Servers\LaraKubeDesktopServer;
use App\Mcp\Tools\DeleteServerTool;
use App\Models\Run;
use App\Models\Server;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Sleep;
use Native\Desktop\Events\ChildProcess\ErrorReceived;
use Native\Desktop\Events\ChildProcess\ProcessExited;
use Native\Desktop\Facades\ChildProcess;

function deleteServerSandbox(): array
{
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    $bin = "{$home}/bin";
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    return ['home' => realpath($home), 'bin' => $bin];
}

function deleteServerFinishLatestRunOnSleep(int $exitCode = 0, string $output = 'done'): void
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

test('rejects deletion without explicit confirm: true', function () {
    $response = LaraKubeDesktopServer::tool(DeleteServerTool::class, [
        'name' => 'prod-box',
        'confirm' => false,
    ]);

    $response->assertHasErrors(['confirm: true']);
    expect(Run::count())->toBe(0);
});

test('errors when server does not exist', function () {
    $response = LaraKubeDesktopServer::tool(DeleteServerTool::class, [
        'name' => 'nonexistent-server-404',
        'confirm' => true,
    ]);

    $response->assertHasErrors(['No server found']);
    expect(Run::count())->toBe(0);
});

test('destroys server when confirm: true and blocks until run finishes', function () {
    $sandbox = deleteServerSandbox();
    ChildProcess::fake();
    Sleep::fake();
    deleteServerFinishLatestRunOnSleep();

    Server::create([
        'name' => 'old-cluster',
        'provider' => 'gcp',
        'kind' => 'vps',
        'status' => 'ready',
    ]);

    $response = LaraKubeDesktopServer::tool(DeleteServerTool::class, [
        'name' => 'old-cluster',
        'confirm' => true,
    ]);

    $response->assertOk()->assertSee('succeeded');

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::DestroyServer)
        ->and($run->status)->toBe(RunStatus::Succeeded)
        ->and($run->command)->toBe([
            "{$sandbox['bin']}/larakube",
            'cloud:destroy',
            'old-cluster',
            '--force',
            '--no-interaction',
        ]);

    File::deleteDirectory($sandbox['home']);
});
