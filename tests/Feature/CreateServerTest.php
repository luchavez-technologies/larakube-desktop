<?php

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Models\Run;
use App\Models\Server;
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

test('creating a managed cluster passes --managed, --node-count, --ha, and supports --cloudflare', function () {
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
        '--stack-name=my-cluster', '--region=us-central1', '--size=e2-medium', '--json', '--cloudflare', '--no-interaction',
    ] && ($env['LARAKUBE_CLOUDFLARE_TOKEN'] ?? null) === 'cf_secret');

    File::deleteDirectory($bin);
});

test('creating a server with Route53 DNS passes --dns-provider=route53 and credentials in environment only', function () {
    $bin = createServerFakeCli();
    $fake = ChildProcess::fake();

    $this->post(route('servers.store'), [
        'provider' => 'aws',
        'stack_name' => 'my-aws-server',
        'region' => 'us-east-1',
        'size' => 't3.small',
        'dns_provider' => 'route53',
        'dns_aws_access_key_id' => 'AKIA123',
        'dns_aws_secret_access_key' => 'aws_secret',
        'enable_dns' => '1',
        'enable_tls' => '0',
    ])->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, ?array $env, bool $persistent, mixed ...$rest): bool => in_array('--dns-provider=route53', (array) $cmd, true)
        && in_array('--without-tls', (array) $cmd, true)
        && ! in_array('--without-dns', (array) $cmd, true)
        && ! str_contains(implode(' ', (array) $cmd), 'aws_secret')
        && ($env['AWS_ACCESS_KEY_ID'] ?? null) === 'AKIA123'
        && ($env['AWS_SECRET_ACCESS_KEY'] ?? null) === 'aws_secret');

    File::deleteDirectory($bin);
});

test('creating a server with Google Cloud DNS passes --dns-provider=google and credentials in environment only', function () {
    $bin = createServerFakeCli();
    $fake = ChildProcess::fake();

    $this->post(route('servers.store'), [
        'provider' => 'gcp',
        'stack_name' => 'my-gcp-server',
        'region' => 'us-central1',
        'size' => 'e2-small',
        'dns_provider' => 'google',
        'dns_gcp_project_id' => 'my-project-123',
        'dns_gcp_credentials' => '{"type": "service_account"}',
        'enable_dns' => '0',
        'enable_tls' => '1',
    ])->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, ?array $env, bool $persistent, mixed ...$rest): bool => in_array('--dns-provider=google', (array) $cmd, true)
        && in_array('--without-dns', (array) $cmd, true)
        && ! in_array('--without-tls', (array) $cmd, true)
        && ! str_contains(implode(' ', (array) $cmd), 'service_account')
        && ($env['GCP_PROJECT_ID'] ?? null) === 'my-project-123'
        && ($env['GCP_SERVICE_ACCOUNT_JSON'] ?? null) === '{"type": "service_account"}');

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

test('cannot start a server creation when one for the same name is already running', function () {
    $bin = createServerFakeCli();
    ChildProcess::fake();

    Run::create([
        'label' => 'Create server active-box',
        'command' => ['larakube', 'cloud:create'],
        'status' => RunStatus::Running,
        'kind' => RunKind::CreateServer,
        'subject' => 'active-box',
    ]);

    $this->post(route('servers.store'), [
        'provider' => 'do',
        'stack_name' => 'active-box',
        'region' => 'sgp1',
        'size' => 's-1vcpu-2gb',
        'api_token' => 'dop_v1_secret',
    ])->assertSessionHasErrors('stack_name');

    File::deleteDirectory($bin);
});

test('creating a server with custom ssh_port passes --ssh-port to cloud:create', function () {
    $bin = createServerFakeCli();
    $fake = ChildProcess::fake();

    $this->post(route('servers.store'), [
        'provider' => 'do',
        'stack_name' => 'campus-vps',
        'region' => 'sgp1',
        'size' => 's-1vcpu-2gb',
        'api_token' => 'dop_v1_secret',
        'ssh_port' => 8443,
    ])->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd = null, ?array $env = null, bool $persistent = false, mixed ...$rest): bool => in_array('--ssh-port=8443', (array) $cmd, true));

    File::deleteDirectory($bin);
});

test('creating a server with default ssh_port 22 omits --ssh-port', function () {
    $bin = createServerFakeCli();
    $fake = ChildProcess::fake();

    $this->post(route('servers.store'), [
        'provider' => 'do',
        'stack_name' => 'standard-vps',
        'region' => 'sgp1',
        'size' => 's-1vcpu-2gb',
        'api_token' => 'dop_v1_secret',
        'ssh_port' => 22,
    ])->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd = null, ?array $env = null, bool $persistent = false, mixed ...$rest): bool => ! in_array('--ssh-port=22', (array) $cmd, true));

    File::deleteDirectory($bin);
});

