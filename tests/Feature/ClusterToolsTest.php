<?php

use App\Enums\ActivityType;
use App\Enums\RunKind;
use App\Jobs\Sync\SyncClusterToolsJob;
use App\Jobs\Sync\SyncServerDomainsJob;
use App\Models\Activity;
use App\Models\ClusterTool;
use App\Models\Run;
use App\Models\Server;
use App\Services\LaraKube\ToolCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Queue;
use Inertia\Testing\AssertableInertia;
use Native\Desktop\Events\ChildProcess\ProcessExited;
use Native\Desktop\Facades\ChildProcess;
use Native\Desktop\Facades\Shell;

/** Seeds a server with an already-synced tool list, the way SyncClusterToolsJob leaves it. */
function clusterToolsSeed(string $context, array $tools, ?int $checkedAt, string $serverName = 'workshop-demo'): Server
{
    $server = Server::updateOrCreate(['name' => $serverName], [
        'provider' => 'gcp', 'kind' => 'vps', 'context' => $context, 'status' => 'ready',
    ]);

    foreach ($tools as $position => $row) {
        ClusterTool::updateOrCreate(
            ['server_id' => $server->id, 'tool' => $row['tool'], 'host' => $row['host'] ?? null],
            [
                'instance' => $row['instance'] ?? null,
                'installed' => (bool) ($row['installed'] ?? false),
                'multi_instance' => $row['multiInstance'] ?? true,
                'position' => $position,
                'data' => $row,
                'sync_status' => $checkedAt !== null ? 'fresh' : 'stale',
                'last_synced_at' => $checkedAt !== null ? Carbon::createFromTimestamp($checkedAt) : null,
            ],
        );
    }

    return $server;
}

function clusterToolsFakeCli(): string
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
function clusterToolsRows(): array
{
    $row = fn (string $tool, string $brand, string $label, bool $installed, ?string $host): array => [
        'tool' => $tool, 'instance' => '', 'icon' => '*', 'brand' => $brand, 'label' => $label, 'installed' => $installed,
        'removeCommand' => $tool === 'sso' ? 'zitadel:remove' : $tool.':remove',
        'namespace' => 'larakube-shared', 'host' => $host, 'aliases' => [], 'url' => $host ? "https://{$host}" : null,
        'installedAt' => null, 'mail' => 'N/A', 'sso' => $installed ? 'wired' : '—', 'sync' => 'N/A', 'rotation' => 'N/A', 'vpn' => 'N/A', 'db_role' => null,
    ];

    return [
        $row('sso', 'SSO', 'Identity Provider / SSO (Zitadel)', true, 'sso.example.com'),
        $row('crm', 'CRM', 'CRM (Twenty)', false, null),
    ];
}

function clusterToolsFakes(): void
{
    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'workshop-demo', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'asia-east1', 'ip' => '203.0.113.21', 'context' => 'larakube-203.0.113.21', 'account' => null, 'projectId' => null, 'status' => 'ready'],
            ['name' => 'cancel-test', 'provider' => 'gcp', 'kind' => 'vps', 'region' => null, 'ip' => null, 'context' => null, 'account' => null, 'projectId' => null, 'status' => 'unfinished'],
        ]])),
        '*tool:list*' => Process::result(output: json_encode(clusterToolsRows(), JSON_PRETTY_PRINT)),
    ]);
}

test('Tools in the sidebar opens the first ready server', function () {
    $bin = clusterToolsFakeCli();
    clusterToolsFakes();

    $this->get(route('tools'))->assertRedirect(route('servers.tools.index', 'workshop-demo'));

    File::deleteDirectory($bin);
});

