<?php

namespace App\Jobs\Sync;

use App\Models\MailAccount;
use App\Models\MailDomain;
use App\Models\Server;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Process;

/**
 * Mirrors `larakube mail:show`/`mail:domains`/`mail:accounts` for one
 * server's Stalwart install into mail_domains/mail_accounts, and folds the
 * server-info payload into the mail tool's cluster_tools.data. Shells the
 * CLI directly (not through MailStatus, which reads these same tables) —
 * this job is what populates them in the first place.
 */
class SyncMailJob extends SyncJob
{
    public const FRESH_SECONDS = 600;

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

        $mailTool = $server->mailTool();

        if ($mailTool === null) {
            return;
        }

        $mailTool->update(['sync_status' => 'syncing']);

        $info = $this->json($locator, ['mail:show', 'production', "--context={$server->context}", '--json']);
        $domainsData = $this->json($locator, ['mail:domains', 'production', "--context={$server->context}", '--json']);
        $accountsData = $this->json($locator, ['mail:accounts', 'production', "--context={$server->context}", '--json']);

        if ($info === null) {
            $mailTool->update(['sync_status' => 'error', 'last_sync_error' => 'Could not reach the mail server.']);

            return;
        }

        /** @var list<array{id?: string, name: string, accounts?: int}> $domains */
        $domains = is_array($domainsData['domains'] ?? null) ? array_values($domainsData['domains']) : [];
        /** @var list<array{email: string, name?: string, role?: string, quotaBytes?: int, usedBytes?: int}> $accounts */
        $accounts = is_array($accountsData['accounts'] ?? null) ? array_values($accountsData['accounts']) : [];
        $queue = (int) ($accountsData['queue'] ?? 0);

        DB::transaction(function () use ($server, $mailTool, $info, $domains, $accounts, $queue): void {
            $domainIds = [];

            foreach ($domains as $domain) {
                $row = MailDomain::updateOrCreate(
                    ['server_id' => $server->id, 'name' => $domain['name']],
                    ['cluster_tool_id' => $mailTool->id, 'accounts_count' => $domain['accounts'] ?? 0],
                );

                $domainIds[$domain['name']] = $row->id;
            }

            MailDomain::where('server_id', $server->id)
                ->whereNotIn('name', array_keys($domainIds))
                ->delete();

            $seenEmails = [];

            foreach ($accounts as $account) {
                $email = (string) $account['email'];
                $seenEmails[] = $email;
                $domainName = str_contains($email, '@') ? substr($email, strpos($email, '@') + 1) : null;

                MailAccount::updateOrCreate(
                    ['server_id' => $server->id, 'email' => $email],
                    [
                        'cluster_tool_id' => $mailTool->id,
                        'mail_domain_id' => $domainName !== null ? ($domainIds[$domainName] ?? null) : null,
                        'name' => $account['name'] ?? null,
                        'role' => $account['role'] ?? null,
                        'quota_bytes' => $account['quotaBytes'] ?? null,
                        'used_bytes' => $account['usedBytes'] ?? null,
                        'data' => $account,
                    ],
                );
            }

            MailAccount::where('server_id', $server->id)
                ->whereNotIn('email', $seenEmails)
                ->delete();

            $mailTool->update([
                'data' => [...$mailTool->data, 'serverInfo' => $info, 'queue' => $queue],
                'sync_status' => 'fresh',
                'last_synced_at' => now(),
                'last_sync_error' => null,
            ]);
        });
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
        $result = Process::env($isolated['environment'])->timeout(60)->run($isolated['command']);

        $output = trim($result->output());

        $startArr = strpos($output, '[');
        $startObj = strpos($output, '{');

        if ($startArr !== false && ($startObj === false || $startArr < $startObj)) {
            $endArr = strrpos($output, ']');
            if ($endArr !== false && $endArr >= $startArr) {
                $output = substr($output, $startArr, $endArr - $startArr + 1);
            }
        } elseif ($startObj !== false) {
            $endObj = strrpos($output, '}');
            if ($endObj !== false && $endObj >= $startObj) {
                $output = substr($output, $startObj, $endObj - $startObj + 1);
            }
        }

        $decoded = json_decode($output, true);

        return is_array($decoded) ? $decoded : null;
    }
}
