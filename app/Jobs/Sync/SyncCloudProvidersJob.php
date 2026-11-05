<?php

namespace App\Jobs\Sync;

use App\Services\LaraKube\ReadinessCheck;

/**
 * Refreshes provider credential status and accounts in the background from
 * `larakube cloud:providers --status-only --json` without blocking web requests.
 */
class SyncCloudProvidersJob extends SyncJob
{
    public int $timeout = 60;

    public function __construct()
    {
        $this->onQueue('sync');
    }

    protected function uniqueKey(): string
    {
        return 'all';
    }

    public function handle(ReadinessCheck $readiness): void
    {
        $readiness->providers(fresh: true, statusOnly: true);
    }
}
