<?php

namespace App\Listeners;

use App\Enums\RunKind;
use App\Events\RunFinished;
use App\Services\LaraKube\LocalHealth;

/**
 * A run that changes what the Local Dev health check reports (cleaning up
 * certificates, trusting the CA, a local up) makes its cached report stale.
 */
class ForgetLocalHealth
{
    public function __construct(private LocalHealth $health) {}

    public function handleRunFinished(RunFinished $event): void
    {
        $kind = RunKind::tryFrom((string) $event->kind);

        if (in_array($kind, [RunKind::TrustPrune, RunKind::UpProject, RunKind::SetupLocal, RunKind::InstallTool], true)) {
            $this->health->forget();
        }
    }
}
