<?php

namespace App\Mcp\Tools;

use App\Models\Server;
use App\Services\LaraKube\StackCatalog;

trait ResolvesServerContext
{
    /**
     * Resolve Kubernetes context from an explicit `$context` or server name/IP.
     *
     * @return array{0: ?Server, 1: string}
     */
    protected function resolveServerAndContext(string $server, string $context): array
    {
        $serverName = trim($server);
        $resolvedContext = trim($context);

        $serverModel = $serverName !== ''
            ? Server::where('name', $serverName)->orWhere('ip', $serverName)->first()
            : ($resolvedContext !== '' ? Server::firstWhere('context', $resolvedContext) : null);

        if ($resolvedContext === '' && $serverName !== '') {
            if ($serverModel instanceof Server && $serverModel->context) {
                $resolvedContext = (string) $serverModel->context;
            } else {
                $stack = app(StackCatalog::class)->find($serverName);
                $resolvedContext = (string) ($stack['context'] ?? '');
            }
        }

        return [$serverModel, $resolvedContext];
    }
}
