<?php

namespace App\Services\LaraKube;

use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Support\Facades\Cache;

/**
 * Whether this machine's local setup works, as `larakube doctor --json`
 * reports it: container runtime, local cluster, Traefik, and the Local CA and
 * DNS chain that `*.test` depends on. Each issue comes with its fix. Cached
 * briefly: the checks shell out to several tools.
 */
class LocalHealth
{
    private const CACHE_KEY = 'local-health';

    public function __construct(private ToolLocator $locator) {}

    /**
     * @return array{checked: bool, issues: list<array{title: string, description: string, fix: string|null}>}
     */
    public function report(): array
    {
        /** @var array{checked: bool, issues: list<array{title: string, description: string, fix: string|null}>} */
        return Cache::remember(self::CACHE_KEY, 60, function (): array {
            $cli = $this->locator->find('larakube');

            if ($cli === null) {
                return ['checked' => false, 'issues' => []];
            }

            try {
                $result = $this->locator->run([$cli, 'doctor', '--json', '--no-interaction'], 45);
            } catch (ProcessTimedOutException) {
                return ['checked' => false, 'issues' => []];
            }

            $lines = preg_split('/\R/', trim($result->output())) ?: [];
            $report = json_decode((string) end($lines), true);

            if (! is_array($report) || ($report['success'] ?? false) !== true || ! is_array($report['issues'] ?? null)) {
                return ['checked' => false, 'issues' => []];
            }

            $issues = [];
            foreach ($report['issues'] as $issue) {
                if (is_array($issue) && is_string($issue['title'] ?? null)) {
                    $issues[] = [
                        'title' => $issue['title'],
                        'description' => is_string($issue['description'] ?? null) ? $issue['description'] : '',
                        'fix' => is_string($issue['fix'] ?? null) ? $issue['fix'] : null,
                    ];
                }
            }

            return ['checked' => true, 'issues' => $issues];
        });
    }

    public function forget(): void
    {
        Cache::forget(self::CACHE_KEY);
    }
}
