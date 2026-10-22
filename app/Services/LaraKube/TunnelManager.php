<?php

namespace App\Services\LaraKube;

use Illuminate\Support\Facades\Cache;
use Native\Desktop\Facades\ChildProcess;

class TunnelManager
{
    private const CACHE_KEY = 'larakube_active_tunnels';

    public function __construct(private ToolLocator $locator) {}

    /**
     * @return array<string, array{alias: string, namespace: string, service: string, localPort: int, remotePort: int, context: ?string, active: bool}>
     */
    public function all(): array
    {
        /** @var array<string, array{alias: string, namespace: string, service: string, localPort: int, remotePort: int, context: ?string, active: bool}> $tunnels */
        $tunnels = Cache::get(self::CACHE_KEY, []);
        $updated = [];

        foreach ($tunnels as $key => $tunnel) {
            $listening = $this->isPortListening($tunnel['localPort']);
            $updated[$key] = [
                ...$tunnel,
                'active' => $listening,
            ];
        }

        Cache::put(self::CACHE_KEY, $updated, now()->addDays(7));

        return $updated;
    }

    public function start(string $namespace, string $service, int $localPort, int $remotePort, ?string $context = null): bool
    {
        $cli = $this->locator->find('kubectl');
        if ($cli === null) {
            return false;
        }

        $key = $this->key($namespace, $service, $localPort);
        $alias = "tunnel:{$key}";

        ChildProcess::stop($alias);

        $command = $context !== null && $context !== ''
            ? [$cli, '--context', $context, 'port-forward', '-n', $namespace, "svc/{$service}", "{$localPort}:{$remotePort}"]
            : [$cli, 'port-forward', '-n', $namespace, "svc/{$service}", "{$localPort}:{$remotePort}"];

        $this->locator->start($command, $alias);

        /** @var array<string, array{alias: string, namespace: string, service: string, localPort: int, remotePort: int, context: ?string, active: bool}> $tunnels */
        $tunnels = Cache::get(self::CACHE_KEY, []);
        $tunnels[$key] = [
            'alias' => $alias,
            'namespace' => $namespace,
            'service' => $service,
            'localPort' => $localPort,
            'remotePort' => $remotePort,
            'context' => $context,
            'active' => true,
        ];
        Cache::put(self::CACHE_KEY, $tunnels, now()->addDays(7));

        return true;
    }

    public function stop(string $namespace, string $service, int $localPort): bool
    {
        $key = $this->key($namespace, $service, $localPort);
        $alias = "tunnel:{$key}";

        ChildProcess::stop($alias);

        /** @var array<string, array{alias: string, namespace: string, service: string, localPort: int, remotePort: int, context: ?string, active: bool}> $tunnels */
        $tunnels = Cache::get(self::CACHE_KEY, []);
        unset($tunnels[$key]);
        Cache::put(self::CACHE_KEY, $tunnels, now()->addDays(7));

        return true;
    }

    public function isPortListening(int $port): bool
    {
        $connection = @fsockopen('127.0.0.1', $port, $errno, $errstr, 0.1);
        if (is_resource($connection)) {
            fclose($connection);

            return true;
        }

        return false;
    }

    public function key(string $namespace, string $service, int $localPort): string
    {
        return "{$namespace}_{$service}_{$localPort}";
    }
}