test('the tools list comes from tool:list for the server context and is cached', function () {
    $bin = clusterToolsFakeCli();
    clusterToolsFakes();

    $this->get(route('servers.tools.index', 'workshop-demo'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('tools/index')
            ->where('server.name', 'workshop-demo')
            ->has('servers', 1)
            ->loadDeferredProps(fn (AssertableInertia $reload) => $reload
                ->has('tools', 2)
                ->where('tools.0.tool', 'sso')
                ->where('tools.1.installed', false)));

    app(ToolCatalog::class)->forContext('larakube-203.0.113.21');

    $ranToolList = fn (bool $registryOnly) => fn ($process) => str_contains(implode(' ', (array) $process->command), 'tool:list')
        && str_contains(implode(' ', (array) $process->command), '--context=larakube-203.0.113.21')
        && str_contains(implode(' ', (array) $process->command), '--registry-only') === $registryOnly;

    // One fast registry read, one full verification, then both come from cache.
    Process::assertRanTimes($ranToolList(true), 1);
    Process::assertRanTimes($ranToolList(false), 1);

    File::deleteDirectory($bin);
});

test('the fast registry list and the verified list are separate deferred props', function () {
    $bin = clusterToolsFakeCli();
    clusterToolsFakes();

    $this->get(route('servers.tools.index', 'workshop-demo'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->missing('registered')
            ->missing('tools')
            ->loadDeferredProps('registered', fn (AssertableInertia $reload) => $reload->has('registered', 2)->missing('tools')));

    File::deleteDirectory($bin);
});

test('forgetting a server marks its verified list stale but keeps it to show meanwhile', function () {
    Queue::fake();
    Cache::put('cluster-tools:ctx:registered', [['tool' => 'sso']]);
    $server = clusterToolsSeed('ctx', [['tool' => 'sso', 'host' => null]], now()->getTimestamp());

    app(ToolCatalog::class)->forget('ctx');
    $last = app(ToolCatalog::class)->lastVerified('ctx');

    expect($server->clusterTools()->sole()->sync_status)->toBe('stale')
        ->and($last['checkedAt'])->toBeNull()
        ->and($last['tools'][0])->toMatchArray(['tool' => 'sso', 'installed' => false])
        ->and(Cache::has('cluster-tools:ctx:registered'))->toBeFalse();

    Queue::assertPushed(SyncClusterToolsJob::class, fn ($job): bool => $job->serverId === $server->id);
});

test('a fresh verified list renders at once, with no live check', function () {
    $bin = clusterToolsFakeCli();
    clusterToolsFakes();
    clusterToolsSeed('larakube-203.0.113.21', clusterToolsRows(), now()->subMinutes(5)->getTimestamp());

    $this->get(route('servers.tools.index', 'workshop-demo'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->has('tools', 2)
            ->has('lastVerified', 2)
            ->missing('registered')
            ->whereNot('checkedAt', null));

    Process::assertNotRan(fn ($process): bool => str_contains(implode(' ', (array) $process->command), 'tool:list'));

    File::deleteDirectory($bin);
});

test('an old verified list shows while the live check re-runs in the background', function () {
    $bin = clusterToolsFakeCli();
    clusterToolsFakes();
    clusterToolsSeed('larakube-203.0.113.21', [clusterToolsRows()[0]], now()->subSeconds(ToolCatalog::FRESH_SECONDS + 60)->getTimestamp());

    $this->get(route('servers.tools.index', 'workshop-demo'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->has('lastVerified', 1)
            ->missing('registered')
            ->missing('tools')
            ->loadDeferredProps('tools', fn (AssertableInertia $reload) => $reload->has('tools', 2)));

    expect(app(ToolCatalog::class)->lastVerified('larakube-203.0.113.21')['tools'])->toHaveCount(2);

    File::deleteDirectory($bin);
});

test('Refresh re-checks a fresh list', function () {
    $bin = clusterToolsFakeCli();
    clusterToolsFakes();
    clusterToolsSeed('larakube-203.0.113.21', clusterToolsRows(), now()->getTimestamp());

    $this->post(route('servers.tools.refresh', 'workshop-demo'))->assertRedirect(route('servers.tools.index', 'workshop-demo'));

    // The re-check dispatched by Refresh runs immediately under the sync queue driver,
    // so by the next visit the list is already fresh again rather than still deferred.
    $this->get(route('servers.tools.index', 'workshop-demo'))
        ->assertInertia(fn (AssertableInertia $page) => $page->has('lastVerified', 2)->has('tools', 2));

    File::deleteDirectory($bin);
});

test('an unfinished server has no tools page', function () {
    $bin = clusterToolsFakeCli();
    clusterToolsFakes();

    $this->get(route('servers.tools.index', 'cancel-test'))->assertNotFound();

    File::deleteDirectory($bin);
});

test('installing validates the domain and runs tool:add against the server context', function () {
    $bin = clusterToolsFakeCli();
    clusterToolsFakes();
    $fake = ChildProcess::fake();

    $this->post(route('servers.tools.store', ['server' => 'workshop-demo', 'tool' => 'crm']), ['domain' => 'https://example.com/'])
        ->assertSessionHasErrors('domain');
    expect(Run::count())->toBe(0);

    $this->post(route('servers.tools.store', ['server' => 'workshop-demo', 'tool' => 'crm']), ['domain' => 'example.com', 'wire_sso' => '1'])
        ->assertRedirect(route('runs.show', Run::sole()));

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::InstallClusterTool)
        ->and($run->label)->toBe('Install CRM on workshop-demo')
        ->and($run->meta)->toBe(['server' => 'workshop-demo', 'context' => 'larakube-203.0.113.21', 'tool' => 'crm', 'host' => 'example.com']);

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        "{$bin}/larakube", 'tool:add', '--tool=crm', '--context=larakube-203.0.113.21', '--domain=example.com', '--wire-sso', '--no-wire-mail', '--force', '--no-interaction',
    ]);

    File::deleteDirectory($bin);
});

test('installing with a specific domain host targets that host', function () {
    $bin = clusterToolsFakeCli();
    clusterToolsFakes();
    $fake = ChildProcess::fake();

    $this->post(route('servers.tools.store', ['server' => 'workshop-demo', 'tool' => 'crm']), [
        'domain' => 'staging.example.com',
        'wire_sso' => '0',
    ])->assertRedirect(route('runs.show', Run::sole()));

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::InstallClusterTool)
        ->and($run->label)->toBe('Install CRM on workshop-demo')
        ->and($run->meta)->toBe(['server' => 'workshop-demo', 'context' => 'larakube-203.0.113.21', 'tool' => 'crm', 'host' => 'staging.example.com']);

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        "{$bin}/larakube", 'tool:add', '--tool=crm', '--context=larakube-203.0.113.21', '--domain=staging.example.com', '--no-wire-sso', '--no-wire-mail', '--force', '--no-interaction',
    ]);

    File::deleteDirectory($bin);
});

