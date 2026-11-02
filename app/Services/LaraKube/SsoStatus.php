<?php

namespace App\Services\LaraKube;

use LogicException;

class SsoStatus
{
    /**
     * @return array<string, mixed>
     */
    public function status(string $context): array
    {
        throw new LogicException('not implemented');
    }

    public function isInstalled(string $context): bool
    {
        throw new LogicException('not implemented');
    }

    /**
     * @return array{status: string, lastSyncedAt: ?string, error: ?string}
     */
    public function syncState(string $context): array
    {
        throw new LogicException('not implemented');
    }

    public function forget(string $context): void
    {
        throw new LogicException('not implemented');
    }
}
