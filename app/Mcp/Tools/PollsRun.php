<?php

namespace App\Mcp\Tools;

use App\Models\Run;
use Illuminate\Support\Sleep;
use Illuminate\Support\Str;
use Laravel\Mcp\Response;

/**
 * An MCP tool call is expected to block and return one result, so every
 * write tool polls its Run to completion instead of returning a handle —
 * get-run-status is the escape hatch for whatever times out here.
 */
trait PollsRun
{
    private function pollRun(Run $run, int $timeoutSeconds): Response
    {
        $deadline = now()->addSeconds($timeoutSeconds);

        while (now()->lessThan($deadline)) {
            $run->refresh();

            if ($run->status->isFinished()) {
                return Response::text(json_encode([
                    'run_id' => $run->id,
                    'status' => $run->status->value,
                    'exit_code' => $run->exit_code,
                    'output' => Str::limit($run->output, 4000),
                ], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
            }

            Sleep::sleep(1);
        }

        return Response::error("Timed out after {$timeoutSeconds}s waiting for '{$run->label}' to finish. It may still be running — check with get-run-status, run id {$run->id}.");
    }
}