test('installing an additional deployment of a tool succeeds with its host', function () {
    $bin = clusterToolsFakeCli();
    $rows = [
        [
            'tool' => 'pocketbase', 'instance' => 'existing-tenant', 'icon' => '*', 'brand' => 'PocketBase', 'label' => 'PocketBase', 'installed' => true,
            'namespace' => 'larakube-shared', 'host' => 'existing.example.com', 'aliases' => [], 'url' => 'https://existing.example.com',
            'installedAt' => null, 'mail' => 'N/A', 'sso' => 'wired', 'sync' => 'N/A', 'rotation' => 'N/A', 'vpn' => 'N/A', 'db_role' => null,
        ],
    ];
    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'workshop-demo', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'asia-east1', 'ip' => '203.0.113.21', 'context' => 'larakube-203.0.113.21', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ]])),
        '*tool:list*' => Process::result(output: json_encode($rows, JSON_PRETTY_PRINT)),
    ]);
    $fake = ChildProcess::fake();

    $this->post(route('servers.tools.store', ['server' => 'workshop-demo', 'tool' => 'pocketbase']), [
        'domain' => 'pocket-test.example.com',
        'admin_email' => 'admin@example.com',
        'wire_sso' => '0',
    ])->assertRedirect(route('runs.show', Run::sole()));

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::InstallClusterTool)
        ->and($run->label)->toBe('Install PocketBase on workshop-demo')
        ->and($run->meta)->toBe(['server' => 'workshop-demo', 'context' => 'larakube-203.0.113.21', 'tool' => 'pocketbase', 'host' => 'pocket-test.example.com', 'admin_email' => 'admin@example.com']);

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        "{$bin}/larakube", 'tool:add', '--tool=pocketbase', '--context=larakube-203.0.113.21', '--domain=pocket-test.example.com', '--admin-email=admin@example.com', '--no-wire-sso', '--no-wire-mail', '--force', '--no-interaction',
    ]);

    File::deleteDirectory($bin);
});

