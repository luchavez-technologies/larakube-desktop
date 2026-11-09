<?php

use App\Mcp\Servers\LaraKubeDesktopServer;
use App\Mcp\Tools\CreateServerTool;
use App\Mcp\Tools\DeleteServerTool;
use App\Mcp\Tools\GetRunStatusTool;
use App\Mcp\Tools\InstallClusterToolTool;
use App\Mcp\Tools\ListClusterToolsTool;
use App\Mcp\Tools\ListProjectsTool;
use App\Mcp\Tools\ListServersTool;
use App\Mcp\Tools\ProjectDownTool;
use App\Mcp\Tools\ProjectHealTool;
use App\Mcp\Tools\ProjectUpTool;
use App\Mcp\Tools\RemoveClusterToolTool;
use App\Mcp\Tools\ShowProjectTool;
use App\Mcp\Tools\ShowServerTool;

test('tools advertise readOnlyHint, destructiveHint, and idempotentHint annotations', function (): void {
    // Read-only tools
    expect((new ListProjectsTool)->annotations()['readOnlyHint'] ?? false)->toBeTrue()
        ->and((new ShowProjectTool)->annotations()['readOnlyHint'] ?? false)->toBeTrue()
        ->and((new ListServersTool)->annotations()['readOnlyHint'] ?? false)->toBeTrue()
        ->and((new ShowServerTool)->annotations()['readOnlyHint'] ?? false)->toBeTrue()
        ->and((new ListClusterToolsTool)->annotations()['readOnlyHint'] ?? false)->toBeTrue()
        ->and((new GetRunStatusTool)->annotations()['readOnlyHint'] ?? false)->toBeTrue();

    // Destructive tools
    expect((new DeleteServerTool)->annotations()['destructiveHint'] ?? false)->toBeTrue()
        ->and((new RemoveClusterToolTool)->annotations()['destructiveHint'] ?? false)->toBeTrue()
        ->and((new ProjectDownTool)->annotations()['destructiveHint'] ?? false)->toBeTrue();

    // Idempotent tools
    expect((new CreateServerTool)->annotations()['idempotentHint'] ?? false)->toBeTrue()
        ->and((new InstallClusterToolTool)->annotations()['idempotentHint'] ?? false)->toBeTrue()
        ->and((new ProjectUpTool)->annotations()['idempotentHint'] ?? false)->toBeTrue()
        ->and((new ProjectHealTool)->annotations()['idempotentHint'] ?? false)->toBeTrue();
});

test('server registers all 13 tools with proper hints in tools list', function (): void {
    $toolsResponse = LaraKubeDesktopServer::tools();
    $toolsResponse->assertRegistered([
        ListProjectsTool::class,
        ShowProjectTool::class,
        ListServersTool::class,
        ShowServerTool::class,
        CreateServerTool::class,
        DeleteServerTool::class,
        ListClusterToolsTool::class,
        ProjectUpTool::class,
        ProjectDownTool::class,
        ProjectHealTool::class,
        InstallClusterToolTool::class,
        RemoveClusterToolTool::class,
        GetRunStatusTool::class,
    ]);
});
