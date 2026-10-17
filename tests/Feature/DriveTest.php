<?php

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Jobs\Sync\SyncClusterToolsJob;
use App\Jobs\Sync\SyncDriveJob;
use App\Models\Run;
use App\Models\Server;
use App\Services\LaraKube\DriveStatus;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Queue;
use Native\Desktop\Events\ChildProcess\ProcessExited;
use Native\Desktop\Facades\ChildProcess;

function driveTestServer(): string
{
    $bin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    $stacks = mock(StackCatalog::class);
    $stacks->shouldReceive('all')->andReturn([
        [
            'name' => 'prod-vps',
            'provider' => 'digitalocean',
            'kind' => 'vps',
            'region' => 'ams3',
            'ip' => '1.2.3.4',
            'context' => 'larakube-do-ams3',
            'status' => 'ready',
        ],
    ]);
    $stacks->shouldReceive('find')->with('prod-vps')->andReturn([
        'name' => 'prod-vps',
        'provider' => 'digitalocean',
        'kind' => 'vps',
        'region' => 'ams3',
        'ip' => '1.2.3.4',
        'context' => 'larakube-do-ams3',
        'status' => 'ready',
    ]);
    $stacks->shouldReceive('find')->with('non-existent')->andReturn(null);
    app()->instance(StackCatalog::class, $stacks);

    return "{$bin}/larakube";
}

test('/drive redirects to the first ready server', function () {
    driveTestServer();

    $this->get('/drive')
        ->assertRedirect(route('servers.drive.index', 'prod-vps'));
});

test('viewing drive page for unready server returns 404', function () {
    driveTestServer();

    $this->get(route('servers.drive.index', 'non-existent'))
        ->assertNotFound();
});

test('viewing drive page renders drive/index with installation status', function () {
    driveTestServer();

    $driveStatus = mock(DriveStatus::class);
    $driveStatus->shouldReceive('isInstalled')->with('larakube-do-ams3')->andReturn(true);
    $driveStatus->shouldReceive('serverInfo')->with('larakube-do-ams3')->andReturn([
        'installed' => true,
        'host' => 'drive.example.com',
        'url' => 'https://drive.example.com',
        'adminUsername' => 'admin',
        'adminPassword' => 'ocis-pass-123',
        'storageMode' => 'Plex Commons (MinIO S3)',
        'bucket' => 'drive-bucket',
        'office' => [
            'installed' => true,
            'ready' => true,
            'host' => 'office.drive.example.com',
            'url' => 'https://office.drive.example.com',
        ],
        'components' => [
            ['name' => 'drive-ocis', 'ready' => true, 'replicas' => '1/1', 'restartCount' => 0],
            ['name' => 'drive-code', 'ready' => true, 'replicas' => '1/1', 'restartCount' => 0],
        ],
    ]);
    $driveStatus->shouldReceive('extensions')->with('larakube-do-ams3')->andReturn([
        [
            'id' => 'web-app-draw-io',
            'name' => 'Draw.io',
            'description' => 'Diagramming tool',
            'version' => 'v0.2.0',
            'category' => 'Diagrams',
            'installed' => true,
        ],
    ]);
    $driveStatus->shouldReceive('syncState')->with('larakube-do-ams3')->andReturn([
        'status' => 'fresh',
        'lastSyncedAt' => now()->toAtomString(),
        'error' => null,
    ]);
    app()->instance(DriveStatus::class, $driveStatus);

    $this->get(route('servers.drive.index', 'prod-vps'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('drive/index')
            ->where('server.name', 'prod-vps')
            ->where('isInstalled', true)
            ->has('domains')
            ->has('isLocal')
            ->has('localTld')
        );
});

test('deploying Drive starts a drive-deploy run with options', function () {
    $bin = driveTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.drive.deploy', 'prod-vps'), [
        'domain' => 'drive.example.com',
        'enable_office' => true,
        'vpn_only' => true,
        'extensions' => ['drawio', 'excalidraw'],
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'tool:init', '--tool=ocis', 'production', '--context=larakube-do-ams3',
            '--force', '--domain=drive.example.com',
            '--vpn-only', '--extensions=drawio,excalidraw', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::DriveDeploy)
        ->and($run->meta['enable_office'])->toBe('1')
        ->and($run->meta['domain'])->toBe('drive.example.com')
        ->and($run->meta['vpn_only'])->toBe('1');
});