test('removing needs the tool name typed and only applies to installed tools', function () {
    $bin = clusterToolsFakeCli();
    clusterToolsFakes();
    $fake = ChildProcess::fake();

    $this->delete(route('servers.tools.destroy', ['server' => 'workshop-demo', 'tool' => 'sso']), ['confirm' => 'ss'])->assertSessionHasErrors('confirm');
    $this->delete(route('servers.tools.destroy', ['server' => 'workshop-demo', 'tool' => 'crm']), ['confirm' => 'crm'])->assertNotFound();
    expect(Run::count())->toBe(0);

    $this->delete(route('servers.tools.destroy', ['server' => 'workshop-demo', 'tool' => 'sso']), ['confirm' => 'sso'])
        ->assertRedirect(route('runs.show', Run::sole()));

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === ["{$bin}/larakube", 'zitadel:remove', 'production', '--context=larakube-203.0.113.21', '--domain=sso.example.com', '--force', '--no-interaction']);
    expect(Run::sole()->label)->toBe('Remove SSO from workshop-demo');

    File::deleteDirectory($bin);
});

test('removing with purge checked passes --purge through to the CLI', function () {
    $bin = clusterToolsFakeCli();
    clusterToolsFakes();
    $fake = ChildProcess::fake();

    $this->delete(route('servers.tools.destroy', ['server' => 'workshop-demo', 'tool' => 'sso']), ['confirm' => 'sso', 'purge' => '1'])
        ->assertRedirect(route('runs.show', Run::sole()));

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === ["{$bin}/larakube", 'zitadel:remove', 'production', '--context=larakube-203.0.113.21', '--domain=sso.example.com', '--purge', '--force', '--no-interaction']);

    File::deleteDirectory($bin);
});

test('removing without purge never sends --purge', function () {
    $bin = clusterToolsFakeCli();
    clusterToolsFakes();
    $fake = ChildProcess::fake();

    $this->delete(route('servers.tools.destroy', ['server' => 'workshop-demo', 'tool' => 'sso']), ['confirm' => 'sso'])
        ->assertRedirect(route('runs.show', Run::sole()));

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => ! in_array('--purge', (array) $cmd, true));

    File::deleteDirectory($bin);
});

test('a finished install dispatches a re-sync of that server\'s tool list', function () {
    Queue::fake();
    $server = clusterToolsSeed('larakube-203.0.113.21', clusterToolsRows(), now()->getTimestamp());
    $run = Run::create(['label' => 'Install CRM', 'kind' => RunKind::InstallClusterTool, 'subject' => 'crm', 'meta' => ['server' => 'workshop-demo', 'context' => 'larakube-203.0.113.21', 'tool' => 'crm'], 'command' => ['larakube']]);

    event(new ProcessExited($run->alias(), 0));

    Queue::assertPushed(SyncClusterToolsJob::class, fn ($job): bool => $job->serverId === $server->id);
});

test('open hands https and editor addresses to the default browser and rejects anything else', function () {
    $shell = Shell::fake();

    $this->post(route('open'), ['url' => 'javascript:alert(1)'])->assertSessionHasErrors('url');
    $this->post(route('open'), ['url' => 'https://sso.example.com'])->assertRedirect();
    $this->post(route('open'), ['url' => 'vscode://vscode-remote/ssh-remote+larakube@1.2.3.4/home/larakube/projects/app'])->assertRedirect();
    $this->post(route('open'), ['url' => 'jetbrains-gateway://connect?type=ssh&host=1.2.3.4&user=larakube'])->assertRedirect();
    $this->post(route('open'), ['url' => 'mailto:help@larakube.app'])->assertRedirect();

    $shell->assertOpenedExternal('https://sso.example.com');
    $shell->assertOpenedExternal('vscode://vscode-remote/ssh-remote+larakube@1.2.3.4/home/larakube/projects/app');
    $shell->assertOpenedExternal('jetbrains-gateway://connect?type=ssh&host=1.2.3.4&user=larakube');
    $shell->assertOpenedExternal('mailto:help@larakube.app');
});

