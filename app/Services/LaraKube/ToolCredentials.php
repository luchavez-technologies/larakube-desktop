<?php

namespace App\Services\LaraKube;

use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Support\Facades\Process;

/**
 * One tool's bootstrap credentials (admin email/password, when it has any),
 * read live via `tool:show --json`. Deliberately NOT cached or synced into
 * cluster_tools: this is asked for once, right after a successful install,
 * the same "live, uncached probe" shape as ClusterStatus::checkDns() — not a
 * steady-state picture worth a background job.
 */
class ToolCredentials
{
    public function __construct(private ToolLocator $locator) {}

    /**
     * @return array<string, mixed>|null null when the CLI is missing, the
     *                                   call fails, or the tool is not actually installed yet
     */
    public function fetch(string $context, string $tool, string $domain): ?array
    {
        $cli = $this->locator->find('larakube');

        if ($cli === null) {
            return null;
        }

        $isolated = $this->locator->isolate([
            $cli, 'tool:show', 'local',
            "--tool={$tool}",
            "--domain={$domain}",
            "--context={$context}",
            '--json',
            '--no-interaction',
        ]);

        try {
            $result = Process::env($isolated['environment'])->timeout(30)->run($isolated['command']);
        } catch (ProcessTimedOutException) {
            return null;
        }

        $decoded = json_decode(trim($result->output()), true);

        return is_array($decoded) ? $decoded : null;
    }
}
