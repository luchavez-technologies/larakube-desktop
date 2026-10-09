<?php

use App\Enums\RunKind;
use App\Models\Project;
use App\Models\Run;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Inertia\Testing\AssertableInertia;
use Native\Desktop\Events\ChildProcess\ProcessExited;
use Native\Desktop\Facades\ChildProcess;

function serversFakeCli(): string
{
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);
    File::put("{$directory}/larakube", "#!/bin/sh\n");
    chmod("{$directory}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$directory]));

    return $directory;
}

/**
 * @return array<int, array<string, mixed>>
 */
function serversStacks(): array
{
    return [
        ['name' => 'workshop-demo', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'asia-east1', 'ip' => '203.0.113.21', 'context' => 'larakube-203.0.113.21', 'account' => null, 'projectId' => 'demo', 'status' => 'ready'],
        ['name' => 'cancel-test', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'asia-northeast1', 'ip' => null, 'context' => null, 'account' => null, 'projectId' => null, 'status' => 'unfinished'],
    ];
}

function serversFakeStacks(): void
{
    Process::fake(['*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => serversStacks()]))]);
}

test('the servers list is read from cloud:stacks --json', function () {
    $bin = serversFakeCli();
    serversFakeStacks();

    $this->get(route('servers.index'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('servers/index')
            ->loadDeferredProps(fn (AssertableInertia $reload) => $reload
                ->has('servers', 2)
                ->where('servers.0.name', 'workshop-demo')
                ->where('servers.1.status', 'unfinished')));

    File::deleteDirectory($bin);
});

test('a CLI without cloud:stacks --json gives a null list instead of an error page', function () {
    $bin = serversFakeCli();
    Process::fake(['*cloud:stacks*' => Process::result(errorOutput: 'The "--json" option does not exist.', exitCode: 1)]);

    $this->get(route('servers.index'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->loadDeferredProps(fn (AssertableInertia $reload) => $reload->where('servers', null)));

    File::deleteDirectory($bin);
});

test('a server page shows that server, and an unknown one is a 404', function () {
    $bin = serversFakeCli();
    serversFakeStacks();

    $this->get(route('servers.show', 'workshop-demo'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('servers/show')
            ->where('server.ip', '203.0.113.21')
            ->has('projects'));

    $this->get(route('servers.show', 'nope'))->assertNotFound();

    File::deleteDirectory($bin);
});

test('a server page flags itself unreachable when the live kubectl check fails, without changing the stored status', function () {
    $bin = serversFakeCli();
    File::put("{$bin}/kubectl", "#!/bin/sh\n");
    chmod("{$bin}/kubectl", 0755);
    Cache::flush();
    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => serversStacks()])),
        '*--raw=/readyz*' => Process::result(exitCode: 1),
    ]);

    $this->get(route('servers.show', 'workshop-demo'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('server.status', 'ready')
            ->loadDeferredProps(fn (AssertableInertia $reload) => $reload->where('reachable', false)));

    File::deleteDirectory($bin);
});

test('a server page lists projects bound to that server', function () {
    $bin = serversFakeCli();
    serversFakeStacks();

    $projectDir = storage_path('framework/testing/project-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($projectDir);
    File::put("{$projectDir}/.larakube.json", json_encode([
        'name' => 'acme-app',
        'framework' => 'laravel',
        'environments' => [
            'production' => ['hosts' => ['web' => 'acme.example.com']],
        ],
    ]));
    File::put("{$projectDir}/.larakube.local.json", json_encode([
        'environments' => [
            'production' => [
                'cloud' => ['ip' => '203.0.113.21', 'context' => 'larakube-203.0.113.21'],
            ],
        ],
    ]));

    Project::create(['path' => $projectDir]);

    $this->get(route('servers.show', 'workshop-demo'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('servers/show')
            ->has('projects', 1)
            ->where('projects.0.name', 'acme-app')
            ->where('projects.0.serverIp', '203.0.113.21'));

    File::deleteDirectory($projectDir);
    File::deleteDirectory($bin);
});

test('destroying needs the exact name typed and then runs cloud:destroy --force', function () {
    $bin = serversFakeCli();
    serversFakeStacks();
    $fake = ChildProcess::fake();

    $this->delete(route('servers.destroy', 'cancel-test'), ['confirm' => 'cancel-tes'])->assertSessionHasErrors('confirm');
    expect(Run::count())->toBe(0);

    $this->delete(route('servers.destroy', 'cancel-test'), ['confirm' => 'cancel-test'])
        ->assertRedirect(route('runs.show', Run::sole()));

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::DestroyServer)
        ->and($run->subject)->toBe('cancel-test');

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === ["{$bin}/larakube", 'cloud:destroy', 'cancel-test', '--force', '--no-interaction']);

    File::deleteDirectory($bin);
});

test('destroying a server the CLI does not know is a 404 and runs nothing', function () {
    $bin = serversFakeCli();
    serversFakeStacks();
    $fake = ChildProcess::fake();

    $this->delete(route('servers.destroy', 'ghost'), ['confirm' => 'ghost'])->assertNotFound();

    expect($fake->starts)->toBe([]);

    File::deleteDirectory($bin);
});

test('activity lists runs newest first', function () {
    Run::create(['label' => 'Create server one', 'kind' => RunKind::CreateServer, 'subject' => 'one', 'command' => ['larakube']]);
    Run::create(['label' => 'Destroy server one', 'kind' => RunKind::DestroyServer, 'subject' => 'one', 'command' => ['larakube']]);

    $this->get(route('runs.index'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('runs/index')
            ->where('runs.0.label', 'Destroy server one')
            ->where('runs.0.kind', 'destroy-server')
            ->where('runs.0.targetType', 'server')
            ->where('runs.0.targetName', 'one')
            ->where('runs.1.label', 'Create server one')
            ->where('runs.1.targetType', 'server')
            ->where('runs.1.targetName', 'one'));
});

test('Connect a domain runs tool:init for external-dns against the server with the token in the environment only', function () {
    $bin = serversFakeCli();
    serversFakeStacks();
    $fake = ChildProcess::fake();

    $this->post(route('servers.dns', 'workshop-demo'), ['cloudflare_token' => ''])->assertSessionHasErrors('cloudflare_token');
    $this->post(route('servers.dns', 'cancel-test'), ['cloudflare_token' => 'cf-token'])->assertNotFound();

    $this->post(route('servers.dns', 'workshop-demo'), ['cloudflare_token' => 'cf-token', 'group' => 'company-domains'])
        ->assertRedirect(route('runs.show', Run::sole()));

    expect(Run::sole()->kind)->toBe(RunKind::ConnectDomain)
        ->and(json_encode(Run::sole()->command))->not->toContain('cf-token');

    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, ?array $env, mixed ...$rest): bool => array_slice($cmd, 4) === ["{$bin}/larakube", 'tool:init', 'production', '--tool=external-dns', '--context=larakube-203.0.113.21', '--group=company-domains', '--force', '--no-interaction']
        && ! str_contains(implode(' ', $cmd), 'cf-token')
        && ($env['LARAKUBE_CLOUDFLARE_TOKEN'] ?? null) === 'cf-token');

    File::deleteDirectory($bin);
});

