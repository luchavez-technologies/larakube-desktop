<?php

namespace App\Services\LaraKube;

use Illuminate\Process\Exceptions\ProcessTimedOutException;

/**
 * Real-time dotenv drift comparison against cluster secrets/configmaps,
 * as `larakube dotenv <environment> --json` reports it.
 */
class ProjectDotenv
{
    public function __construct(private ToolLocator $locator) {}

    /**
     * @return array{environment: ?string, namespace: ?string, items: list<array<string, mixed>>, summary: array<string, mixed>}|null
     */
    public function get(string $projectPath, string $environment, bool $reveal = false): ?array
    {
        $cli = $this->locator->find('larakube');

        if ($cli === null || ! is_dir($projectPath)) {
            return null;
        }

        try {
            $cmd = [$cli, 'dotenv', $environment, '--json', '--no-interaction'];
            if ($reveal) {
                $cmd[] = '--reveal';
            }
            $result = $this->locator->run($cmd, 30, cwd: $projectPath);
        } catch (ProcessTimedOutException) {
            return null;
        }

        $lines = preg_split('/\R/', trim($result->output())) ?: [];
        $decoded = json_decode((string) end($lines), true);

        if (! is_array($decoded) || ($decoded['success'] ?? false) !== true || ! is_array($decoded['items'] ?? null)) {
            return null;
        }

        return [
            'environment' => $decoded['environment'] ?? $environment,
            'namespace' => $decoded['namespace'] ?? null,
            'items' => array_values(array_filter($decoded['items'], is_array(...))),
            'summary' => is_array($decoded['summary'] ?? null) ? $decoded['summary'] : [],
        ];
    }
}
