<?php

namespace App\Services\LaraKube;

use Illuminate\Process\Exceptions\ProcessTimedOutException;

/**
 * A Cluster Tool instance's custom environment variables — the overlay
 * `larakube tool:env`/`tool:env:set` manage, never the keys a tool's own
 * `:init`/`:wire` logic owns. Same shape as ProjectDotenv, minus any
 * local/cluster diff: a Cluster App has no local .env file, so there's
 * nothing to compare against.
 */
class ClusterToolEnv
{
    public function __construct(private ToolLocator $locator) {}

    /**
     * @return array{exists: bool, instance: ?string, namespace: ?string, vaulted: bool, items: list<array<string, mixed>>}|null
     */
    public function get(string $context, string $tool, string $domain, bool $reveal = false): ?array
    {
        $cli = $this->locator->find('larakube');
        if ($cli === null) {
            return null;
        }

        $cmd = [$cli, 'tool:env', 'production', "--tool={$tool}", "--context={$context}", '--json', '--no-interaction'];
        if ($domain !== '') {
            $cmd[] = "--domain={$domain}";
        }
        if ($reveal) {
            $cmd[] = '--reveal';
        }

        try {
            $result = $this->locator->run($cmd, 30);
        } catch (ProcessTimedOutException) {
            return null;
        }

        $decoded = $this->lastJsonLine($result->output());
        if (! is_array($decoded) || ($decoded['success'] ?? false) !== true) {
            return null;
        }

        return [
            'exists' => (bool) ($decoded['exists'] ?? false),
            'instance' => $decoded['instance'] ?? null,
            'namespace' => $decoded['namespace'] ?? null,
            'vaulted' => (bool) ($decoded['vaulted'] ?? false),
            'items' => array_values(array_filter((array) ($decoded['items'] ?? []), is_array(...))),
        ];
    }

    /**
     * @param  array<string, string>  $set
     * @param  array<string, string>  $setSecret
     * @param  list<string>  $unset
     * @return array{success: bool, error?: string, vaulted?: bool, restarted?: bool}
     */
    public function update(string $context, string $tool, string $domain, array $set, array $setSecret, array $unset, bool $restart = false): array
    {
        $cli = $this->locator->find('larakube');
        if ($cli === null) {
            return ['success' => false, 'error' => 'larakube CLI not found.'];
        }

        $cmd = [$cli, 'tool:env:set', 'production', "--tool={$tool}", "--context={$context}", '--json', '--no-interaction'];
        if ($domain !== '') {
            $cmd[] = "--domain={$domain}";
        }
        foreach ($set as $key => $value) {
            $cmd[] = "--set={$key}={$value}";
        }
        foreach ($setSecret as $key => $value) {
            $cmd[] = "--set-secret={$key}={$value}";
        }
        foreach ($unset as $key) {
            $cmd[] = "--unset={$key}";
        }
        if ($restart) {
            $cmd[] = '--restart';
        }

        try {
            $result = $this->locator->run($cmd, 60);
        } catch (ProcessTimedOutException) {
            return ['success' => false, 'error' => 'Timed out applying the change.'];
        }

        $decoded = $this->lastJsonLine($result->output());
        if (! is_array($decoded)) {
            return ['success' => false, 'error' => trim($result->errorOutput()) ?: 'Unknown error.'];
        }

        return $decoded['success'] ?? false
            ? ['success' => true, 'vaulted' => (bool) ($decoded['vaulted'] ?? false), 'restarted' => (bool) ($decoded['restarted'] ?? false)]
            : ['success' => false, 'error' => (string) ($decoded['error'] ?? 'Unknown error.')];
    }

    /** @return array<string, mixed>|null */
    private function lastJsonLine(string $output): ?array
    {
        $lines = preg_split('/\R/', trim($output)) ?: [];
        $decoded = json_decode((string) end($lines), true);

        return is_array($decoded) ? $decoded : null;
    }
}
