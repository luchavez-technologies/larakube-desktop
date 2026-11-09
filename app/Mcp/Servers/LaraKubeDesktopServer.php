<?php

namespace App\Mcp\Servers;

use App\Mcp\Methods\CompletionComplete;
use App\Mcp\Prompts\DiagnoseClusterPrompt;
use App\Mcp\Prompts\NewServerWizardPrompt;
use App\Mcp\Resources\ProjectBlueprintResource;
use App\Mcp\Resources\ProjectListResource;
use App\Mcp\Resources\ServerDetailResource;
use App\Mcp\Resources\ServerListResource;
use App\Mcp\Tools\ConnectDomainTool;
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
use Laravel\Mcp\Server;
use Laravel\Mcp\Server\Attributes\Instructions;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Version;
use Laravel\Mcp\Server\Methods\CallTool;
use Laravel\Mcp\Server\Methods\Discover;
use Laravel\Mcp\Server\Methods\GetPrompt;
use Laravel\Mcp\Server\Methods\Initialize;
use Laravel\Mcp\Server\Methods\Listen;
use Laravel\Mcp\Server\Methods\ListPrompts;
use Laravel\Mcp\Server\Methods\ListResources;
use Laravel\Mcp\Server\Methods\ListResourceTemplates;
use Laravel\Mcp\Server\Methods\ListTools;
use Laravel\Mcp\Server\Methods\Ping;
use Laravel\Mcp\Server\Methods\ReadResource;

#[Name('LaraKube Desktop Server')]
#[Version('0.1.0')]
#[Instructions('You are the LaraKube Desktop assistant. You can see and manage every registered Project, Server, and installed Cluster Tool. You can create or destroy servers, bring projects up/down, heal them, and install/remove cluster tools. Destructive actions (deleting a server, purging a project or a cluster tool\'s data) require an explicit confirm: true.')]
class LaraKubeDesktopServer extends Server
{
    protected array $capabilities = [
        self::CAPABILITY_TOOLS => [
            'listChanged' => false,
        ],
        self::CAPABILITY_RESOURCES => [
            'listChanged' => false,
        ],
        self::CAPABILITY_PROMPTS => [
            'listChanged' => false,
        ],
    ];

    /**
     * @return array<string, mixed>
     */
    protected function resolvedCapabilities(): array
    {
        $capabilities = parent::resolvedCapabilities();
        $capabilities[self::CAPABILITY_COMPLETIONS] = (object) [];

        return $capabilities;
    }

    protected array $methods = [
        'tools/list' => ListTools::class,
        'tools/call' => CallTool::class,
        'resources/list' => ListResources::class,
        'resources/read' => ReadResource::class,
        'resources/templates/list' => ListResourceTemplates::class,
        'prompts/list' => ListPrompts::class,
        'prompts/get' => GetPrompt::class,
        'completion/complete' => CompletionComplete::class,
        'server/discover' => Discover::class,
        'initialize' => Initialize::class,
        'ping' => Ping::class,
        'subscriptions/listen' => Listen::class,
    ];

    protected array $tools = [
        ListProjectsTool::class,
        ShowProjectTool::class,
        ListServersTool::class,
        ShowServerTool::class,
        CreateServerTool::class,
        ConnectDomainTool::class,
        DeleteServerTool::class,
        ListClusterToolsTool::class,
        ProjectUpTool::class,
        ProjectDownTool::class,
        ProjectHealTool::class,
        InstallClusterToolTool::class,
        RemoveClusterToolTool::class,
        GetRunStatusTool::class,
    ];

    protected array $resources = [
        ServerListResource::class,
        ServerDetailResource::class,
        ProjectListResource::class,
        ProjectBlueprintResource::class,
    ];

    protected array $prompts = [
        DiagnoseClusterPrompt::class,
        NewServerWizardPrompt::class,
    ];
}
