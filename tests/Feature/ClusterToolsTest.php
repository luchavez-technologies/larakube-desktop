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
    Cache::forever('cluster-tools:ctx', ['tools' => [['tool' => 'sso']], 'checkedAt' => now()->getTimestamp()]);
    Cache::put('cluster-tools:ctx:registered', [['tool' => 'sso']]);

    app(ToolCatalog::class)->forget('ctx');

    expect(app(ToolCatalog::class)->lastVerified('ctx'))->toBe(['tools' => [['tool' => 'sso']], 'checkedAt' => null])
        ->and(Cache::has('cluster-tools:ctx:registered'))->toBeFalse();
});

test('a fresh verified list renders at once, with no live check', function () {
    $bin = clusterToolsFakeCli();
    clusterToolsFakes();
    Cache::forever('cluster-tools:larakube-203.0.113.21', ['tools' => clusterToolsRows(), 'checkedAt' => now()->subMinutes(5)->getTimestamp()]);

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
    Cache::forever('cluster-tools:larakube-203.0.113.21', ['tools' => [clusterToolsRows()[0]], 'checkedAt' => now()->subSeconds(ToolCatalog::FRESH_SECONDS + 60)->getTimestamp()]);

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
    Cache::forever('cluster-tools:larakube-203.0.113.21', ['tools' => clusterToolsRows(), 'checkedAt' => now()->getTimestamp()]);

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
        ->and($run->meta)->toBe(['server' => 'workshop-demo', 'context' => 'larakube-203.0.113.21', 'tool' => 'crm']);

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        "{$bin}/larakube", 'tool:add', '--tool=crm', '--context=larakube-203.0.113.21', '--domain=example.com', '--wire-sso', '--no-wire-mail', '--force', '--no-interaction',
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

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === ["{$bin}/larakube", 'sso:remove', 'production', '--context=larakube-203.0.113.21', '--domain=sso.example.com', '--force', '--no-interaction']);
    expect(Run::sole()->label)->toBe('Remove SSO from workshop-demo');

    File::deleteDirectory($bin);
});

test('a finished install marks that server\'s tool list stale', function () {
    Cache::forever('cluster-tools:larakube-203.0.113.21', ['tools' => clusterToolsRows(), 'checkedAt' => now()->getTimestamp()]);
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

    $this->get(route('servers.tools.show', ['server' => 'workshop-demo', 'tool' => 'sso', 'instance' => 'sso-team-example-com']))
        ->assertInertia(fn (AssertableInertia $page) => $page->where('tool.host', 'sso.team.example.com'));

    $this->delete(route('servers.tools.destroy', ['server' => 'workshop-demo', 'tool' => 'sso']), ['confirm' => 'sso', 'instance' => 'sso-team-example-com'])
        ->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => in_array('--domain=sso.team.example.com', $cmd, true));
    expect(Run::sole()->label)->toBe('Remove SSO from workshop-demo');

    File::deleteDirectory($bin);
});
