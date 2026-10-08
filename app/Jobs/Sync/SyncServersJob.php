<?php

namespace App\Jobs\Sync;

use App\Enums\ActivityType;
use App\Models\Activity;
use App\Models\Server;
use App\Services\LaraKube\StackCatalog;
use Illuminate\Support\Facades\DB;

/**
 * Mirrors `larakube cloud:stacks --json` (plus auto-discovered kubeconfig
 * contexts) into the servers table. Global — there is one list, not one per
 * server — so this replaces every page's own direct StackCatalog call.
 */
class SyncServersJob extends SyncJob
{
    public const FRESH_SECONDS = 1800;

    protected function uniqueKey(): string
    {
        return 'all';
    }

    public function handle(StackCatalog $stacks): void
    {
        $rows = $stacks->everything();

        if ($rows === null) {
            return;
        }

        $seenNames = [];

        DB::transaction(function () use ($rows, &$seenNames): void {
            foreach ($rows as $row) {
                $name = (string) $row['name'];
                $seenNames[] = $name;

                $wasNew = ! Server::where('name', $name)->exists();

                $server = Server::updateOrCreate(['name' => $name], [
                    'role' => $row['role'] ?? 'deploy',
                    'provider' => $row['provider'],
                    'kind' => $row['kind'],
                    'region' => $row['region'] ?? null,
                    'ip' => $row['ip'] ?? null,
                    'context' => $row['context'] ?? null,
                    'ssh_key' => $row['sshKey'] ?? null,
                    'bindings' => $row['bindings'] ?? null,
                    'account' => $row['account'] ?? null,
                    'cloud_project_id' => $row['projectId'] ?? null,
                    'status' => $row['status'],
                    'sync_status' => 'fresh',
                    'last_synced_at' => now(),
                    'last_sync_error' => null,
                ]);

                if ($wasNew) {
                    Activity::create([
                        'server_id' => $server->id,
                        'type' => ActivityType::ServerFirstSynced,
                        'title' => "First synced {$name}",
                        'occurred_at' => now(),
                    ]);
                }
            }

            // A server missing from a fresh listing is reported as gone, never hard-deleted —
            // cluster_tools/activities referencing it would otherwise lose their history.
            Server::whereNotIn('name', $seenNames)
                ->where('status', '!=', 'missing')
                ->update(['status' => 'missing', 'sync_status' => 'fresh', 'last_synced_at' => now(), 'last_sync_error' => null]);
        });
    }
}
