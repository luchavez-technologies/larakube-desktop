<?php

namespace App\Jobs\Sync;

use App\Models\Server;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Support\Facades\Process;

/**
 * Mirrors `larakube secrets:status --json` for one server into the OpenBao
 * tool's cluster_tools.data — bootstrapped/sealed state, static-role
 * rotation wiring, and custom env var counts. Shells the CLI directly (not
 * through OpenBaoStatus, which reads this same table).
 */
class SyncOpenBaoJob extends SyncJob
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

        $openBaoTool = $server->openBaoTool();

        if ($openBaoTool === null) {
            return;
        }

        $openBaoTool->update(['sync_status' => 'syncing']);

        try {
            $status = $this->json($locator, ['secrets:status', 'production', "--context={$server->context}", '--json']);
        } catch (ProcessTimedOutException) {
            // A timed-out Process::run() throws rather than returning — left
            // uncaught, the job fails and sync_status is stuck on 'syncing'
            // forever (the retry/failure path never reaches the update()
            // below). Confirmed live 2026-11-03: the per-role rotation-info
            // read used to be two port-forwards each; at 9 real wired tools
            // that was comfortably enough to exceed this job's own timeout.
            $openBaoTool->update(['sync_status' => 'error', 'last_sync_error' => 'Timed out waiting for OpenBao.']);

            return;
        }

        if ($status === null) {
            $openBaoTool->update(['sync_status' => 'error', 'last_sync_error' => 'Could not reach OpenBao.']);

            return;
        }

        $openBaoTool->update([
            'data' => [...$openBaoTool->data, 'status' => $status],
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
