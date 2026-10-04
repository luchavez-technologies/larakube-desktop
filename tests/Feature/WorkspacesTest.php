<?php

use App\Enums\RunKind;
use App\Models\Run;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Inertia\Testing\AssertableInertia;
use Native\Desktop\Facades\ChildProcess;

function workspacesCli(): string
{
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);
    File::put("{$directory}/larakube", "#!/bin/sh\n");
    chmod("{$directory}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$directory]));

    return $directory;
}

function workspacesExperimental(bool $on): void
{
    $settings = mock(GlobalSettings::class);
    $settings->shouldReceive('hideProjects')->andReturnFalse();
    $settings->shouldReceive('experimental')->andReturn($on);
    app()->instance(GlobalSettings::class, $settings);
}

function workspacesFakeCli(): void
{
    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'dev-box', 'provider' => 'do', 'kind' => 'vps', 'region' => 'sgp1', 'ip' => '203.0.113.9', 'context' => 'larakube-203.0.113.9', 'bindings' => ['shop/production'], 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ]])),
        '*workspace:options*' => Process::result(output: json_encode(['success' => true, 'sizes' => [['value' => 'standard', 'label' => 'Standard', 'memory' => '4Gi', 'cpu' => '2', 'storage' => '20Gi']], 'runtimes' => [['value' => 'php', 'label' => 'PHP', 'versions' => ['8.4', '8.3'], 'defaultVersion' => '8.4']], 'frameworks' => [['value' => 'laravel', 'label' => 'Laravel', 'runtime' => 'php', 'available' => true, 'devCommand' => 'composer run dev', 'devPorts' => [['name' => 'App', 'port' => 8000]]]], 'defaultSize' => 'standard', 'defaultFramework' => 'laravel', 'defaultBranch' => 'main'])),
        '*workspace:list*' => Process::result(output: json_encode(['success' => true, 'workspaces' => [['name' => 'api', 'namespace' => 'ws-api', 'repo' => 'https://github.com/acme/app', 'branch' => 'main', 'size' => 'standard', 'framework' => 'laravel', 'runtime' => 'php', 'runtimeVersion' => '8.4', 'devCommand' => 'composer run dev', 'devPorts' => [['name' => 'App', 'port' => 8000]], 'status' => 'running', 'publicKey' => 'ssh-ed25519 AAAA']]])),
    ]);
}

test('workspaces stay hidden until experimental features are switched on', function () {
    workspacesExperimental(false);

    $this->get(route('workspaces.index'))->assertNotFound();
    $this->post(route('workspaces.store'), [])->assertNotFound();
});

test('with experimental on, the page offers the servers and loads sizes and workspaces from the CLI', function () {
    $bin = workspacesCli();
    workspacesExperimental(true);
    workspacesFakeCli();

    $this->get(route('workspaces.index'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('workspaces/index')
            ->where('server', 'dev-box')
            ->where('servers.0.name', 'dev-box')
            ->where('servers.0.bindings', ['shop/production'])
            ->loadDeferredProps(fn (AssertableInertia $page) => $page
                ->where('options.defaultSize', 'standard')
                ->where('workspaces.0.name', 'api')
            )
        );

    File::deleteDirectory($bin);
});

test('creating a workspace starts workspace:create on the chosen server', function () {
    $bin = workspacesCli();
    workspacesExperimental(true);
    workspacesFakeCli();
    $fake = ChildProcess::fake();

    $this->post(route('workspaces.store'), ['server' => 'dev-box', 'name' => 'api', 'repo' => 'https://github.com/acme/app', 'branch' => 'feature/x', 'size' => 'standard', 'framework' => 'django', 'runtimeVersion' => '3.13'])
        ->assertRedirect(route('runs.show', Run::sole()));

    expect(Run::sole()->kind)->toBe(RunKind::WorkspaceCreate);

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        "{$bin}/larakube", 'workspace:create', '--stack=dev-box', '--name=api', '--repo=https://github.com/acme/app', '--branch=feature/x', '--size=standard', '--framework=django', '--runtime-version=3.13', '--no-interaction',
    ]);

    File::deleteDirectory($bin);
});

test('a workspace cannot be made from a bad name or repository, or on an unknown server', function (array $data, bool $validation) {
    $bin = workspacesCli();
    workspacesExperimental(true);
    workspacesFakeCli();
    ChildProcess::fake();

    $response = $this->post(route('workspaces.store'), $data + ['server' => 'dev-box', 'name' => 'api', 'repo' => 'https://github.com/acme/app']);

    $validation ? $response->assertSessionHasErrors() : $response->assertNotFound();
    expect(Run::count())->toBe(0);

    File::deleteDirectory($bin);
})->with([
    'a name with capitals' => [['name' => 'Bad_Name'], true],
    'a repository that is a shell command' => [['repo' => 'https://x.com/a; rm -rf /'], true],
    'a server nobody made' => [['server' => 'nope'], false],
]);

test('suspend, resume and delete start the matching command for that workspace', function (string $route, string $command, RunKind $kind, array $extra) {
    $bin = workspacesCli();
    workspacesExperimental(true);
    workspacesFakeCli();
    $fake = ChildProcess::fake();

    $verb = $route === 'workspaces.destroy' ? 'delete' : 'post';
    $this->{$verb}(route($route, 'api'), ['server' => 'dev-box'])->assertRedirect(route('runs.show', Run::sole()));

    expect(Run::sole()->kind)->toBe($kind);
    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === ["{$bin}/larakube", $command, '--stack=dev-box', ...$extra, '--name=api', '--no-interaction']);

    File::deleteDirectory($bin);
})->with([
    'suspend' => ['workspaces.suspend', 'workspace:suspend', RunKind::WorkspaceSuspend, []],
    'resume' => ['workspaces.resume', 'workspace:resume', RunKind::WorkspaceResume, []],
    'delete' => ['workspaces.destroy', 'workspace:remove', RunKind::WorkspaceRemove, ['--force']],
]);

test('acting on a workspace needs the server to be named, not guessed', function () {
    $bin = workspacesCli();
    workspacesExperimental(true);
    workspacesFakeCli();
    ChildProcess::fake();

    $this->post(route('workspaces.suspend', 'api'))->assertNotFound();

    expect(Run::count())->toBe(0);

    File::deleteDirectory($bin);
});

test('connecting starts the tunnel on a chosen port and returns to the page with the editor address', function () {
    $bin = workspacesCli();
    workspacesExperimental(true);
    workspacesFakeCli();
    $fake = ChildProcess::fake();

    $response = $this->post(route('workspaces.open', 'api'), ['server' => 'dev-box']);
    $response->assertRedirect();

    parse_str((string) parse_url($response->headers->get('Location'), PHP_URL_QUERY), $query);

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => in_array('--app-port='.$query['apps'][8000].':8000', $cmd, true));

    expect($query['editor'])->toBe('api')->and((int) $query['port'])->toBeGreaterThan(1023)
        ->and((int) $query['apps'][8000])->toBeGreaterThan(1023);

    File::deleteDirectory($bin);
});

test('experimental can be saved and is shared with every page', function () {
    $this->post(route('settings.update'), ['experimental' => true])->assertRedirect();

    $this->get(route('settings.show'))->assertInertia(fn (AssertableInertia $page) => $page->where('experimental', true)->where('settings.experimental', true));

    $this->post(route('settings.update'), ['experimental' => false])->assertRedirect();
});
