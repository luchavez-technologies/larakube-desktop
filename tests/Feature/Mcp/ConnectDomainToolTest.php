<?php

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Mcp\Servers\LaraKubeDesktopServer;
use App\Mcp\Tools\ConnectDomainTool;
use App\Models\Run;
use App\Models\Server;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Sleep;
use Native\Desktop\Events\ChildProcess\ErrorReceived;
use Native\Desktop\Events\ChildProcess\ProcessExited;
use Native\Desktop\Facades\ChildProcess;

/**
 * @return array{home: string, bin: string}
 */
function connectDomainSandbox(): array
{
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    $bin = "{$home}/bin";
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    return ['home' => realpath($home), 'bin' => $bin];
}

function connectDomainFinishLatestRunOnSleep(int $exitCode = 0, string $output = 'done'): void
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

test('connect-domain runs tool:init external-dns and passes token via secretEnvironment', function () {
    $sandbox = connectDomainSandbox();
    $fake = ChildProcess::fake();
    Sleep::fake();
    connectDomainFinishLatestRunOnSleep();

    Server::updateOrCreate(['name' => 'prod-server'], [
        'provider' => 'gcp',
        'kind' => 'vps',
        'context' => 'larakube-gcp-prod',
        'status' => 'ready',
    ]);

    $response = LaraKubeDesktopServer::tool(ConnectDomainTool::class, [
        'server' => 'prod-server',
        'cloudflare_token' => 'cf-test-token-789',
        'enable_tls' => true,
    ]);

    $response->assertOk();

    $run = Run::where('kind', RunKind::ConnectDomain)->sole();
    expect($run->status)->toBe(RunStatus::Succeeded)
        ->and($run->command)->toContain('tool:init')
        ->and($run->command)->toContain('--tool=external-dns')
        ->and($run->command)->toContain('--context=larakube-gcp-prod')
        ->and($run->command)->toContain('--provider=cloudflare')
        ->and($run->meta['also_enable_tls'])->toBe('1');

    // Also assert that the follow-up SSL run was automatically triggered by RecordRunOutput
    expect(Run::where('kind', RunKind::EnableSsl)->exists())->toBeTrue();

    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, ?array $env, bool $persistent, mixed ...$rest): bool => in_array('--tool=external-dns', (array) $cmd, true) &&
        ($env['LARAKUBE_CLOUDFLARE_TOKEN'] ?? null) === 'cf-test-token-789'
    );

    File::deleteDirectory($sandbox['home']);
});

test('connect-domain auto-detects LARAKUBE_CLOUDFLARE_TOKEN from environment if omitted', function () {
    $sandbox = connectDomainSandbox();
    $fake = ChildProcess::fake();
    Sleep::fake();
    connectDomainFinishLatestRunOnSleep();

    Server::updateOrCreate(['name' => 'env-server'], [
        'provider' => 'do',
        'kind' => 'vps',
        'context' => 'larakube-do-prod',
        'status' => 'ready',
    ]);

    putenv('LARAKUBE_CLOUDFLARE_TOKEN=env-token-xyz');

    try {
        $response = LaraKubeDesktopServer::tool(ConnectDomainTool::class, [
            'server' => 'env-server',
        ]);

        $response->assertOk();

        $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, ?array $env, bool $persistent, mixed ...$rest): bool => ($env['LARAKUBE_CLOUDFLARE_TOKEN'] ?? null) === 'env-token-xyz'
        );
    } finally {
        putenv('LARAKUBE_CLOUDFLARE_TOKEN');
    }

    File::deleteDirectory($sandbox['home']);
});

test('connect-domain rejects missing server name', function () {
    $response = LaraKubeDesktopServer::tool(ConnectDomainTool::class, [
        'server' => '',
    ]);

    $response->assertHasErrors(['A server name is required']);
    expect(Run::count())->toBe(0);
});

test('connect-domain autocompletes server and dns_provider', function () {
    Server::updateOrCreate(['name' => 'cluster-alpha'], ['provider' => 'gcp', 'kind' => 'vps', 'status' => 'ready']);
    Server::updateOrCreate(['name' => 'cluster-beta'], ['provider' => 'aws', 'kind' => 'vps', 'status' => 'ready']);

    $tool = new ConnectDomainTool;

    $response = $tool->complete('server', 'cluster', [])->resolve('cluster');
    $servers = $response->toArray()['values'];
    expect($servers)->toContain('cluster-alpha')->toContain('cluster-beta');

    $responseDns = $tool->complete('dns_provider', 'cloud', [])->resolve('cloud');
    $providers = $responseDns->toArray()['values'];
    expect($providers)->toContain('cloudflare');
});
