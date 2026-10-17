<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Services\Elevation;
use App\Services\LaraKube\CliRunner;
use App\Services\Wsl;
use Illuminate\Http\RedirectResponse;

class LocalSetupController extends Controller
{
    public const MANUAL_COMMAND = 'larakube setup --profile=local --runtime=podman';

    public function store(CliRunner $runner, Elevation $elevation, Wsl $wsl): RedirectResponse
    {
        if ($wsl->isWindows()) {
            // A freshly-written mirrored-networking config only takes effect
            // once WSL restarts. If this call is the one writing it for the
            // first time and the distro happens to be running already,
            // restart it now (when safe) so the upcoming CLI run never finds
            // it inactive — otherwise it already was mirrored (or wasn't
            // running at all, so the next normal start picks it up on its
            // own), and nothing needs to change here.
            $justRequested = ! $wsl->mirroredNetworkingRequested();
            $wsl->ensureMirroredNetworking();

            if ($justRequested && $wsl->mirroredNetworkingRequested() && $wsl->distroIsRunning()) {
                $wsl->restartForNetworkingChange();
            }
        }

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
