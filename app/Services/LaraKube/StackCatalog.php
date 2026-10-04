<?php

namespace App\Services\LaraKube;

use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Support\Facades\Process;

/**
 * The servers this machine created, read from `larakube cloud:stacks --json`:
 * registered stacks plus unfinished setups an interrupted create left behind,
 * plus automatically discovered clusters from ~/.kube/config.
 */
class StackCatalog
{
    public function __construct(
        private ToolLocator $locator,
        private ?KubeconfigDiscovery $discovery = null,
    ) {
        $this->discovery ??= new KubeconfigDiscovery($this->locator);
    }

    /**
     * @return list<array{name: string, provider: string, kind: string, region: ?string, ip: ?string, context: ?string, sshKey?: ?string, bindings?: list<string>, account: ?string, projectId: ?string, status: string, isCurrent?: bool}>|null
     */
    public function all(): ?array
    {
        $cli = $this->locator->find('larakube');

        if ($cli === null) {
            return null;
        }

        $isolated = $this->locator->isolate([$cli, 'cloud:stacks', '--json', '--no-interaction']);
        try {
            $result = Process::env($isolated['environment'])->timeout(30)->run($isolated['command']);
        } catch (ProcessTimedOutException) {
            return null;
        }

        $lines = preg_split('/\R/', trim($result->output())) ?: [];
        $decoded = json_decode((string) end($lines), true);

        if (! $result->successful() || ! is_array($decoded) || ! is_array($decoded['stacks'] ?? null)) {
            return null;
        }

        $stacks = array_values($decoded['stacks']);

        // Auto-discover non-stack contexts from local ~/.kube/config
        $registeredContexts = array_values(array_filter(array_column($stacks, 'context')));
        $discovered = $this->discovery->discover($registeredContexts);

        return [...$stacks, ...$discovered];
    }

    /**
     * Return only registered cloud stacks provisioned via LaraKube.
     *
     * @return list<array{name: string, provider: string, kind: string, region: ?string, ip: ?string, context: ?string, sshKey?: ?string, bindings?: list<string>, account: ?string, projectId: ?string, status: string}>
     */
    public function cloudStacks(): array
    {
        return array_values(array_filter($this->all() ?? [], fn (array $s): bool => $s['kind'] !== 'discovered'));
    }

    /**
     * Return only discovered clusters from ~/.kube/config.
     *
     * @return list<array{name: string, provider: string, kind: string, region: ?string, ip: ?string, context: ?string, sshKey?: ?string, bindings?: list<string>, account: ?string, projectId: ?string, status: string}>
     */
    public function discoveredClusters(): array
    {
        return array_values(array_filter($this->all() ?? [], fn (array $s): bool => $s['kind'] === 'discovered'));
    }

    /**
     * @return array{name: string, provider: string, kind: string, region: ?string, ip: ?string, context: ?string, sshKey?: ?string, bindings?: list<string>, account: ?string, projectId: ?string, status: string}|null
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