test('Tools in the sidebar returns to the server last browsed', function () {
    $bin = clusterToolsFakeCli();
    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'production', 'provider' => 'do', 'kind' => 'vps', 'region' => 'sgp1', 'ip' => '203.0.113.9', 'context' => 'larakube-203.0.113.9', 'account' => null, 'projectId' => null, 'status' => 'ready'],
            ['name' => 'workshop-demo', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'asia-east1', 'ip' => '203.0.113.21', 'context' => 'larakube-203.0.113.21', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ]])),
        '*tool:list*' => Process::result(output: json_encode(clusterToolsRows())),
    ]);

    $this->get(route('tools'))->assertRedirect(route('servers.tools.index', 'production'));
    $this->get(route('servers.tools.index', 'workshop-demo'))->assertOk();
    $this->get(route('tools'))->assertRedirect(route('servers.tools.index', 'workshop-demo'));

    File::deleteDirectory($bin);
});

test('each instance of a tool has its own detail page, and removal targets that instance\'s host', function () {
    $bin = clusterToolsFakeCli();
    $rows = clusterToolsRows();
    $rows[] = array_merge($rows[0], ['instance' => 'sso-team-example-com', 'brand' => 'SSO [sso-team-example-com]', 'host' => 'sso.team.example.com', 'url' => 'https://sso.team.example.com']);
    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'workshop-demo', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'asia-east1', 'ip' => '203.0.113.21', 'context' => 'larakube-203.0.113.21', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ]])),
        '*tool:list*' => Process::result(output: json_encode($rows)),
    ]);
    $fake = ChildProcess::fake();

    $this->get(route('servers.tools.show', ['server' => 'workshop-demo', 'tool' => 'sso', 'domain' => 'sso.team.example.com']))
        ->assertInertia(fn (AssertableInertia $page) => $page->where('tool.host', 'sso.team.example.com'));

    $this->delete(route('servers.tools.destroy', ['server' => 'workshop-demo', 'tool' => 'sso']), ['confirm' => 'sso', 'domain' => 'sso.team.example.com'])
        ->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => in_array('--domain=sso.team.example.com', $cmd, true));
    expect(Run::sole()->label)->toBe('Remove SSO from workshop-demo');

    File::deleteDirectory($bin);
});

test('check-dns endpoint returns resolution status for a domain', function () {
    $bin = clusterToolsFakeCli();
    clusterToolsFakes();

    $this->getJson(route('servers.tools.check-dns', ['server' => 'workshop-demo', 'domain' => 'example.com']))
        ->assertOk()
        ->assertJsonStructure(['matches', 'serverIp', 'isWildcard']);

    File::deleteDirectory($bin);
});

test('credentials endpoint fetches bootstrap credentials live via tool:show --json', function () {
    $bin = clusterToolsFakeCli();
    clusterToolsFakes();

    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'workshop-demo', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'asia-east1', 'ip' => '203.0.113.21', 'context' => 'larakube-203.0.113.21', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ]])),
        '*tool:show*' => Process::result(output: json_encode([
            'tool' => 'pocketbase', 'instance' => '', 'environment' => 'local', 'installed' => true,
            'namespace' => 'larakube-shared', 'host' => 'data.example.com', 'url' => 'https://data.example.com',
            'wirings' => [], 'components' => [],
            'credentials' => ['admin_email' => 'admin@example.com', 'admin_password' => 's3cret'],
        ])),
    ]);

    $this->getJson(route('servers.tools.credentials', ['server' => 'workshop-demo', 'tool' => 'pocketbase', 'domain' => 'data.example.com']))
        ->assertOk()
        ->assertJson(['credentials' => [
            'tool' => 'pocketbase', 'instance' => '', 'environment' => 'local', 'installed' => true,
            'namespace' => 'larakube-shared', 'host' => 'data.example.com', 'url' => 'https://data.example.com',
            'wirings' => [], 'components' => [],
            'credentials' => ['admin_email' => 'admin@example.com', 'admin_password' => 's3cret'],
        ]]);

    File::deleteDirectory($bin);
});

