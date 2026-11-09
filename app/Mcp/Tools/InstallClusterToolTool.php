<?php

namespace App\Mcp\Tools;

use App\Enums\RunKind;
use App\Services\LaraKube\CliRunner;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Title;
use Laravel\Mcp\Server\Tool;

#[Name('install-cluster-tool')]
#[Title('Install Cluster Tool')]
#[Description('Installs a Cluster Tool on a server. Additive — safe to call without confirmation.')]
class InstallClusterToolTool extends Tool
{
    use PollsRun;

    private const int TIMEOUT_SECONDS = 120;

    public function handle(Request $request): Response
    {
        $server = (string) $request->get('server');
        $context = (string) $request->get('context');
        $tool = (string) $request->get('tool');
        $domain = (string) $request->get('domain');
        $adminEmail = $request->get('admin_email');

        // No UI form exists behind this tool to resolve per-tool option flags or SSO/mail
        // wiring choices, so it always installs with the safe, no-extra-wiring defaults.
        $run = app(CliRunner::class)->start(
            label: "Install {$tool} on {$server}",
            arguments: [
                'tool:add',
                "--tool={$tool}",
                "--context={$context}",
                "--domain={$domain}",
                ...($adminEmail ? ["--admin-email={$adminEmail}"] : []),
                '--no-wire-sso',
                '--no-wire-mail',
                '--force',
            ],
            kind: RunKind::InstallClusterTool,
            subject: $tool,
            serverName: $server,
            context: $context,
            tool: $tool,
        );

        return $this->pollRun($run, self::TIMEOUT_SECONDS);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'server' => $schema->string()->description('The server/stack name, from list-servers'),
            'context' => $schema->string()->description("The server's kube context, from show-server's output"),
            'tool' => $schema->string()->description('The tool slug to install, e.g. from list-cluster-tools'),
            'domain' => $schema->string()->description('The domain/host to install the tool under'),
            'admin_email' => $schema->string()->description('An admin email, for tools that need one')->nullable(),
        ];
    }
}
