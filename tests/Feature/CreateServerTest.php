<?php

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Native\Desktop\Facades\ChildProcess;

function createServerFakeCli(): string
{
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);
    File::put("{$directory}/larakube", "#!/bin/sh\n");
    chmod("{$directory}/larakube", 0755);

    app()->instance(ToolLocator::class, new ToolLocator([$directory]));

    return $directory;
}

test('creating a server starts a non-interactive cloud:create child process', function () {
    $bin = createServerFakeCli();
    $fake = ChildProcess::fake();

    $response = $this->post(route('servers.store'), [
        'provider' => 'do',
        'stack_name' => 'my-first-server',
        'region' => 'sgp1',
        'size' => 's-1vcpu-2gb',
        'api_token' => 'dop_v1_secret',
    ]);

    $run = Run::sole();
    $response->assertRedirect(route('runs.show', $run));

    expect($run->status)->toBe(RunStatus::Running)
        ->and($run->label)->toBe('Create server my-first-server')
        ->and($run->kind)->toBe(RunKind::CreateServer)
        ->and($run->subject)->toBe('my-first-server')
        ->and($run->meta['targetKind'] ?? null)->toBe('vps')
        ->and(implode(' ', $run->command))->not->toContain('dop_v1_secret');

    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, ?array $env, bool $persistent, mixed ...$rest): bool => $alias === $run->alias()
        && array_slice($cmd, 0, 2) === ['/bin/sh', '-c']
        && str_contains($cmd[2], 'env -i ')
        && str_contains($cmd[2], 'TF_VAR_do_token="$TF_VAR_do_token"')
        && array_slice($cmd, 4) === [
            "{$bin}/larakube", 'cloud:create', '--provider=do', '--vps', '--stack-name=my-first-server',
            '--region=sgp1', '--size=s-1vcpu-2gb', '--json', '--no-interaction',
        ]
        && ! str_contains(implode(' ', $cmd), 'dop_v1_secret')
        && ($env['TF_VAR_do_token'] ?? null) === 'dop_v1_secret'
        && ($env['PATH'] ?? null) === $bin);

    File::deleteDirectory($bin);
});

test('a Cloudflare token given with a new server opts the run into DNS and SSL, and travels by environment only', function () {
    $bin = createServerFakeCli();
    $fake = ChildProcess::fake();

    $this->post(route('servers.store'), [
        'provider' => 'do', 'stack_name' => 'my-first-server', 'region' => 'sgp1', 'size' => 's-1vcpu-2gb',
        'api_token' => 'dop_v1_secret', 'cloudflare_token' => 'cf_secret',
    ])->assertRedirect();

    $run = Run::sole();

    expect(implode(' ', $run->command))->not->toContain('cf_secret');

    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, ?array $env, bool $persistent, mixed ...$rest): bool => in_array('--cloudflare', $cmd, true)
        && ! str_contains(implode(' ', $cmd), 'cf_secret')
        && ($env['LARAKUBE_CLOUDFLARE_TOKEN'] ?? null) === 'cf_secret'
        && ($env['TF_VAR_do_token'] ?? null) === 'dop_v1_secret');

    File::deleteDirectory($bin);
});

test('without a Cloudflare token the server is created as before, with no Cloudflare step', function () {
    $bin = createServerFakeCli();
    $fake = ChildProcess::fake();

    $this->post(route('servers.store'), ['provider' => 'do', 'stack_name' => 'my-first-server', 'region' => 'sgp1', 'size' => 's-1vcpu-2gb', 'api_token' => 'dop_v1_secret'])->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, ?array $env, bool $persistent, mixed ...$rest): bool => ! in_array('--cloudflare', $cmd, true) && ! array_key_exists('LARAKUBE_CLOUDFLARE_TOKEN', $env ?? []));

    File::deleteDirectory($bin);
});

test('server fields are validated before anything runs', function () {
    $bin = createServerFakeCli();
    $fake = ChildProcess::fake();

    $this->post(route('servers.store'), [
        'provider' => 'linode',
        'stack_name' => 'My Server!',
        'region' => 'sgp1; rm -rf',
        'size' => '',
    ])->assertSessionHasErrors(['provider', 'stack_name', 'region', 'size']);

    expect(Run::count())->toBe(0);
    expect($fake->starts)->toBe([]);

    File::deleteDirectory($bin);
});

test('creating a managed cluster passes --managed, --node-count, --ha, and skips --cloudflare', function () {
    $bin = createServerFakeCli();
    $fake = ChildProcess::fake();

    $this->post(route('servers.store'), [
        'provider' => 'gcp',
        'stack_name' => 'my-cluster',
        'region' => 'us-central1',
        'size' => 'e2-medium',
        'target_kind' => 'managed',
        'node_count' => '3',
        'ha' => '1',
        'cloudflare_token' => 'cf_secret',
    ])->assertRedirect();

    $run = Run::sole();
    expect($run->label)->toBe('Create managed cluster my-cluster')
        ->and($run->meta['targetKind'] ?? null)->toBe('managed');

    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, ?array $env, bool $persistent, mixed ...$rest): bool => array_slice($cmd, 4) === [
        "{$bin}/larakube", 'cloud:create', '--provider=gcp', '--managed', '--node-count=3', '--ha',
        '--stack-name=my-cluster', '--region=us-central1', '--size=e2-medium', '--json', '--no-interaction',
    ]);

    File::deleteDirectory($bin);
});

test('a managed cluster without node_count or ha omits those flags, defaulting target_kind to vps otherwise', function () {
    $bin = createServerFakeCli();
    $fake = ChildProcess::fake();

    $this->post(route('servers.store'), [
        'provider' => 'aws',
        'stack_name' => 'my-cluster',
        'region' => 'us-east-1',
        'size' => 't3.medium',
        'target_kind' => 'managed',
        'node_count' => '2',
    ])->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, ?array $env, bool $persistent, mixed ...$rest): bool => in_array('--managed', (array) $cmd, true)
        && in_array('--node-count=2', (array) $cmd, true)
        && ! in_array('--ha', (array) $cmd, true));

    File::deleteDirectory($bin);
});

test('Hetzner cannot be targeted for a managed cluster', function () {
    $bin = createServerFakeCli();
    ChildProcess::fake();

    $this->post(route('servers.store'), [
        'provider' => 'hetzner',
        'stack_name' => 'my-cluster',
        'region' => 'fsn1',
        'size' => 'cx22',
        'target_kind' => 'managed',
        'node_count' => '2',
    ])->assertSessionHasErrors('target_kind');

    expect(Run::count())->toBe(0);

    File::deleteDirectory($bin);
});

test('passing an account attaches the appropriate provider flag to cloud:create', function () {
    $bin = createServerFakeCli();
    $fake = ChildProcess::fake();

    $this->post(route('servers.store'), [
        'provider' => 'aws',
        'stack_name' => 'client-server',
        'region' => 'us-east-1',
        'size' => 't3.small',
        'account' => 'client-acme',
    ])->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd = null, ?array $env = null, bool $persistent = false, mixed ...$rest): bool => in_array('--aws-profile=client-acme', (array) $cmd, true));

    File::deleteDirectory($bin);
});