test('credentials endpoint reports null when the CLI call fails', function () {
    $bin = clusterToolsFakeCli();

    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'workshop-demo', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'asia-east1', 'ip' => '203.0.113.21', 'context' => 'larakube-203.0.113.21', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ]])),
        '*tool:show*' => Process::result(output: 'not json', exitCode: 1),
    ]);

    $this->getJson(route('servers.tools.credentials', ['server' => 'workshop-demo', 'tool' => 'pocketbase', 'domain' => 'data.example.com']))
        ->assertOk()
        ->assertJson(['credentials' => null]);

    File::deleteDirectory($bin);
});

test('domains endpoint returns list of cluster domains and externaldns status', function () {
    $bin = clusterToolsFakeCli();
    clusterToolsFakes();

    $this->getJson(route('servers.domains', ['server' => 'workshop-demo']))
        ->assertOk()
        ->assertJsonStructure(['domains', 'activeCommonsServices']);

    File::deleteDirectory($bin);
});

test('a fresh domains list renders at once, with no live DNS/TLS/ingress check', function () {
    $bin = clusterToolsFakeCli();
    clusterToolsFakes();

    $server = Server::updateOrCreate(['name' => 'workshop-demo'], [
        'provider' => 'gcp', 'kind' => 'vps', 'context' => 'larakube-203.0.113.21', 'status' => 'ready',
        'domains_sync_status' => 'fresh', 'domains_last_synced_at' => now()->subMinutes(5),
    ]);
    $server->domains()->create(['domain' => 'example.com', 'external_dns' => true]);

    $this->getJson(route('servers.domains', ['server' => 'workshop-demo']))
        ->assertOk()
        ->assertJson(['domains' => [
            ['domain' => 'example.com', 'externalDns' => true, 'tls' => false, 'inUse' => false],
        ]]);

    Process::assertNotRan(fn ($process): bool => str_contains(implode(' ', (array) $process->command), 'external-dns:list'));
    Process::assertNotRan(fn ($process): bool => str_contains(implode(' ', (array) $process->command), 'tls:show'));

    File::deleteDirectory($bin);
});

test('a stale domains list still renders instantly while the background re-sync catches up', function () {
    $bin = clusterToolsFakeCli();
    clusterToolsFakes();

    $server = Server::updateOrCreate(['name' => 'workshop-demo'], [
        'provider' => 'gcp', 'kind' => 'vps', 'context' => 'larakube-203.0.113.21', 'status' => 'ready',
        'domains_sync_status' => 'fresh', 'domains_last_synced_at' => now()->subSeconds(SyncServerDomainsJob::FRESH_SECONDS + 60),
    ]);
    $server->domains()->create(['domain' => 'stale.example.com', 'external_dns' => true]);

    // The sync queue dispatches inline in tests, so the stale row is replaced
    // by whatever the (faked, empty) live check reports — proving the
    // request never blocked waiting for it.
    $this->getJson(route('servers.domains', ['server' => 'workshop-demo']))
        ->assertOk()
        ->assertJson(['domains' => []]);

    expect($server->fresh()->domains_sync_status)->toBe('fresh');

    File::deleteDirectory($bin);
});

test('a finished install re-syncs via the full tool:list check, merging in what changed', function () {
    $bin = clusterToolsFakeCli();
    $before = clusterToolsRows();
    clusterToolsSeed('ctx', $before, now()->subMinutes(5)->getTimestamp(), 'demo');

    $after = $before;
    $after[1] = [...$before[1], 'installed' => true, 'host' => 'crm.example.com', 'url' => 'https://crm.example.com'];
    Process::fake(['*tool:list*' => Process::result(output: json_encode($after))]);

    $run = Run::create([
        'label' => 'Install CRM on demo', 'command' => ['larakube', 'tool:add'], 'kind' => RunKind::InstallClusterTool,
        'meta' => ['server' => 'demo', 'context' => 'ctx', 'tool' => 'crm', 'host' => 'crm.example.com'],
    ]);
    event(new ProcessExited($run->alias(), 0));

    $last = app(ToolCatalog::class)->lastVerified('ctx');

    expect(array_column($last['tools'], 'tool'))->toBe(['sso', 'crm'])
        ->and($last['tools'][1])->toMatchArray(['installed' => true, 'host' => 'crm.example.com'])
        ->and($last['tools'][0]['host'])->toBe('sso.example.com')
        ->and(Activity::where('type', ActivityType::ToolInstalled)->exists())->toBeTrue();

    File::deleteDirectory($bin);
});

