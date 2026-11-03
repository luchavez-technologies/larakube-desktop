<?php

namespace App\Jobs\Sync;

use App\Models\Server;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Support\Facades\Process;

/**
 * Mirrors `larakube sso:status --json` for one server into the Zitadel SSO
 * tool's cluster_tools.data. Shells the CLI directly (not through
 * SsoStatus, which reads this same table).
 */
class SyncSsoJob extends SyncJob
{
    public const FRESH_SECONDS = 300;

    public function __construct(public int $serverId) {}

    protected function uniqueKey(): string
    {
        return (string) $this->serverId;
    }

    public function handle(ToolLocator $locator): void
    {
        $server = Server::find($this->serverId);

        if ($server === null || $server->context === null) {
            return;
        }

        $ssoTool = $server->ssoTool();

        if ($ssoTool === null) {
            return;
        }

        $ssoTool->update(['sync_status' => 'syncing']);

        try {
            $status = $this->json($locator, ['sso:status', 'production', "--context={$server->context}", '--json']);
        } catch (ProcessTimedOutException) {
            $ssoTool->update(['sync_status' => 'error', 'last_sync_error' => 'Timed out waiting for Zitadel SSO.']);

            return;
        }

        if ($status === null) {
            $ssoTool->update(['sync_status' => 'error', 'last_sync_error' => 'Could not reach Zitadel SSO.']);

            return;
        }

        $ssoTool->update([
            'data' => [...$ssoTool->data, 'status' => $status],
            'sync_status' => 'fresh',
            'last_synced_at' => now(),
            'last_sync_error' => null,
        ]);
    }

    /**
     * Execute a CLI command and decode JSON output regardless of non-zero exit codes.
     *
     * @param  list<string>  $arguments
     * @return array<string, mixed>|null
     */
    private function json(ToolLocator $locator, array $arguments): ?array
    {
        $cli = $locator->find('larakube');

        if ($cli === null) {
            return null;
        }

        $isolated = $locator->isolate([$cli, ...$arguments, '--no-interaction']);
        $result = Process::env($isolated['environment'])->timeout(150)->run($isolated['command']);

        $output = trim($result->output());

        $start = strpos($output, '{');
        $end = strrpos($output, '}');

        if ($start !== false && $end !== false && $end >= $start) {
            $output = substr($output, $start, $end - $start + 1);
        }

        $decoded = json_decode($output, true);

        return is_array($decoded) ? $decoded : null;
    }
}