test('Automatic SSL runs tls:init and can reuse the stored token', function () {
    $bin = serversFakeCli();
    serversFakeStacks();
    $fake = ChildProcess::fake();

    $this->post(route('servers.tls', 'workshop-demo'), [])->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, ?array $env, mixed ...$rest): bool => array_slice($cmd, 4) === ["{$bin}/larakube", 'tls:init', 'production', '--context=larakube-203.0.113.21', '--force', '--no-interaction']
        && ! array_key_exists('LARAKUBE_CLOUDFLARE_TOKEN', $env ?? []));

    File::deleteDirectory($bin);
});

test('the server page asks the server for DNS accounts and certificate status', function () {
    $bin = serversFakeCli();
    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => serversStacks()])),
        '*dns:list*' => Process::result(output: json_encode([
            ['zone' => 'one.example', 'slug' => 'first', 'owner' => 'o1', 'ready' => true],
            ['zone' => 'two.example', 'slug' => 'first', 'owner' => 'o1', 'ready' => true],
            ['zone' => 'three.example', 'slug' => 'second', 'owner' => 'o2', 'ready' => false],
        ], JSON_PRETTY_PRINT)),
        '*tls:show*' => Process::result(output: "Challenge: Cloudflare DNS\n".json_encode(['success' => true, 'challenge' => 'dns', 'zones' => ['one.example'], 'cannotRenew' => []])),
    ]);

    $this->get(route('servers.show', 'workshop-demo'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->missing('dns')
            ->loadDeferredProps(['dns', 'tls'], fn (AssertableInertia $reload) => $reload
                ->where('dns', [
                    ['group' => 'first', 'zones' => ['one.example', 'two.example'], 'ready' => true],
                    ['group' => 'second', 'zones' => ['three.example'], 'ready' => false],
                ])
                ->where('tls.challenge', 'dns')));

    Process::assertRan(fn ($process) => str_contains(implode(' ', (array) $process->command), '--context=larakube-203.0.113.21'));

    File::deleteDirectory($bin);
});

test('an unfinished server never asks the cluster for DNS or certificates', function () {
    $bin = serversFakeCli();
    serversFakeStacks();

    $this->get(route('servers.show', 'cancel-test'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->loadDeferredProps(['dns', 'tls'], fn (AssertableInertia $reload) => $reload->where('dns', null)->where('tls', null)));

    Process::assertNotRan(fn ($process) => str_contains(implode(' ', (array) $process->command), 'dns:list'));

    File::deleteDirectory($bin);
});

test('a finished Connect a domain run drops the cached DNS status', function () {
    Cache::put('cluster-status:dns:larakube-203.0.113.21', [['group' => 'old', 'zones' => [], 'ready' => true]]);
    $run = Run::create(['label' => 'DNS', 'kind' => RunKind::ConnectDomain, 'subject' => 'workshop-demo', 'meta' => ['server' => 'workshop-demo', 'context' => 'larakube-203.0.113.21'], 'command' => ['larakube']]);

    event(new ProcessExited($run->alias(), 0));

    expect(Cache::has('cluster-status:dns:larakube-203.0.113.21'))->toBeFalse();
});

test('a server page asks for its backup state on its own, in one call', function () {
    $bin = serversFakeCli();
    serversFakeStacks();
    Cache::flush();

    $this->get(route('servers.show', 'workshop-demo'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->missing('backup'));

    File::deleteDirectory($bin);
});