test('a failed install still re-verifies the tool list, but records no install activity', function () {
    $bin = clusterToolsFakeCli();
    clusterToolsSeed('ctx', clusterToolsRows(), now()->getTimestamp(), 'demo');
    Process::fake(['*tool:list*' => Process::result(output: json_encode(clusterToolsRows()))]);

    $run = Run::create([
        'label' => 'Install CRM on demo', 'command' => ['larakube', 'tool:add'], 'kind' => RunKind::InstallClusterTool,
        'meta' => ['server' => 'demo', 'context' => 'ctx', 'tool' => 'crm', 'host' => 'crm.example.com'],
    ]);
    event(new ProcessExited($run->alias(), 1));

    expect(app(ToolCatalog::class)->lastVerified('ctx')['tools'][1]['installed'])->toBeFalse()
        ->and(Activity::where('type', ActivityType::ToolInstalled)->exists())->toBeFalse();

    File::deleteDirectory($bin);
});

test('whether a tool gets an admin email comes from the fields the CLI sends for it', function (array $initFields, ?string $expected) {
    $bin = clusterToolsFakeCli();
    $row = [
        'tool' => 'crm', 'instance' => '', 'icon' => '*', 'brand' => 'CRM', 'label' => 'CRM', 'installed' => false, 'initFields' => $initFields,
        'namespace' => 'larakube-shared', 'host' => null, 'aliases' => [], 'url' => null,
        'installedAt' => null, 'mail' => 'N/A', 'sso' => '—', 'sync' => 'N/A', 'rotation' => 'N/A', 'vpn' => 'N/A', 'db_role' => null,
    ];
    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'workshop-demo', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'asia-east1', 'ip' => '203.0.113.21', 'context' => 'larakube-203.0.113.21', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ]])),
        '*tool:list*' => Process::result(output: json_encode([$row])),
    ]);
    $fake = ChildProcess::fake();

    $this->post(route('servers.tools.store', ['server' => 'workshop-demo', 'tool' => 'crm']), ['domain' => 'crm.example.com'])->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => in_array("--admin-email={$expected}", $cmd, true) === ($expected !== null));

    File::deleteDirectory($bin);
})->with([
    'it asks for one' => [[['key' => 'domain', 'type' => 'text', 'label' => 'Domain', 'flag' => '--domain='], ['key' => 'adminEmail', 'type' => 'text', 'label' => 'Admin email', 'flag' => '--admin-email=']], 'admin@crm.example.com'],
    'it does not' => [[['key' => 'domain', 'type' => 'text', 'label' => 'Domain', 'flag' => '--domain=']], null],
]);

test('a tool\'s own options reach the install as flags, the way the CLI described them', function () {
    $bin = clusterToolsFakeCli();
    $field = fn (string $key, string $flag, string $type, string $role = 'option'): array => ['key' => $key, 'type' => $type, 'role' => $role, 'label' => $key, 'flag' => $flag, 'required' => false];
    $row = [
        'tool' => 'grafana', 'instance' => '', 'icon' => '*', 'brand' => 'Grafana', 'label' => 'Grafana', 'installed' => false,
        'initFields' => [$field('domain', '--domain=', 'text', 'host'), $field('appName', '--app-name=', 'text'), $field('noLogs', '--no-logs', 'confirm'), $field('withTraces', '--with-traces', 'confirm'), $field('vpnOnly', '--vpn-only', 'confirm', 'access')],
        'namespace' => 'larakube-shared', 'host' => null, 'aliases' => [], 'url' => null,
        'installedAt' => null, 'mail' => 'N/A', 'sso' => '—', 'sync' => 'N/A', 'rotation' => 'N/A', 'vpn' => 'N/A', 'db_role' => null,
    ];
    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'workshop-demo', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'asia-east1', 'ip' => '203.0.113.21', 'context' => 'larakube-203.0.113.21', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ]])),
        '*tool:list*' => Process::result(output: json_encode([$row])),
    ]);
    $fake = ChildProcess::fake();

    // vpnOnly is an access setting, not a plain option: it is never passed from this form.
    $this->post(route('servers.tools.store', ['server' => 'workshop-demo', 'tool' => 'grafana']), [
        'domain' => 'grafana.example.com',
        'options' => ['appName' => 'Metrics', 'noLogs' => '1', 'vpnOnly' => '1'],
    ])->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        "{$bin}/larakube", 'tool:add', '--tool=grafana', '--context=larakube-203.0.113.21', '--domain=grafana.example.com', '--no-wire-sso', '--no-wire-mail', '--app-name=Metrics', '--no-logs', '--force', '--no-interaction',
    ]);

    File::deleteDirectory($bin);
});

