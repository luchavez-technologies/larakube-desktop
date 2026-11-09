<?php

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Mcp\Servers\LaraKubeDesktopServer;
use App\Mcp\Tools\CreateServerTool;
use App\Models\CloudProvider;
use App\Models\Run;
use App\Models\Server;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Sleep;
use Native\Desktop\Events\ChildProcess\ErrorReceived;
use Native\Desktop\Events\ChildProcess\ProcessExited;
use Native\Desktop\Facades\ChildProcess;

function createServerSandbox(): array
{
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    $bin = "{$home}/bin";
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    return ['home' => realpath($home), 'bin' => $bin];
}

function createServerFinishLatestRunOnSleep(int $exitCode = 0, string $output = 'done'): void
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

test('creates a server with cloud provider smart defaults and blocks until the run finishes', function () {
    $sandbox = createServerSandbox();
    ChildProcess::fake();
    Sleep::fake();
    createServerFinishLatestRunOnSleep();

    CloudProvider::updateOrCreate(['slug' => 'gcp'], [
        'label' => 'Google Cloud',
        'default_region' => 'us-central1',
        'default_vps_size' => 'e2-standard-2',
        'active_account' => 'prod-project',
    ]);

    $response = LaraKubeDesktopServer::tool(CreateServerTool::class, [
        'provider' => 'gcp',
        'stack_name' => 'gcp-prod',
    ]);

    $response->assertOk()->assertSee('ready');

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::CreateServer)
        ->and($run->status)->toBe(RunStatus::Succeeded)
        ->and($run->command)->toContain('cloud:create')
        ->and($run->command)->toContain('--provider=gcp')
        ->and($run->command)->toContain('--vps')
        ->and($run->command)->toContain('--stack-name=gcp-prod')
        ->and($run->command)->toContain('--region=us-central1')
        ->and($run->command)->toContain('--size=e2-standard-2')
        ->and($run->command)->toContain('--gcp-account=prod-project');

    $server = Server::where('name', 'gcp-prod')->first();
    expect($server)->not->toBeNull()
        ->and($server->provider)->toBe('gcp');

    File::deleteDirectory($sandbox['home']);
});

test('creates a managed cluster with node count and ha flag', function () {
    $sandbox = createServerSandbox();
    ChildProcess::fake();
    Sleep::fake();
    createServerFinishLatestRunOnSleep();

    $response = LaraKubeDesktopServer::tool(CreateServerTool::class, [
        'provider' => 'do',
        'stack_name' => 'doks-cluster',
        'target_kind' => 'managed',
        'region' => 'nyc1',
        'size' => 's-2vcpu-4gb',
        'node_count' => 3,
        'ha' => true,
    ]);

    $response->assertOk();

    $run = Run::sole();
    expect($run->command)->toContain('--managed')
        ->and($run->command)->toContain('--node-count=3')
        ->and($run->command)->toContain('--ha')
        ->and($run->command)->toContain('--region=nyc1')
        ->and($run->command)->toContain('--size=s-2vcpu-4gb');

    File::deleteDirectory($sandbox['home']);
});

test('creates a custom vps with ip and ssh credentials', function () {
    $sandbox = createServerSandbox();
    ChildProcess::fake();
    Sleep::fake();
    createServerFinishLatestRunOnSleep();

    $response = LaraKubeDesktopServer::tool(CreateServerTool::class, [
        'provider' => 'custom',
        'stack_name' => 'vps-manual',
        'ip' => '198.51.100.5',
        'ssh_user' => 'ubuntu',
        'ssh_key' => '~/.ssh/id_ed25519',
        'ssh_port' => 2200,
    ]);

    $response->assertOk();

    $run = Run::sole();
    expect($run->command)->toContain('cloud:init')
        ->and($run->command)->toContain('198.51.100.5')
        ->and($run->command)->toContain('--ssh-user=ubuntu')
        ->and($run->command)->toContain('--ssh-key=~/.ssh/id_ed25519')
        ->and($run->command)->toContain('--ssh-port=2200');

    File::deleteDirectory($sandbox['home']);
});

test('rejects creation when stack name is invalid', function () {
    $response = LaraKubeDesktopServer::tool(CreateServerTool::class, [
        'provider' => 'gcp',
        'stack_name' => 'INVALID_NAME!',
    ]);

    $response->assertHasErrors(['Invalid stack_name']);
    expect(Run::count())->toBe(0);
});

test('rejects creation when run is already in progress for stack name', function () {
    $sandbox = createServerSandbox();
    ChildProcess::fake();

    Run::create([
        'kind' => RunKind::CreateServer,
        'status' => RunStatus::Running,
        'subject' => 'busy-box',
        'label' => 'Creating server busy-box',
        'command' => ['cloud:create'],
    ]);

    $response = LaraKubeDesktopServer::tool(CreateServerTool::class, [
        'provider' => 'do',
        'stack_name' => 'busy-box',
    ]);

    $response->assertHasErrors(['already in progress']);

    File::deleteDirectory($sandbox['home']);
});

test('times out gracefully returning status provisioning and run_id', function () {
    $sandbox = createServerSandbox();
    ChildProcess::fake();
    Sleep::fake(syncWithCarbon: true);

    $response = LaraKubeDesktopServer::tool(CreateServerTool::class, [
        'provider' => 'gcp',
        'stack_name' => 'slow-gcp',
        'region' => 'us-central1',
        'size' => 'e2-medium',
    ]);

    $response->assertOk()->assertSee('provisioning')->assertSee('get-run-status');
    expect(Run::sole()->status)->toBe(RunStatus::Running);

    File::deleteDirectory($sandbox['home']);
});

test('passes cloudflare token into secretEnvironment and sets --cloudflare', function () {
    $sandbox = createServerSandbox();
    $fake = ChildProcess::fake();
    Sleep::fake();
    createServerFinishLatestRunOnSleep();

    $response = LaraKubeDesktopServer::tool(CreateServerTool::class, [
        'provider' => 'gcp',
        'stack_name' => 'gcp-cf',
        'cloudflare_token' => 'cf-secret-token-123',
    ]);

    $response->assertOk();

    $run = Run::sole();
    expect($run->command)->toContain('--cloudflare');

    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, ?array $env, bool $persistent, mixed ...$rest): bool => in_array('--cloudflare', (array) $cmd, true) &&
        ($env['LARAKUBE_CLOUDFLARE_TOKEN'] ?? null) === 'cf-secret-token-123'
    );

    File::deleteDirectory($sandbox['home']);
});

test('auto-detects LARAKUBE_CLOUDFLARE_TOKEN from environment when omitted in request', function () {
    $sandbox = createServerSandbox();
    $fake = ChildProcess::fake();
    Sleep::fake();
    createServerFinishLatestRunOnSleep();

    putenv('LARAKUBE_CLOUDFLARE_TOKEN=env-cf-token-456');

    try {
        $response = LaraKubeDesktopServer::tool(CreateServerTool::class, [
            'provider' => 'gcp',
            'stack_name' => 'gcp-env-cf',
        ]);

        $response->assertOk();

        $run = Run::sole();
        expect($run->command)->toContain('--cloudflare');

        $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, ?array $env, bool $persistent, mixed ...$rest): bool => in_array('--cloudflare', (array) $cmd, true) &&
            ($env['LARAKUBE_CLOUDFLARE_TOKEN'] ?? null) === 'env-cf-token-456'
        );
    } finally {
        putenv('LARAKUBE_CLOUDFLARE_TOKEN');
    }

    File::deleteDirectory($sandbox['home']);
});
