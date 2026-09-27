<?php

namespace App\Http\Controllers;

use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\LaraKube\CliRunner;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class RunController extends Controller
{
    public function show(Run $run): Response
    {
        return Inertia::render('runs/show', [
            'run' => [
                'id' => $run->id,
                'label' => $run->label,
                'status' => $run->status->value,
                'exitCode' => $run->exit_code,
                'output' => $run->output,
                'result' => $run->result,
                'startedAt' => $run->created_at?->toIso8601String(),
                'finishedAt' => $run->finished_at?->toIso8601String(),
            ],
        ]);
    }

    public function cancel(Run $run, CliRunner $runner): RedirectResponse
    {
        if ($run->status === RunStatus::Running) {
            $run->update(['status' => RunStatus::Cancelled]);
            $runner->cancel($run);
        }

        return to_route('runs.show', $run);
    }
}
