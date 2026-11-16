<?php

namespace App\Jobs\Sync;

use App\Enums\ServerDataScope;
use App\Jobs\Middleware\AnnounceServerDataSynced;

/**
 * A sync of one server's data. Every attempt ends by announcing
 * ServerDataSynced for scope(), through job middleware, so no job has to
 * remember to fire it past its own early returns (ADR 0021).
 */
abstract class ServerSyncJob extends SyncJob
{
    public function __construct(public int $serverId) {}

    abstract public function scope(): ServerDataScope;

    protected function uniqueKey(): string
    {
        return (string) $this->serverId;
    }

    /** @return list<object> */
    public function middleware(): array
    {
        return [new AnnounceServerDataSynced];
    }
}
