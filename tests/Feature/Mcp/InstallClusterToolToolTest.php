<?php

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Mcp\Servers\LaraKubeDesktopServer;
use App\Mcp\Tools\InstallClusterToolTool;
use App\Models\CatalogTool;
use App\Models\Run;
use App\Models\Server;
use App\Models\ServerDomain;
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

test('auto-resolves context from server name when omitted', function () {
    $sandbox = installClusterToolSandbox();
    ChildProcess::fake();
    Sleep::fake();
    installFinishLatestRunOnSleep();

    Server::create([
        'name' => 'gcp-prod',
        'provider' => 'gcp',
        'kind' => 'vps',
        'context' => 'gke_project_us-central1_gcp-prod',
        'status' => 'ready',
    ]);

    $response = LaraKubeDesktopServer::tool(InstallClusterToolTool::class, [
        'server' => 'gcp-prod',
        'tool' => 'n8n',
        'domain' => 'n8n.example.com',
        'wire_sso' => true,
        'wire_mail' => true,
    ]);

    $response->assertOk();

    $run = Run::sole();
    expect($run->context)->toBe('gke_project_us-central1_gcp-prod')
        ->and($run->command)->toContain('--context=gke_project_us-central1_gcp-prod')
        ->and($run->command)->toContain('--wire-sso')
        ->and($run->command)->toContain('--wire-mail');

    File::deleteDirectory($sandbox['home']);
});

test('auto-derives domain when domain is omitted and server has one connected domain', function () {
    $sandbox = installClusterToolSandbox();
    ChildProcess::fake();
    Sleep::fake();
    installFinishLatestRunOnSleep();

    $server = Server::create([
        'name' => 'single-domain-server',
        'provider' => 'gcp',
        'kind' => 'vps',
        'context' => 'larakube-single-domain',
        'status' => 'ready',
    ]);

    ServerDomain::create([
        'server_id' => $server->id,
        'domain' => 'luchtech.dev',
        'external_dns' => true,
        'dns_provider' => 'cloudflare',
        'tls' => true,
        'in_use' => true,
    ]);

    $response = LaraKubeDesktopServer::tool(InstallClusterToolTool::class, [
        'server' => 'single-domain-server',
        'tool' => 'n8n',
    ]);

    $response->assertOk();

    $run = Run::sole();
    expect($run->command)->toContain('--domain=n8n.luchtech.dev');

    File::deleteDirectory($sandbox['home']);
});

test('errors with candidate domains when domain is omitted and server has multiple connected domains', function () {
    $server = Server::create([
        'name' => 'multi-domain-server',
        'provider' => 'gcp',
        'kind' => 'vps',
        'context' => 'larakube-multi-domain',
        'status' => 'ready',
    ]);

    ServerDomain::create([
        'server_id' => $server->id,
        'domain' => 'alpha.com',
        'external_dns' => true,
    ]);

    ServerDomain::create([
        'server_id' => $server->id,
        'domain' => 'beta.com',
        'external_dns' => true,
    ]);

    $response = LaraKubeDesktopServer::tool(InstallClusterToolTool::class, [
        'server' => 'multi-domain-server',
        'tool' => 'n8n',
    ]);

    $response->assertHasErrors(['n8n.alpha.com', 'n8n.beta.com']);
});

test('autocompletes domain based on server connected domains and selected tool', function () {
    $server = Server::create([
        'name' => 'cf-server',
        'provider' => 'gcp',
        'kind' => 'vps',
        'context' => 'larakube-cf-server',
        'status' => 'ready',
    ]);

    ServerDomain::create([
        'server_id' => $server->id,
        'domain' => 'mybrand.dev',
        'external_dns' => true,
        'dns_provider' => 'cloudflare',
        'tls' => true,
        'in_use' => true,
    ]);

    $tool = new InstallClusterToolTool;

    $completion = $tool->complete('domain', '', [
        'arguments' => [
            'server' => 'cf-server',
            'tool' => 'n8n',
        ],
    ])->resolve('');

    $values = $completion->toArray()['values'];
    expect($values)->toContain('n8n.mybrand.dev');
});

