<?php

namespace App\Services\LaraKube;

use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Process;

/**
 * Live Stalwart mail status, accounts, domains, and DNS verification
 * queried from the LaraKube CLI (`mail:show`, `mail:domains`, `mail:accounts`, `mail:check`).
 */
class MailStatus
{
    public const TTL_SECONDS = 180;

    public function __construct(private ToolLocator $locator) {}

    /**
     * Server connection, admin credentials, webmail URL, queue metrics, and active relay.
     *
     * @return array{installed: bool, host?: ?string, adminUrl?: ?string, adminLogin?: string, adminPassword?: ?string, webmailUrl?: ?string, imap?: ?array{host: string, port: int, tls: bool}, smtp?: ?array{host: string, port: int, tls: bool}, queue?: int, relay?: ?array{configured: bool, provider: string, username?: ?string, region?: ?string, port?: int, host?: string}, sso?: ?array{installed?: bool}}|null
     */
    public function serverInfo(string $context): ?array
    {
        /** @var array{installed: bool, host?: ?string, adminUrl?: ?string, adminLogin?: string, adminPassword?: ?string, webmailUrl?: ?string, imap?: ?array{host: string, port: int, tls: bool}, smtp?: ?array{host: string, port: int, tls: bool}, queue?: int, relay?: ?array{configured: bool, provider: string, username?: ?string, region?: ?string, port?: int, host?: string}, sso?: ?array{installed?: bool}}|null $info */
        $info = $this->remember("mail:server:{$context}", function () use ($context): ?array {
            return $this->json(['mail:show', 'production', "--context={$context}", '--json'], timeout: 60);
        });

        return $info;
    }

    /**
     * Check whether Stalwart is installed on the given cluster context.
     */
    public function isInstalled(string $context): bool
    {
        $info = $this->serverInfo($context);

        return (bool) ($info['installed'] ?? false);
    }

    /**
     * List configured mail domains with account counts.
     *
     * @return list<array{id: string, name: string, accounts: int}>
     */
    public function domains(string $context): array
    {
        /** @var list<array{id: string, name: string, accounts: int}>|null $domains */
        $domains = $this->remember("mail:domains:{$context}", function () use ($context): array {
            $data = $this->json(['mail:domains', 'production', "--context={$context}", '--json'], timeout: 60);

            if ($data === null || ! isset($data['domains']) || ! is_array($data['domains'])) {
                return [];
            }

            /** @var list<array{id: string, name: string, accounts: int}> $list */
            $list = array_values($data['domains']);

            return $list;
        });

        return $domains ?? [];
    }

    /**
     * List mailboxes / accounts.
     *
     * @return array{accounts: list<array{email: string, name: string, role: string, quota: string, quotaBytes: ?int, used: string, usedBytes: ?int}>, queue: int}
     */
    public function accounts(string $context): array
    {
        /** @var array{accounts: list<array{email: string, name: string, role: string, quota: string, quotaBytes: ?int, used: string, usedBytes: ?int}>, queue: int}|null $res */
        $res = $this->remember("mail:accounts:{$context}", function () use ($context): array {
            $data = $this->json(['mail:accounts', 'production', "--context={$context}", '--json'], timeout: 60);

            if ($data === null || ! isset($data['accounts']) || ! is_array($data['accounts'])) {
                return ['accounts' => [], 'queue' => 0];
            }

            /** @var list<array{email: string, name: string, role: string, quota: string, quotaBytes: ?int, used: string, usedBytes: ?int}> $accs */
            $accs = array_values($data['accounts']);

            return [
                'accounts' => $accs,
                'queue' => (int) ($data['queue'] ?? 0),
            ];
        });

        return $res ?? ['accounts' => [], 'queue' => 0];
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

    /**
     * Invalidate cached data for the context after mutation runs.
     */
    public function forget(string $context): void
    {
        Cache::forget("mail:server:{$context}");
        Cache::forget("mail:domains:{$context}");
        Cache::forget("mail:accounts:{$context}");
    }

    /**
     * @template T of array<mixed>
     *
     * @param  callable(): (T|null)  $resolve
     * @return T|null
     */
    private function remember(string $key, callable $resolve): ?array
    {
        $cached = Cache::get($key);

        if (is_array($cached)) {
            /** @var T $cached */
            return $cached;
        }

        try {
            $value = $resolve();
        } catch (ProcessTimedOutException) {
            return null;
        }

        if ($value !== null) {
            Cache::put($key, $value, self::TTL_SECONDS);
        }

        return $value;
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
