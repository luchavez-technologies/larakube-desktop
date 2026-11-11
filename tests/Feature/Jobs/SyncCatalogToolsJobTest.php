<?php

use App\Jobs\Sync\SyncCatalogToolsJob;
use App\Jobs\Sync\SyncCliWithDesktopJob;
use App\Models\CatalogTool;
use App\Models\Server;
use App\Services\LaraKube\CliInstaller;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use App\Services\RunNotifier;
use App\Services\Wsl;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Queue;

function syncCatalogFakeCli(): string
{
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);
    File::put("{$directory}/larakube", "#!/bin/sh\n");
    chmod("{$directory}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$directory]));

    return $directory;
}

test('syncs multiple pages from paginated tool:catalog into catalog_tools table', function (): void {
    $bin = syncCatalogFakeCli();

    Process::fake(function ($process) {
        $command = implode(' ', $process->command);

        if (str_contains($command, '--page=1')) {
            return Process::result(output: json_encode([
                'data' => [
                    [
                        'tool' => 'n8n',
                        'brand' => 'n8n',
                        'label' => 'n8n Workflow Automation',
                        'categories' => ['Productivity', 'DevOps'],
                        'source' => 'official',
                        'supportsNoPlex' => true,
                        'commonsCapabilities' => [
                            'plexDatabases' => ['postgres'],
                            'supportsSqlite' => true,
                        ],
                    ],
                ],
                'meta' => [
                    'current_page' => 1,
                    'per_page' => 50,
                    'total' => 2,
                    'last_page' => 2,
                ],
            ]));
        }

        return Process::result(output: json_encode([
            'data' => [
                [
                    'tool' => 'community-plausible-alt',
                    'brand' => 'Community Analytics',
                    'label' => 'Community Analytics',
                    'categories' => ['Analytics'],
                    'source' => 'community',
                    'upvotesCount' => 42,
                    'commonsCapabilities' => [
                        'plexDatabases' => ['postgres'],
                        'supportsSqlite' => false,
                    ],
                ],
            ],
            'meta' => [
                'current_page' => 2,
                'per_page' => 50,
                'total' => 2,
                'last_page' => 2,
            ],
        ]));
    });

    SyncCatalogToolsJob::dispatchSync();

    expect(CatalogTool::count())->toBe(2)
        ->and(CatalogTool::firstWhere('slug', 'n8n')?->supports_no_plex)->toBeTrue()
        ->and(CatalogTool::firstWhere('slug', 'community-plausible-alt')?->source)->toBe('community')
        ->and(CatalogTool::firstWhere('slug', 'community-plausible-alt')?->upvotes_count)->toBe(42);

    File::deleteDirectory($bin);
});

test('falls back cleanly to tool:list --registry-only --json on older CLIs without tool:catalog', function (): void {
    $bin = syncCatalogFakeCli();

    Process::fake(function ($process) {
        $command = implode(' ', $process->command);

        if (str_contains($command, 'tool:catalog')) {
            return Process::result(output: 'Command "tool:catalog" is not defined.', exitCode: 1);
        }

        return Process::result(output: json_encode([
            'tools' => [
                [
                    'tool' => 'pocketbase',
                    'brand' => 'PocketBase',
                    'label' => 'PocketBase',
                    'categories' => ['Database'],
                    'supportsNoPlex' => true,
                    'commonsCapabilities' => [
                        'plexDatabases' => [],
                        'supportsSqlite' => true,
                    ],
                ],
            ],
        ]));
    });

    SyncCatalogToolsJob::dispatchSync();

    expect(CatalogTool::count())->toBe(1)
        ->and(CatalogTool::firstWhere('slug', 'pocketbase')?->supports_no_plex)->toBeTrue()
        ->and(CatalogTool::firstWhere('slug', 'pocketbase')?->commons_capabilities['supportsSqlite'] ?? null)->toBeTrue();

    File::deleteDirectory($bin);
});

test('dispatches full catalog refresh when CLI sync succeeds', function (): void {
    Queue::fake();
    app(GlobalSettings::class)->update(['usage' => 'apps']);

    $wsl = Mockery::mock(Wsl::class)->makePartial();
    $wsl->shouldReceive('isWindows')->andReturn(true);
    $wsl->shouldReceive('update')->once()->with(channel: 'stable')->andReturn(['ok' => true]);

    $installer = Mockery::mock(CliInstaller::class);
    $installer->shouldReceive('channel')->andReturn('stable');

    (new SyncCliWithDesktopJob(notify: false))->handle($installer, app(ToolLocator::class), $wsl, app(GlobalSettings::class), app(RunNotifier::class));

    Queue::assertPushed(SyncCatalogToolsJob::class, fn (SyncCatalogToolsJob $job): bool => $job->fullRefresh === true);
});

test('dispatches full catalog refresh when manual server tools refresh is requested', function (): void {
    Queue::fake();

    Server::create([
        'name' => 'refresh-box',
        'provider' => 'do',
        'kind' => 'vps',
        'context' => 'larakube-refresh',
        'status' => 'ready',
    ]);

    $stacks = mock(StackCatalog::class);
    $stacks->shouldReceive('find')->with('refresh-box')->andReturn([
        'name' => 'refresh-box',
        'provider' => 'do',
        'kind' => 'vps',
        'context' => 'larakube-refresh',
        'status' => 'ready',
    ]);
    app()->instance(StackCatalog::class, $stacks);

    $this->post(route('servers.tools.refresh', ['server' => 'refresh-box']))->assertRedirect();

    Queue::assertPushed(SyncCatalogToolsJob::class, fn (SyncCatalogToolsJob $job): bool => $job->fullRefresh === true);
});