test('removing a tool passes --domain only when the CLI says the tool can run more than once', function (bool $multi, bool $expectsDomain) {
    $bin = clusterToolsFakeCli();
    $row = [
        'tool' => 'stalwart', 'instance' => '', 'icon' => '*', 'brand' => 'Stalwart', 'label' => 'Mail', 'installed' => true, 'multiInstance' => $multi,
        'removeCommand' => 'stalwart:remove', 'namespace' => 'larakube-shared', 'host' => 'send.test', 'aliases' => [], 'url' => 'https://send.test',
        'installedAt' => null, 'mail' => 'N/A', 'sso' => '—', 'sync' => 'N/A', 'rotation' => 'N/A', 'vpn' => 'N/A', 'db_role' => null,
    ];
    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'workshop-demo', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'asia-east1', 'ip' => '203.0.113.21', 'context' => 'larakube-203.0.113.21', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ]])),
        '*tool:list*' => Process::result(output: json_encode([$row])),
    ]);
    $fake = ChildProcess::fake();

    $this->delete(route('servers.tools.destroy', ['server' => 'workshop-demo', 'tool' => 'stalwart']), ['confirm' => 'stalwart', 'domain' => 'send.test'])->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => in_array('--domain=send.test', $cmd, true) === $expectsDomain && in_array('stalwart:remove', $cmd, true));

    File::deleteDirectory($bin);
})->with([
    'a single-instance tool' => [false, false],
    'a multi-instance tool' => [true, true],
]);

test('a tool\'s page carries what it holds on the Commons, for the shared backing services card', function () {
    $bin = clusterToolsFakeCli();
    File::put("{$bin}/kubectl", "#!/bin/sh\n");
    chmod("{$bin}/kubectl", 0755);
    $row = [
        'tool' => 'outline', 'instance' => 'wiki', 'icon' => '*', 'brand' => 'Outline', 'label' => 'Wiki', 'installed' => true,
        'commons' => ['databases' => ['outline_wiki'], 'redis' => [], 'buckets' => []],
        'namespace' => 'larakube-shared', 'host' => 'wiki.example.com', 'aliases' => [], 'url' => 'https://wiki.example.com',
        'installedAt' => null, 'mail' => 'N/A', 'sso' => '—', 'sync' => 'N/A', 'rotation' => 'N/A', 'vpn' => 'N/A', 'db_role' => null,
    ];
    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'workshop-demo', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'asia-east1', 'ip' => '203.0.113.21', 'context' => 'larakube-203.0.113.21', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ]])),
        '*tool:list*' => Process::result(output: json_encode([$row])),
        '*plex-commons*' => Process::result(output: json_encode(['services' => ['postgres' => ['enabled' => true]]])),
        '*plex-registry*' => Process::result(output: json_encode(['tenants' => ['outline_wiki' => ['db' => 'outline_wiki', 'db_service' => 'postgres']]])),
    ]);

    $this->get(route('servers.tools.show', ['server' => 'workshop-demo', 'tool' => 'outline', 'domain' => 'wiki.example.com']))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('tools/show')
            ->loadDeferredProps(fn (AssertableInertia $page) => $page
                ->where('backing.commons', true)
                ->where('backing.services.0.name', 'Postgres')
                ->where('backing.services.0.details.0.value', 'outline_wiki')));

    File::deleteDirectory($bin);
});
