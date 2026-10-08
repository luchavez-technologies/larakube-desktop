<?php

namespace App\Services\LaraKube;

use App\Jobs\Sync\SyncClusterToolsJob;
use App\Jobs\Sync\SyncMailJob;
use App\Models\ClusterTool;
use App\Models\MailAccount;
use App\Models\MailDomain;
use App\Models\Server;
use Illuminate\Support\Facades\Process;

/**
 * Stalwart mail status, accounts and domains, mirrored into the
 * mail_accounts/mail_domains tables (and the mail ClusterTool row) by
 * SyncClusterToolsJob/SyncMailJob. Reads here are instant database reads; a
 * stale or missing picture triggers a background re-sync rather than
 * blocking on the CLI. checkDns() stays a live, uncached probe — a DNS/TLS
 * check is only meaningful run fresh, right when asked for.
 */
class MailStatus
{
    public function __construct(private ToolLocator $locator) {}

    /**
     * Server connection, admin credentials, webmail URL, queue metrics, and active relay.
     *
     * @return array{installed: bool, host?: ?string, adminUrl?: ?string, adminLogin?: string, adminPassword?: ?string, webmailUrl?: ?string, imap?: ?array{host: string, port: int, tls: bool}, smtp?: ?array{host: string, port: int, tls: bool}, queue?: int, relay?: ?array{configured: bool, provider: string, username?: ?string, region?: ?string, port?: int, host?: string}, sso?: ?array{installed?: bool}}|null
     */
    public function serverInfo(string $context): ?array
    {
        $server = Server::firstWhere('context', $context);

        if ($server === null) {
            return null;
        }

        $mailTool = $this->syncIfNeeded($server);

        if ($mailTool === null) {
            return ['installed' => false];
        }

        /** @var array{installed: bool, host?: ?string, adminUrl?: ?string, adminLogin?: string, adminPassword?: ?string, webmailUrl?: ?string, imap?: ?array{host: string, port: int, tls: bool}, smtp?: ?array{host: string, port: int, tls: bool}, queue?: int, relay?: ?array{configured: bool, provider: string, username?: ?string, region?: ?string, port?: int, host?: string}, sso?: ?array{installed?: bool}} $info */
        $info = $mailTool->data['serverInfo'] ?? ['installed' => $mailTool->installed];

        return $info;
    }

    /**
     * Whether Stalwart is installed, from the already-synced tool list — no
     * live CLI call needed to answer this, but this is also what triggers
     * the first sync for a server never checked before.
     */
    public function isInstalled(string $context): bool
    {
        $server = Server::firstWhere('context', $context);

        if ($server === null) {
            return false;
        }

        $mailTool = $this->syncIfNeeded($server);

        return $mailTool !== null && $mailTool->installed;
    }

    /**
     * Whether the mail picture shown is fresh, syncing, stale or erroring, and
     * when it was last confirmed — for the "syncing in the background" badge.
     *
     * @return array{status: string, lastSyncedAt: ?string, error: ?string}
     */
    public function syncState(string $context): array
    {
        $mailTool = Server::firstWhere('context', $context)?->mailTool();

        if ($mailTool === null) {
            return ['status' => 'stale', 'lastSyncedAt' => null, 'error' => null];
        }

        return [
            'status' => $mailTool->sync_status,
            'lastSyncedAt' => $mailTool->last_synced_at?->toAtomString(),
            'error' => $mailTool->last_sync_error,
        ];
    }

    /**
     * List configured mail domains with account counts.
     *
     * @return list<array{id: string, name: string, accounts: int}>
     */
    public function domains(string $context): array
    {
        $server = Server::firstWhere('context', $context);

        if ($server === null) {
            return [];
        }

        $this->syncIfNeeded($server);

        return array_values($server->mailDomains()->get()
            ->map(fn (MailDomain $domain): array => ['id' => (string) $domain->id, 'name' => $domain->name, 'accounts' => $domain->accounts_count])
            ->all());
    }

