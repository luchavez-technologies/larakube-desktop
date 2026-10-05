<?php

namespace App\Services\LaraKube;

use Illuminate\Process\Exceptions\ProcessTimedOutException;

/**
 * What a project's database, cache, storage and search are and how its app
 * reaches them, as `larakube services:show --json` reports it for one environment.
 * Nothing here knows what a driver is or where it runs.
 */
class ProjectServices
{
    public function __construct(private ToolLocator $locator) {}

    /**
     * @return array{commons: bool, services: list<array<string, mixed>>}|null null when the CLI is missing or too old
     */
    public function get(string $projectPath, string $environment, bool $reveal = false): ?array
    {
        $cli = $this->locator->find('larakube');

        if ($cli === null || ! is_dir($projectPath)) {
            return null;
        }

        try {
            $result = $this->locator->run([$cli, 'services:show', $environment, '--json', '--no-interaction', ...($reveal ? ['--reveal'] : [])], 30, cwd: $projectPath);
        } catch (ProcessTimedOutException) {
            return null;
        }

        $lines = preg_split('/\R/', trim($result->output())) ?: [];
        $decoded = json_decode((string) end($lines), true);

        if (! $result->successful() || ! is_array($decoded) || ($decoded['success'] ?? false) !== true || ! is_array($decoded['services'] ?? null)) {
            return null;
        }

        return ['commons' => ($decoded['commons'] ?? false) === true, 'services' => array_values(array_filter($decoded['services'], is_array(...)))];
    }
}
