<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Services\Elevation;
use App\Services\LaraKube\CliRunner;
use Illuminate\Http\RedirectResponse;

class LocalSetupController extends Controller
{
    public const MANUAL_COMMAND = 'larakube setup --profile=local --runtime=podman';

    public function store(CliRunner $runner, Elevation $elevation): RedirectResponse
    {
        if ($elevation->method() === null || ! $elevation->grant()) {
            return back()->withErrors([
                'local' => 'Desktop could not get administrator access. Open a terminal and run: '.self::MANUAL_COMMAND,
            ]);
        }

        $run = $runner->start(
            label: 'Set up local development',
            arguments: ['setup', '--profile=local', '--runtime=podman'],
            kind: RunKind::SetupLocal,
            subject: 'local-cluster',
            targetType: 'tool',
            targetName: 'Local development',
            environment: 'local',
        );

        return to_route('runs.show', $run);
    }
}