    /**
     * List mailboxes / accounts.
     *
     * @return array{accounts: list<array{email: string, name: string, role: string, quota: string, quotaBytes: ?int, used: string, usedBytes: ?int}>, queue: int}
     */
    public function accounts(string $context): array
    {
        $server = Server::firstWhere('context', $context);

        if ($server === null) {
            return ['accounts' => [], 'queue' => 0];
        }

        $mailTool = $this->syncIfNeeded($server);

        return [
            'accounts' => array_values($server->mailAccounts()->get()->map(fn (MailAccount $account): array => $account->toAccountArray())->all()),
            'queue' => (int) ($mailTool?->data['queue'] ?? 0),
        ];
    }

    /**
     * Run live DNS and service reachability verification for a domain.
     *
     * @return array{installed: bool, domain?: string, host?: string, environment?: string, summary?: array{pass: int, warn: int, fail: int}, checks?: list<array{status: string, label: string, hint: string}>, error?: string}|null
     */
    public function checkDns(string $context, ?string $domain = null): ?array
    {
        $args = ['mail:check', 'production', "--context={$context}", '--json'];
        if ($domain !== null && $domain !== '') {
            $args[] = "--domain={$domain}";
        }

        /** @var array{installed: bool, domain?: string, host?: string, environment?: string, summary?: array{pass: int, warn: int, fail: int}, checks?: list<array{status: string, label: string, hint: string}>, error?: string}|null $result */
        $result = $this->json($args, timeout: 60);

        return $result;
    }

    /** Marks mail data stale and dispatches an immediate re-sync — for use after a mutation completes. */
    public function forget(string $context): void
    {
        $server = Server::firstWhere('context', $context);

        if ($server === null) {
            return;
        }

        $mailTool = $server->mailTool();

        if ($mailTool === null) {
            SyncClusterToolsJob::dispatch($server->id);

            return;
        }

        $mailTool->update(['sync_status' => 'stale']);
        SyncMailJob::dispatch($server->id);
    }

    /**
     * Dispatches whichever sync this server's mail picture needs, and
     * returns the mail tool row as currently known (possibly stale).
     */
    private function syncIfNeeded(Server $server): ?ClusterTool
    {
        $mailTool = $server->mailTool();

        // A row already mid-sync (by this call or a concurrent one) is left alone —
        // treating "syncing" the same as "needs a sync" would cascade duplicate jobs.
        if ($mailTool !== null && $mailTool->sync_status === 'syncing') {
            return $mailTool;
        }

        if ($mailTool === null || $mailTool->sync_status !== 'fresh') {
            SyncClusterToolsJob::dispatch($server->id);

            // Under the sync queue driver the dispatch above already ran and wrote
            // the row, so re-querying picks it up instead of returning the
            // pre-dispatch snapshot; under a real async worker it's a no-op re-read.
            return $server->mailTool();
        }

        if (! $mailTool->installed) {
            return $mailTool;
        }

        // Whether mail data has EVER been synced, not whether any mailboxes
        // exist — a server with genuinely zero mailboxes must not look
        // perpetually unsynced and get re-dispatched on every single check.
        $everSynced = isset($mailTool->data['serverInfo']);
        $mailFresh = $mailTool->last_synced_at !== null
            && $mailTool->last_synced_at->gt(now()->subSeconds(SyncMailJob::FRESH_SECONDS));

        if (! $everSynced || ! $mailFresh) {
            SyncMailJob::dispatch($server->id);

            return $mailTool->fresh();
        }

        return $mailTool;
    }

    /**
     * Execute a CLI command and decode JSON output regardless of non-zero exit codes.
     *
     * @param  list<string>  $arguments
     * @return array<string, mixed>|null
     */
    private function json(array $arguments, int $timeout): ?array
    {
        $cli = $this->locator->find('larakube');

        if ($cli === null) {
            return null;
        }

        set_time_limit($timeout + 30);

        $isolated = $this->locator->isolate([$cli, ...$arguments, '--no-interaction']);
        $result = Process::env($isolated['environment'])->timeout($timeout)->run($isolated['command']);

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