test('conflicting ssh ports are rejected with specific error messages', function () {
    $bin = createServerFakeCli();
    ChildProcess::fake();

    // Port 443
    $this->post(route('servers.store'), [
        'provider' => 'do',
        'stack_name' => 'clash-vps',
        'region' => 'sgp1',
        'size' => 's-1vcpu-2gb',
        'ssh_port' => 443,
    ])->assertSessionHasErrors(['ssh_port' => 'Port 443 is reserved for Traefik HTTPS ingress on single-node VPS clusters.']);

    // Port 80
    $this->post(route('servers.store'), [
        'provider' => 'do',
        'stack_name' => 'clash-vps-2',
        'region' => 'sgp1',
        'size' => 's-1vcpu-2gb',
        'ssh_port' => 80,
    ])->assertSessionHasErrors(['ssh_port' => 'Port 80 is reserved for Traefik HTTP web ingress.']);

    // Port 2222
    $this->post(route('servers.store'), [
        'provider' => 'do',
        'stack_name' => 'clash-vps-3',
        'region' => 'sgp1',
        'size' => 's-1vcpu-2gb',
        'ssh_port' => 2222,
    ])->assertSessionHasErrors(['ssh_port' => 'Port 2222 is reserved for Git (Forgejo) SSH service.']);

    // Out of range
    $this->post(route('servers.store'), [
        'provider' => 'do',
        'stack_name' => 'clash-vps-4',
        'region' => 'sgp1',
        'size' => 's-1vcpu-2gb',
        'ssh_port' => 70000,
    ])->assertSessionHasErrors('ssh_port');

    File::deleteDirectory($bin);
});

test('Server::syncFromStack persists port from stack', function () {
    $server = Server::syncFromStack([
        'name' => 'campus-server',
        'provider' => 'do',
        'kind' => 'vps',
        'port' => 8443,
        'status' => 'ready',
    ]);

    expect($server->port)->toBe(8443);
});

test('onboarding an existing server executes cloud:init with flags and records server in database', function () {
    $bin = createServerFakeCli();
    $fake = ChildProcess::fake();

    $response = $this->post(route('servers.store'), [
        'provider' => 'existing',
        'stack_name' => 'bare-metal-box',
        'ip' => '192.168.1.100',
        'ssh_user' => 'ubuntu',
        'ssh_key' => '/tmp/test_id_rsa',
        'ssh_port' => 2200,
        'ssh_passphrase' => 'unlock-secret-123',
    ]);

    $run = Run::sole();
    $response->assertRedirect(route('runs.show', $run));

    expect($run->status)->toBe(RunStatus::Running)
        ->and($run->label)->toBe('Provision existing server bare-metal-box (192.168.1.100)')
        ->and($run->kind)->toBe(RunKind::CreateServer)
        ->and($run->subject)->toBe('bare-metal-box')
        ->and(implode(' ', $run->command))->not->toContain('unlock-secret-123');

    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, ?array $env, bool $persistent, mixed ...$rest): bool => $alias === $run->alias()
        && in_array('cloud:init', $cmd, true)
        && in_array('--ip=192.168.1.100', $cmd, true)
        && in_array('--ssh-user=ubuntu', $cmd, true)
        && in_array('--ssh-key=/tmp/test_id_rsa', $cmd, true)
        && in_array('--ssh-port=2200', $cmd, true)
        && in_array('--stack-name=bare-metal-box', $cmd, true)
        && in_array('--without-dns', $cmd, true)
        && in_array('--without-tls', $cmd, true)
        && ! str_contains(implode(' ', $cmd), 'unlock-secret-123')
        && ($env['LARAKUBE_SSH_PASSPHRASE'] ?? null) === 'unlock-secret-123');

    $server = Server::where('name', 'bare-metal-box')->first();
    expect($server)->not->toBeNull()
        ->and($server->provider)->toBe('custom')
        ->and($server->ip)->toBe('192.168.1.100')
        ->and($server->port)->toBe(2200)
        ->and($server->status)->toBe('provisioning');

    File::deleteDirectory($bin);
});

test('existing server onboarding validates required ip and ssh_key', function () {
    $this->post(route('servers.store'), [
        'provider' => 'existing',
        'stack_name' => 'bare-metal-fail',
    ])->assertSessionHasErrors(['ip', 'ssh_key']);
});

test('inspect key endpoint validates existence and detects passphrase', function () {
    $tempDir = storage_path('framework/testing/keys-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($tempDir);
    $keyPath = "{$tempDir}/id_ed25519";
    File::put($keyPath, "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gt\n-----END OPENSSH PRIVATE KEY-----\n");

    $response = $this->postJson('/servers/inspect-key', [
        'path' => $keyPath,
    ]);

    $response->assertOk()
        ->assertJson([
            'valid' => true,
            'encrypted' => false,
        ]);

    File::deleteDirectory($tempDir);
});