test('auto-selects --no-plex standalone SQLite for n8n when no compatible Plex PostgreSQL engine is active', function () {
    $sandbox = installClusterToolSandbox();
    ChildProcess::fake();
    Sleep::fake();
    installFinishLatestRunOnSleep();

    Server::create([
        'name' => 'mysql-only-server',
        'provider' => 'do',
        'kind' => 'vps',
        'context' => 'larakube-mysql-only',
        'status' => 'ready',
        'plex_sync_status' => 'fresh',
        'plex_last_synced_at' => now(),
        'plex_data' => [
            'initialized' => true,
            'services' => [
                'mysql' => ['enabled' => true],
            ],
        ],
    ]);

    CatalogTool::upsertFromPayload([
        'tool' => 'n8n',
        'brand' => 'n8n',
        'label' => 'Workflow Automation (n8n)',
        'supportsNoPlex' => true,
        'commonsCapabilities' => [
            'database' => true,
            'plexDatabases' => ['postgres'],
            'supportsSqlite' => true,
        ],
        'initFields' => [
            [
                'key' => 'noPlex',
                'label' => 'Standalone SQLite (--no-plex)',
                'type' => 'boolean',
                'flag' => '--no-plex',
                'default' => false,
                'role' => 'option',
            ],
        ],
    ]);

    $response = LaraKubeDesktopServer::tool(InstallClusterToolTool::class, [
        'server' => 'mysql-only-server',
        'tool' => 'n8n',
        'domain' => 'n8n.example.com',
    ]);

    $response->assertOk()->assertSee('succeeded');
    $run = Run::sole();
    expect($run->command)->toContain('--no-plex')
        ->and($run->meta['storage_mode'] ?? null)->toBe('standalone')
        ->and($run->meta['storage_database'] ?? null)->toBe('sqlite');

    File::deleteDirectory($sandbox['home']);
});

test('reuses active Plex PostgreSQL for n8n unless options.noPlex=true explicitly overrides', function () {
    $sandbox = installClusterToolSandbox();
    ChildProcess::fake();
    Sleep::fake();
    installFinishLatestRunOnSleep();

    Server::create([
        'name' => 'pg-server',
        'provider' => 'do',
        'kind' => 'vps',
        'context' => 'larakube-pg-server',
        'status' => 'ready',
        'plex_sync_status' => 'fresh',
        'plex_last_synced_at' => now(),
        'plex_data' => [
            'initialized' => true,
            'services' => [
                'postgresql' => ['enabled' => true],
            ],
        ],
    ]);

    CatalogTool::upsertFromPayload([
        'tool' => 'n8n',
        'brand' => 'n8n',
        'label' => 'Workflow Automation (n8n)',
        'supportsNoPlex' => true,
        'commonsCapabilities' => [
            'database' => true,
            'plexDatabases' => ['postgres'],
            'supportsSqlite' => true,
        ],
        'initFields' => [
            [
                'key' => 'noPlex',
                'label' => 'Standalone SQLite (--no-plex)',
                'type' => 'boolean',
                'flag' => '--no-plex',
                'default' => false,
                'role' => 'option',
            ],
        ],
    ]);

    $reuseResponse = LaraKubeDesktopServer::tool(InstallClusterToolTool::class, [
        'server' => 'pg-server',
        'tool' => 'n8n',
        'domain' => 'n8n.example.com',
    ]);
    $reuseResponse->assertOk();
    $firstRun = Run::query()->latest('id')->firstOrFail();
    expect($firstRun->command)->not->toContain('--no-plex')
        ->and($firstRun->meta['storage_mode'] ?? null)->toBe('plex')
        ->and($firstRun->meta['storage_database'] ?? null)->toBe('postgresql');

    installFinishLatestRunOnSleep();
    $overrideResponse = LaraKubeDesktopServer::tool(InstallClusterToolTool::class, [
        'server' => 'pg-server',
        'tool' => 'n8n',
        'domain' => 'n8n2.example.com',
        'options' => ['noPlex' => true],
    ]);
    $overrideResponse->assertOk();
    $secondRun = Run::query()->latest('id')->firstOrFail();
    expect($secondRun->command)->toContain('--no-plex')
        ->and($secondRun->meta['storage_mode'] ?? null)->toBe('standalone');

    File::deleteDirectory($sandbox['home']);
});
