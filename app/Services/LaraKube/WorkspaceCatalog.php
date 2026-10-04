<?php

namespace App\Services\LaraKube;

use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Support\Facades\Process;

/**
 * Workspaces and the options for making one, as `larakube workspace:*` reports them.
 * Sizes and defaults come from the CLI; nothing here knows what a workspace is made of.
 */
class WorkspaceCatalog
{
    public function __construct(private ToolLocator $locator) {}

    /**
     * @return array{sizes: list<array{value: string, label: string, memory: string, cpu: string, storage: string}>, defaultSize: string, defaultBranch: string}|null
     */
    public function options(): ?array
    {
        $decoded = $this->call(['workspace:options', '--json']);

        return is_array($decoded['sizes'] ?? null) ? [
            'sizes' => array_values($decoded['sizes']),
            'defaultSize' => (string) ($decoded['defaultSize'] ?? ''),
            'defaultBranch' => (string) ($decoded['defaultBranch'] ?? 'main'),
        ] : null;
    }

    /**
     * @param  list<string>  $serverFlags  `--stack=name` or `--context=name`
     * @return list<array{name: string, namespace: string, repo: string, branch: string, size: string, status: string, publicKey: string, password?: ?string}>|null null when the server could not be reached
     */
    public function list(array $serverFlags, bool $reveal = false): ?array
    {
        $decoded = $this->call(['workspace:list', ...$serverFlags, '--json', ...($reveal ? ['--reveal'] : [])]);

        return is_array($decoded['workspaces'] ?? null) && ($decoded['success'] ?? false) === true ? array_values($decoded['workspaces']) : null;
    }

    /**
     * @param  list<string>  $arguments
     * @return array<string, mixed>|null
     */
    private function call(array $arguments): ?array
    {
        $cli = $this->locator->find('larakube');

        if ($cli === null) {
            return null;
        }

        $isolated = $this->locator->isolate([$cli, ...$arguments, '--no-interaction']);

        try {
            $result = Process::env($isolated['environment'])->timeout(45)->run($isolated['command']);
        } catch (ProcessTimedOutException) {
            return null;
        }

        $lines = preg_split('/\R/', trim($result->output())) ?: [];
        $decoded = json_decode((string) end($lines), true);

        return is_array($decoded) ? $decoded : null;
    }
}
