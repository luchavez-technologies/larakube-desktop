<?php

use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;

test('POST /servers/{server}/backups/prune-preview returns parsed retention plan JSON', function (): void {
    $bin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    $catalog = Mockery::mock(StackCatalog::class);
    $catalog->shouldReceive('find')->with('luchtech-vps')->andReturn([
        'name' => 'luchtech-vps',
        'kind' => 'vps',
        'status' => 'ready',
        'context' => 'do-sgp1-luchtech',
        'ip' => '159.89.205.239',
    ]);
    app()->instance(StackCatalog::class, $catalog);

    Process::fake([
        '*backup:prune*' => Process::result(output: json_encode([
            'success' => true,
            'bucket' => 'larakube-backups',
            'keepCount' => 1,
            'deleteCount' => 1,
            'freedHuman' => '2 KB',
            'items' => [
                ['stamp' => '2026-11-19-191701', 'takenAt' => '2026-11-19 03:21:19', 'bytes' => 1024, 'size' => '1 KB', 'complete' => true, 'action' => 'keep'],
                ['stamp' => '2026-11-01-191702', 'takenAt' => '2026-11-01 03:20:40', 'bytes' => 2048, 'size' => '2 KB', 'complete' => false, 'action' => 'delete'],
            ],
        ])),
    ]);

    $this->postJson('/servers/luchtech-vps/backups/prune-preview')
        ->assertOk()
        ->assertJson([
            'success' => true,
            'keepCount' => 1,
            'deleteCount' => 1,
            'freedHuman' => '2 KB',
        ]);
});
