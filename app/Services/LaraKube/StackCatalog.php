<?php

namespace App\Services\LaraKube;

use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Process;

/**
 * The servers this machine created, read from `larakube cloud:stacks --json`:
 * registered stacks plus unfinished setups an interrupted create left behind,
 * plus automatically discovered clusters from ~/.kube/config.
 *
 * @phpstan-type StackItem array{name: string, provider: string, kind: string, region: ?string, ip: ?string, port?: ?int, context: ?string, sshKey?: ?string, bindings?: list<string>, account: ?string, projectId: ?string, status: string, role?: string, isCurrent?: bool}
 */
class StackCatalog
{
    public const CACHE_KEY = 'stack_catalog.everything';

    public const TTL_SECONDS = 30;

    /** @var list<StackItem>|null */
    private ?array $memoized = null;

    public function __construct(
        private ToolLocator $locator,
        private ?KubeconfigDiscovery $discovery = null,
    ) {
        $this->discovery ??= new KubeconfigDiscovery($this->locator);
    }

    /** Forget cached stacks, e.g. after creating, deleting, or updating a server. */
    public function forget(): void
    {
        $this->memoized = null;
        Cache::forget(self::CACHE_KEY);
    }

    /**
     * The servers apps and tools run on. Dev boxes, which are machines to work on, are listed by devBoxes().
     *
     * @return list<array{name: string, provider: string, kind: string, region: ?string, ip: ?string, port?: ?int, context: ?string, sshKey?: ?string, bindings?: list<string>, account: ?string, projectId: ?string, status: string, role?: string, isCurrent?: bool}>|null
     */
    public function all(bool $fresh = false): ?array
    {
        $everything = $this->everything($fresh);

        return $everything === null ? null : array_values(array_filter($everything, fn (array $stack): bool => ($stack['role'] ?? 'deploy') !== 'dev'));
    }

    /**
     * Development machines made with `devbox:create`.
     *
     * @return list<array{name: string, provider: string, kind: string, region: ?string, ip: ?string, port?: ?int, context: ?string, sshKey?: ?string, bindings?: list<string>, account: ?string, projectId: ?string, status: string, role?: string, isCurrent?: bool}>|null
     */
    public function devBoxes(bool $fresh = false): ?array
    {
        $everything = $this->everything($fresh);

        return $everything === null ? null : array_values(array_filter($everything, fn (array $stack): bool => ($stack['role'] ?? 'deploy') === 'dev'));
    }

    /**
     * Every stack and discovered cluster, unfiltered by role — what SyncServersJob mirrors into the servers table.
     *
     * @return list<array{name: string, provider: string, kind: string, region: ?string, ip: ?string, port?: ?int, context: ?string, sshKey?: ?string, bindings?: list<string>, account: ?string, projectId: ?string, status: string, role?: string, isCurrent?: bool}>|null
     */
    public function everything(bool $fresh = false): ?array
    {
        if ($fresh) {
            $this->forget();
        }

        if ($this->memoized !== null) {
            return $this->memoized;
        }

        $cached = Cache::get(self::CACHE_KEY);
        if (is_array($cached) && array_is_list($cached)) {
            /** @var list<StackItem> $cached */
            return $this->memoized = $cached;
        }

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

        $merged = [...$stacks, ...$discovered];
        Cache::put(self::CACHE_KEY, $merged, self::TTL_SECONDS);

        return $this->memoized = $merged;
    }

    /**
     * Return only registered cloud stacks provisioned via LaraKube.
     *
     * @return list<array{name: string, provider: string, kind: string, region: ?string, ip: ?string, port?: ?int, context: ?string, sshKey?: ?string, bindings?: list<string>, account: ?string, projectId: ?string, status: string}>
     */
    public function cloudStacks(): array
    {
        return array_values(array_filter($this->all() ?? [], fn (array $s): bool => $s['kind'] !== 'discovered'));
    }

    /**
     * Return only discovered clusters from ~/.kube/config.
     *
     * @return list<array{name: string, provider: string, kind: string, region: ?string, ip: ?string, port?: ?int, context: ?string, sshKey?: ?string, bindings?: list<string>, account: ?string, projectId: ?string, status: string}>
     */
    public function discoveredClusters(): array
    {
        return array_values(array_filter($this->all() ?? [], fn (array $s): bool => $s['kind'] === 'discovered'));
    }

    /**
     * @return array{name: string, provider: string, kind: string, region: ?string, ip: ?string, port?: ?int, context: ?string, sshKey?: ?string, bindings?: list<string>, account: ?string, projectId: ?string, status: string, role?: string}|null
     */
    public function find(string $name): ?array
    {
        foreach ($this->everything() ?? [] as $stack) {
            if ($stack['name'] === $name) {
                return $stack;
            }
        }

        return null;
    }
}