test('deploying Collabora Online starts a drive-office-deploy run', function () {
    $bin = driveTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.drive.office.deploy', 'prod-vps'), [
        'domain' => 'office.drive.example.com',
        'vpn_only' => true,
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'drive:office:init', 'production', '--context=larakube-do-ams3',
            '--force', '--domain=office.drive.example.com', '--vpn-only', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::DriveOfficeDeploy);
});

test('installing web extension starts a drive-install-extension run', function () {
    $bin = driveTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.drive.extensions.install', 'prod-vps'), [
        'extension' => 'com.github.lukashirt.excalidraw',
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'drive:ext:add', 'production', '--context=larakube-do-ams3',
            '--extension=com.github.lukashirt.excalidraw', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::DriveInstallExtension)
        ->and($run->subject)->toBe('com.github.lukashirt.excalidraw');
});

test('uninstalling web extension starts a drive-uninstall-extension run', function () {
    $bin = driveTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.drive.extensions.uninstall', 'prod-vps'), [
        'extension' => 'web-app-draw-io',
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'drive:ext:remove', 'production', '--context=larakube-do-ams3',
            '--extension=web-app-draw-io', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::DriveUninstallExtension)
        ->and($run->subject)->toBe('web-app-draw-io');
});

test('restarting Drive starts a drive-restart run', function () {
    $bin = driveTestServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.drive.restart', 'prod-vps'))
        ->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'tool:init', '--tool=ocis', 'production', '--context=larakube-do-ams3',
            '--force', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::DriveRestart);
});

test('destroying Drive starts a drive-remove run with force and optional purge', function () {
    $bin = driveTestServer();
    $fake = ChildProcess::fake();

    $this->delete(route('servers.drive.destroy', 'prod-vps'), [
        'purge' => true,
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'ocis:remove', 'production', '--context=larakube-do-ams3',
            '--force', '--purge', '--no-interaction',
        ];
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::DriveRemove);
});

test('drive run completion triggers sync jobs and chains office if requested', function () {
    Queue::fake();

    $server = Server::create([
        'name' => 'prod-vps',
        'provider' => 'digitalocean',
        'kind' => 'vps',
        'context' => 'larakube-do-ams3',
        'status' => 'ready',
    ]);

    $bin = driveTestServer();

    $fake = ChildProcess::fake();

    $run = Run::create([
        'label' => 'Deploy ownCloud Drive on prod-vps',
        'command' => ['larakube', 'tool:init', '--tool=ocis', 'production'],
        'arguments' => ['tool:init', '--tool=ocis', 'production'],
        'kind' => RunKind::DriveDeploy,
        'status' => RunStatus::Running,
        'subject' => 'prod-vps',
        'meta' => [
            'server' => 'prod-vps',
            'context' => 'larakube-do-ams3',
            'enable_office' => true,
            'domain' => 'drive.example.com',
        ],
        'started_at' => now(),
    ]);

    event(new ProcessExited($run->alias(), 0));

    $run->refresh();
    expect($run->status)->toBe(RunStatus::Succeeded);

    Queue::assertPushed(SyncClusterToolsJob::class);
    Queue::assertPushed(SyncDriveJob::class);

    // Assert that Collabora Online deploy run was automatically started
    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($bin): bool {
        return array_slice((array) $cmd, 4) === [
            $bin, 'drive:office:init', 'production', '--context=larakube-do-ams3',
            '--force', '--domain=drive.example.com', '--no-interaction',
        ];
    });
});
