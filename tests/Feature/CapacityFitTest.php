<?php

use App\Enums\ServerDataScope;
use App\Events\ServerDataSynced;
use App\Jobs\Sync\SyncServerCapacityJob;
use App\Mcp\Tools\InstallClusterToolTool;
use App\Models\Server;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ClusterStatus;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolCatalog;
use Illuminate\Support\Facades\Event;
use Laravel\Mcp\Request as McpRequest;

test('SyncServerCapacityJob caches capacity_data on the server and announces ServerDataSynced', function (): void {
    Event::fake([ServerDataSynced::class]);

    $server = Server::create([
        'name' => 'alpha',
        'provider' => 'do',
        'kind' => 'vps',
        'context' => 'larakube-alpha',
        'status' => 'ready',
    ]);

    $payload = [
        'node' => ['count' => 1, 'allocatable_memory_bytes' => 2_000_000_000, 'free_memory_bytes' => 1_000_000_000, 'basis' => 'usage'],
        'breakdown' => ['system' => ['memory_bytes' => 400_000_000], 'platform' => ['memory_bytes' => 200_000_000], 'apps' => [], 'free' => ['memory_bytes' => 1_000_000_000]],
    ];

    $status = mock(ClusterStatus::class);
    $status->shouldReceive('capacity')->with('larakube-alpha')->andReturn($payload);
    app()->instance(ClusterStatus::class, $status);

    SyncServerCapacityJob::dispatchSync($server->id);

    $fresh = $server->fresh();
    expect($fresh->capacity_sync_status)->toBe('fresh')
        ->and($fresh->capacity_data)->toBe($payload);

    Event::assertDispatched(ServerDataSynced::class, fn (ServerDataSynced $e): bool => $e->server === 'alpha' && $e->scope === ServerDataScope::Capacity->value);
});

test('GET /quick-actions/fit returns the cluster:capacity verdict for the selected server and tool', function (): void {
    $stacks = mock(StackCatalog::class);
    $stacks->shouldReceive('find')->with('alpha')->andReturn([
        'name' => 'alpha', 'provider' => 'do', 'kind' => 'vps', 'status' => 'ready', 'context' => 'larakube-alpha',
    ]);
    app()->instance(StackCatalog::class, $stacks);

    $tools = mock(ToolCatalog::class);
    $tools->shouldReceive('find')->with('larakube-alpha', 'directus')->andReturn([
        'tool' => 'directus', 'label' => 'Directus', 'initFields' => [],
    ]);
    app()->instance(ToolCatalog::class, $tools);

    $assessment = [
        'node' => ['free_memory_bytes' => 100_000_000],
        'breakdown' => ['system' => [], 'platform' => [], 'apps' => [], 'free' => []],
        'verdict' => 'wont_fit_now',
        'pause_candidates' => [['tool' => 'n8n', 'label' => 'n8n', 'memory_bytes' => 536_870_912, 'command' => 'larakube tool:pause n8n']],
        'alternatives_that_fit' => [['tool' => 'pocketbase', 'label' => 'PocketBase', 'memory_bytes' => 67_108_864, 'verdict' => 'fits']],
        'upsize_hint' => 'Upsize via `larakube cloud:scale`',
    ];

    $status = mock(ClusterStatus::class);
    $status->shouldReceive('capacity')->with('larakube-alpha', 'directus', [])->andReturn($assessment);
    app()->instance(ClusterStatus::class, $status);

    $this->getJson('/quick-actions/fit?tool=directus&server=alpha')
        ->assertOk()
        ->assertJsonPath('assessment.verdict', 'wont_fit_now')
        ->assertJsonPath('assessment.alternatives_that_fit.0.tool', 'pocketbase');
});

test('MCP install-cluster-tool refuses when capacity verdict is never_fits or wont_fit_now', function (): void {
    $stacks = mock(StackCatalog::class);
    $stacks->shouldReceive('find')->with('alpha')->andReturn([
        'name' => 'alpha', 'provider' => 'do', 'kind' => 'vps', 'status' => 'ready', 'context' => 'larakube-alpha', 'account' => 'ops@example.com',
    ]);
    app()->instance(StackCatalog::class, $stacks);

    $tools = mock(ToolCatalog::class);
    $tools->shouldReceive('find')->with('larakube-alpha', 'directus')->andReturn([
        'tool' => 'directus', 'label' => 'Directus', 'initFields' => [],
        'commonsCapabilities' => ['databases' => ['postgres'], 'cache' => [], 'storage' => [], 'auth' => [], 'mail' => []],
    ]);
    $tools->shouldReceive('findDefinition')->andReturn([
        'tool' => 'directus', 'label' => 'Directus', 'initFields' => [],
        'commonsCapabilities' => ['databases' => ['postgres'], 'cache' => [], 'storage' => [], 'auth' => [], 'mail' => []],
    ]);
    app()->instance(ToolCatalog::class, $tools);

    $status = mock(ClusterStatus::class);
    $status->shouldReceive('plex')->with('larakube-alpha')->andReturn(null);
    $status->shouldReceive('capacity')->with('larakube-alpha', 'directus', [])->andReturn([
        'node' => ['free_memory_bytes' => 100_000_000],
        'breakdown' => ['system' => [], 'platform' => [], 'apps' => [], 'free' => []],
        'verdict' => 'never_fits',
        'pause_candidates' => [],
        'alternatives_that_fit' => [['tool' => 'pocketbase', 'label' => 'PocketBase', 'memory_bytes' => 67_108_864, 'verdict' => 'fits']],
        'upsize_hint' => 'Upsize via `larakube cloud:scale`',
    ]);
    app()->instance(ClusterStatus::class, $status);

    $runner = mock(CliRunner::class);
    $runner->shouldNotReceive('start');
    app()->instance(CliRunner::class, $runner);

    $response = app(InstallClusterToolTool::class)->handle(new McpRequest([
        'server' => 'alpha',
        'tool' => 'directus',
        'domain' => 'cms.example.com',
    ]));

    expect($response->isError())->toBeTrue()
        ->and((string) $response->content())->toContain('never_fits')
        ->and((string) $response->content())->toContain('pocketbase');
});
