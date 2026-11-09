<?php

namespace App\Mcp\Tools;

use App\Enums\RunKind;
use App\Models\Server;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\StackCatalog;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Title;
use Laravel\Mcp\Server\Tool;

#[Name('delete-server')]
#[Title('Delete Server')]
#[Description('Permanently tears down and destroys a cloud server and its cluster workloads. Destructive — requires confirm: true.')]
class DeleteServerTool extends Tool
{
    use PollsRun;

    private const int TIMEOUT_SECONDS = 120;

    public function handle(Request $request): Response
    {
        $name = trim((string) $request->get('name'));
        $confirm = (bool) $request->get('confirm', false);

        if ($name === '') {
            return Response::error('A server name is required.');
        }

        if (! $confirm) {
            return Response::error("Destroying server '{$name}' is permanent and cannot be undone. Re-call this tool with confirm: true to proceed.");
        }

        $server = Server::where('name', $name)->orWhere('ip', $name)->first();
        $stack = app(StackCatalog::class)->find($name);

        if ($server === null && $stack === null) {
            return Response::error("No server found named '{$name}'.");
        }

        $run = app(CliRunner::class)->start(
            label: "Destroy server {$name}",
            arguments: ['cloud:destroy', $name, '--force'],
            kind: RunKind::DestroyServer,
            subject: $name,
            meta: ['role' => $stack['role'] ?? 'deploy'],
            targetType: 'server',
            targetName: $name,
            serverName: $name,
        );

        return $this->pollRun($run, self::TIMEOUT_SECONDS);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'name' => $schema->string()->description('The server/stack name to destroy, from list-servers'),
            'confirm' => $schema->boolean()->description('Must be true to authorize permanent destruction of the server and its cluster resources'),
        ];
    }
}
