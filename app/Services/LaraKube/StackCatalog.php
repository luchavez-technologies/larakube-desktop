<?php

namespace App\Services\LaraKube;

use Illuminate\Support\Facades\Process;

/**
 * The servers this machine created, read from `larakube cloud:stacks --json`:
 * registered stacks plus unfinished setups an interrupted create left behind.
 */
class StackCatalog
{
    public function __construct(private ToolLocator $locator) {}

    /**
     * @return list<array{name: string, provider: string, kind: string, region: ?string, ip: ?string, context: ?string, account: ?string, projectId: ?string, status: string}>|null
     */
    public function all(): ?array
    {
        $cli = $this->locator->find('larakube');

        if ($cli === null) {
            return null;
        }

        $isolated = $this->locator->isolate([$cli, 'cloud:stacks', '--json', '--no-interaction']);
        $result = Process::env($isolated['environment'])->timeout(30)->run($isolated['command']);

        $lines = preg_split('/\R/', trim($result->output())) ?: [];
        $decoded = json_decode((string) end($lines), true);

        if (! $result->successful() || ! is_array($decoded) || ! is_array($decoded['stacks'] ?? null)) {
            return null;
        }

        return array_values($decoded['stacks']);
    }

    /**
     * @return array{name: string, provider: string, kind: string, region: ?string, ip: ?string, context: ?string, account: ?string, projectId: ?string, status: string}|null
     */
    public function find(string $name): ?array
    {
        foreach ($this->all() ?? [] as $stack) {
            if ($stack['name'] === $name) {
                return $stack;
            }
        }

        return null;
    }
}
