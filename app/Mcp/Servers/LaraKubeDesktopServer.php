<?php

namespace App\Mcp\Servers;

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
use Laravel\Mcp\Server;
use Laravel\Mcp\Server\Attributes\Instructions;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Version;

#[Name('LaraKube Desktop Server')]
#[Version('0.1.0')]
#[Instructions('You are the LaraKube Desktop assistant. You can see every registered Project, Server, and installed Cluster Tool, and can bring projects up/down, heal them, and install/remove cluster tools. Destructive actions (purging a project or a cluster tool\'s data) require an explicit confirm: true.')]
class LaraKubeDesktopServer extends Server
{
    protected array $tools = [
        ListProjectsTool::class,
        ShowProjectTool::class,
        ListServersTool::class,
        ShowServerTool::class,
        ListClusterToolsTool::class,
        ProjectUpTool::class,
        ProjectDownTool::class,
        ProjectHealTool::class,
        InstallClusterToolTool::class,
        RemoveClusterToolTool::class,
        GetRunStatusTool::class,
    ];

    protected array $resources = [
        //
    ];

    protected array $prompts = [
        //
    ];
}
