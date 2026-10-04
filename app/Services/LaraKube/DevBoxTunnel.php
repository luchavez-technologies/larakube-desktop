<?php

namespace App\Services\LaraKube;

use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Support\Facades\Process;

/**
 * A dev box only opens SSH, so its cluster is reached through a tunnel the CLI keeps open and a
 * kube-context that points at it. This asks the CLI to make sure both exist.
 */
class DevBoxTunnel
{
    public function __construct(private ToolLocator $locator) {}

    /** The kube-context for the box, with its tunnel open, or null when it could not be reached. */
    public function connect(string $box): ?string
    {
        $cli = $this->locator->find('larakube');

        if ($cli === null) {
            return null;
        }

        $isolated = $this->locator->isolate([$cli, 'devbox:connect', "--stack-name={$box}", '--json', '--no-interaction']);

        try {
            $result = Process::env($isolated['environment'])->timeout(60)->run($isolated['command']);
        } catch (ProcessTimedOutException) {
            return null;
        }

        $lines = preg_split('/\R/', trim($result->output())) ?: [];
        $decoded = json_decode((string) end($lines), true);

        return $result->successful() && is_array($decoded) && is_string($decoded['context'] ?? null) ? $decoded['context'] : null;
    }
}
