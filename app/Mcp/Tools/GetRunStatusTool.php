<?php

namespace App\Mcp\Tools;

use App\Models\Run;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Str;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Title;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[Name('get-run-status')]
#[Title('Get Run Status')]
#[Description('Checks the status of a run started by project-up, project-down, project-heal, install-cluster-tool, or remove-cluster-tool. Use this when one of those tools times out.')]
#[IsReadOnly]
class GetRunStatusTool extends Tool
{
    public function handle(Request $request): Response
    {
        $runId = (int) $request->get('run_id');
        $run = Run::query()->find($runId);

        if ($run === null) {
            return Response::error("No run found with id {$runId}.");
        }

        return Response::text(json_encode([
            'id' => $run->id,
            'label' => $run->label,
            'kind' => $run->kind?->value,
            'status' => $run->status->value,
            'exit_code' => $run->exit_code,
            'output' => Str::limit($run->output, 4000),
            'finished_at' => $run->finished_at?->toIso8601String(),
        ], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'run_id' => $schema->integer()->description('The run ID returned by project-up, project-down, project-heal, install-cluster-tool, or remove-cluster-tool'),
        ];
    }
}
