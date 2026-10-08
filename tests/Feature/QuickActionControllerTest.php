<?php

use App\Enums\RunKind;
use App\Models\Run;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Inertia\Testing\AssertableInertia;
use Native\Desktop\Facades\ChildProcess;

function quickActionFakeCli(): string
{
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);
    File::put("{$directory}/larakube", "#!/bin/sh\n");
    File::put("{$directory}/kubectl", "#!/bin/sh\n");
    chmod("{$directory}/larakube", 0755);
    chmod("{$directory}/kubectl", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$directory]));

    return $directory;
}

beforeEach(function () {
    $this->bin = quickActionFakeCli();
    ChildProcess::fake();

    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'prod-server', 'provider' => 'hetzner', 'kind' => 'vps', 'region' => 'nbg1', 'ip' => '198.51.100.10', 'context' => 'larakube-198.51.100.10', 'account' => 'test@example.com', 'projectId' => null, 'status' => 'ready'],
        ]])),
        '*tool:list*' => Process::result(output: json_encode([
            [
                'tool' => 'wordpress', 'instance' => '', 'icon' => '*', 'brand' => 'WordPress', 'label' => 'CMS (WordPress)', 'installed' => false,
                'removeCommand' => 'wordpress:remove', 'namespace' => 'larakube-shared', 'host' => null, 'aliases' => [], 'url' => null,
                'installedAt' => null, 'mail' => 'N/A', 'sso' => '—', 'sync' => 'N/A', 'rotation' => 'N/A', 'vpn' => 'N/A', 'db_role' => null,
                'commonsCapabilities' => ['databases' => ['sqlite', 'mysql', 'mariadb'], 'cache' => [], 'storage' => ['s3'], 'auth' => [], 'mail' => []],
                'initFields' => [
                    ['key' => 'adminEmail', 'label' => 'Admin Email', 'type' => 'text'],
                    ['key' => 'db', 'label' => 'Database', 'type' => 'text'],
                ],
            ],
            [
                'tool' => 'pocketbase', 'instance' => '', 'icon' => '*', 'brand' => 'PocketBase', 'label' => 'Data / Backend (PocketBase)', 'installed' => false,
                'removeCommand' => 'pocketbase:remove', 'namespace' => 'larakube-shared', 'host' => null, 'aliases' => [], 'url' => null,
                'installedAt' => null, 'mail' => 'N/A', 'sso' => '—', 'sync' => 'N/A', 'rotation' => 'N/A', 'vpn' => 'N/A', 'db_role' => null,
                'commonsCapabilities' => ['databases' => ['sqlite'], 'cache' => [], 'storage' => ['s3'], 'auth' => [], 'mail' => []],
                'initFields' => [
                    ['key' => 'adminEmail', 'label' => 'Admin Email', 'type' => 'text'],
                ],
            ],
            [
                'tool' => 'n8n', 'instance' => '', 'icon' => '*', 'brand' => 'n8n', 'label' => 'Workflow Automation (n8n)', 'installed' => false,
                'removeCommand' => 'n8n:remove', 'namespace' => 'larakube-shared', 'host' => null, 'aliases' => [], 'url' => null,
                'installedAt' => null, 'mail' => 'N/A', 'sso' => '—', 'sync' => 'N/A', 'rotation' => 'N/A', 'vpn' => 'N/A', 'db_role' => null,
                'commonsCapabilities' => ['databases' => ['sqlite'], 'cache' => ['redis'], 'storage' => ['s3'], 'auth' => [], 'mail' => []],
                'initFields' => [],
            ],
        ], JSON_PRETTY_PRINT)),
    ]);
});

afterEach(function () {
    if (isset($this->bin) && File::isDirectory($this->bin)) {
        File::deleteDirectory($this->bin);
    }
});

test('quick launch validation requires tool, server, and valid domain', function () {
    $response = $this->post(route('quick-actions.launch'), []);
    $response->assertSessionHasErrors(['tool', 'server', 'domain']);
});

test('quick launch launches wordpress with commons mysql', function () {
    $fake = ChildProcess::fake();

    $response = $this->post(route('quick-actions.launch'), [
        'tool' => 'wordpress',
        'server' => 'prod-server',
        'domain' => 'blog.example.com',
        'admin_email' => 'admin@example.com',
        'database' => 'mysql',
    ]);

    $response->assertOk();
    $run = Run::sole();
    $response->assertJsonPath('run.id', $run->id);

    expect($run->kind)->toBe(RunKind::QuickLaunchApp)
        ->and($run->tool)->toBe('wordpress')
        ->and($run->server_name)->toBe('prod-server')
        ->and($run->meta['database'])->toBe('mysql')
        ->and($run->meta['host'])->toBe('blog.example.com');

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) {
        $bin = $this->bin;

        return array_slice($cmd, 4) === [
            "{$bin}/larakube",
            'tool:add',
            '--tool=wordpress',
            '--context=larakube-198.51.100.10',
            '--domain=blog.example.com',
            '--admin-email=admin@example.com',
            '--no-wire-sso',
            '--no-wire-mail',
            '--db=mysql',
            '--force',
            '--no-interaction',
        ];
    });
});

test('quick launch launches n8n without db flag even when database is specified', function () {
    $fake = ChildProcess::fake();

    $response = $this->post(route('quick-actions.launch'), [
        'tool' => 'n8n',
        'server' => 'prod-server',
        'domain' => 'flow.example.com',
        'admin_email' => 'admin@example.com',
        'database' => 'sqlite',
    ]);

    $response->assertOk();
    $run = Run::sole();
    $response->assertJsonPath('run.id', $run->id);

    expect($run->kind)->toBe(RunKind::QuickLaunchApp)
        ->and($run->tool)->toBe('n8n')
        ->and($run->server_name)->toBe('prod-server')
        ->and($run->meta['host'])->toBe('flow.example.com');

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) {
        $bin = $this->bin;

        return array_slice($cmd, 4) === [
            "{$bin}/larakube",
            'tool:add',
            '--tool=n8n',
            '--context=larakube-198.51.100.10',
            '--domain=flow.example.com',
            '--no-wire-sso',
            '--no-wire-mail',
            '--force',
            '--no-interaction',
        ];
    });
});

test('quick launch forwards --confirm-commons-restart when confirmed', function () {
    $fake = ChildProcess::fake();

    $response = $this->post(route('quick-actions.launch'), [
        'tool' => 'n8n',
        'server' => 'prod-server',
        'domain' => 'flow.example.com',
        'confirm_commons_restart' => '1',
    ]);

    $response->assertOk();

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) {
        $bin = $this->bin;

        return array_slice($cmd, 4) === [
            "{$bin}/larakube",
            'tool:add',
            '--tool=n8n',
            '--context=larakube-198.51.100.10',
            '--domain=flow.example.com',
            '--no-wire-sso',
            '--no-wire-mail',
            '--confirm-commons-restart',
            '--force',
            '--no-interaction',
        ];
    });
});

test('cluster tool index provides activeCommonsServices prop', function () {
    $response = $this->get(route('servers.tools.index', 'prod-server'));
    $response->assertOk();

    $response->assertInertia(fn (AssertableInertia $page) => $page
        ->component('tools/index')
        ->where('server.name', 'prod-server')
        ->loadDeferredProps(fn (AssertableInertia $reload) => $reload
            ->has('activeCommonsServices')
        )
    );
});
