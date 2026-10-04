<?php

use App\Enums\RunKind;
use App\Models\Run;
use App\Services\LaraKube\ToolCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Inertia\Testing\AssertableInertia;
use Native\Desktop\Events\ChildProcess\ProcessExited;
use Native\Desktop\Facades\ChildProcess;
use Native\Desktop\Facades\Shell;

/** Keeps a tool list the way the app does, tagged with the installed CLI build. */
function clusterToolsSeed(string $key, array $tools, ?int $checkedAt): void
{
    $cli = app(ToolLocator::class)->find('larakube');

    Cache::forever($key, ['tools' => $tools, 'checkedAt' => $checkedAt, 'build' => $cli !== null ? (string) @filemtime($cli) : '']);
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
    clusterToolsSeed('cluster-tools:ctx', [['tool' => 'sso']], now()->getTimestamp());
    Cache::put('cluster-tools:ctx:registered', [['tool' => 'sso']]);

    app(ToolCatalog::class)->forget('ctx');

    expect(app(ToolCatalog::class)->lastVerified('ctx'))->toBe(['tools' => [['tool' => 'sso']], 'checkedAt' => null])
        ->and(Cache::has('cluster-tools:ctx:registered'))->toBeFalse();
});

test('a fresh verified list renders at once, with no live check', function () {
    $bin = clusterToolsFakeCli();
    clusterToolsFakes();
    clusterToolsSeed('cluster-tools:larakube-203.0.113.21', clusterToolsRows(), now()->subMinutes(5)->getTimestamp());

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
    clusterToolsSeed('cluster-tools:larakube-203.0.113.21', [clusterToolsRows()[0]], now()->subSeconds(ToolCatalog::FRESH_SECONDS + 60)->getTimestamp());

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
    clusterToolsSeed('cluster-tools:larakube-203.0.113.21', clusterToolsRows(), now()->getTimestamp());

    $this->post(route('servers.tools.refresh', 'workshop-demo'))->assertRedirect(route('servers.tools.index', 'workshop-demo'));

    $this->get(route('servers.tools.index', 'workshop-demo'))
        ->assertInertia(fn (AssertableInertia $page) => $page->has('lastVerified', 2)->missing('tools'));

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

test('a finished install marks that server\'s tool list stale', function () {
    clusterToolsSeed('cluster-tools:larakube-203.0.113.21', clusterToolsRows(), now()->getTimestamp());
    $run = Run::create(['label' => 'Install CRM', 'kind' => RunKind::InstallClusterTool, 'subject' => 'crm', 'meta' => ['server' => 'workshop-demo', 'context' => 'larakube-203.0.113.21', 'tool' => 'crm'], 'command' => ['larakube']]);

    event(new ProcessExited($run->alias(), 0));

    expect(app(ToolCatalog::class)->lastVerified('larakube-203.0.113.21')['checkedAt'])->toBeNull();
});

test('open hands https addresses to the default browser and rejects anything else', function () {
    $shell = Shell::fake();

    $this->post(route('open'), ['url' => 'javascript:alert(1)'])->assertSessionHasErrors('url');
    $this->post(route('open'), ['url' => 'https://sso.example.com'])->assertRedirect();

    $shell->assertOpenedExternal('https://sso.example.com');
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

test('a tool that was just installed shows at once, without waiting for the live check', function () {
    $bin = clusterToolsFakeCli();
    Cache::flush();
    $before = clusterToolsRows();
    clusterToolsSeed('cluster-tools:ctx', $before, now()->subMinutes(5)->getTimestamp());

    // The registry already knows the new CRM instance.
    $registry = $before;
    $registry[1] = [...$before[1], 'installed' => true, 'host' => 'crm.example.com', 'url' => 'https://crm.example.com'];
    Process::fake(['*tool:list*--registry-only*' => Process::result(output: json_encode($registry))]);

    $run = Run::create([
        'label' => 'Install CRM on demo', 'command' => ['larakube', 'tool:add'], 'kind' => RunKind::InstallClusterTool,
        'meta' => ['server' => 'demo', 'context' => 'ctx', 'tool' => 'crm', 'host' => 'crm.example.com'],
    ]);
    event(new ProcessExited($run->alias(), 0));

    $last = app(ToolCatalog::class)->lastVerified('ctx');

    expect($last['checkedAt'])->toBeNull()
        ->and(array_column($last['tools'], 'tool'))->toBe(['sso', 'crm'])
        ->and($last['tools'][1])->toMatchArray(['installed' => true, 'host' => 'crm.example.com'])
        ->and($last['tools'][0]['host'])->toBe('sso.example.com');

    File::deleteDirectory($bin);
});

test('a failed install leaves the list as it was', function () {
    $bin = clusterToolsFakeCli();
    Cache::flush();
    clusterToolsSeed('cluster-tools:ctx', clusterToolsRows(), now()->getTimestamp());
    Process::fake();

    $run = Run::create([
        'label' => 'Install CRM on demo', 'command' => ['larakube', 'tool:add'], 'kind' => RunKind::InstallClusterTool,
        'meta' => ['server' => 'demo', 'context' => 'ctx', 'tool' => 'crm', 'host' => 'crm.example.com'],
    ]);
    event(new ProcessExited($run->alias(), 1));

    Process::assertNotRan(fn ($process) => in_array('--registry-only', (array) $process->command, true));
    expect(app(ToolCatalog::class)->lastVerified('ctx')['tools'][1]['installed'])->toBeFalse();

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

test('a tool list kept from an older CLI build is not used once the CLI is replaced', function () {
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);
    File::put("{$directory}/larakube", "#!/bin/sh\n");
    chmod("{$directory}/larakube", 0755);
    touch("{$directory}/larakube", 1_700_000_000);
    app()->instance(ToolLocator::class, new ToolLocator([$directory]));

    Cache::forever('cluster-tools:ctx', ['tools' => [['tool' => 'twenty']], 'checkedAt' => now()->getTimestamp(), 'build' => (string) filemtime("{$directory}/larakube")]);

    expect(app(ToolCatalog::class)->cached('ctx'))->toHaveCount(1);

    touch("{$directory}/larakube", 1_800_000_000);
    clearstatcache();

    expect(app(ToolCatalog::class)->cached('ctx'))->toBeNull();

    File::deleteDirectory($directory);
});
