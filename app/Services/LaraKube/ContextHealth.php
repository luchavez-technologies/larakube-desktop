<?php

namespace App\Services\LaraKube;

use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Process\Pool;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Process;

/**
 * Whether each Kubernetes context still answers. A context left behind by a
 * server that was deleted, or a cluster that no longer exists, lists but can
 * never connect; this tells those apart so they can be offered for removal.
 * Asked in parallel and remembered for a minute, so a long list costs one wait.
 */
class ContextHealth
{
    private const TTL_SECONDS = 60;

    public function __construct(private ToolLocator $locator) {}

    /**
     * @param  list<string>  $contexts
     * @return array<string, bool> context => answers
     */
    public function check(array $contexts): array
    {
        $kubectl = $this->locator->find('kubectl');
        $result = [];
        $unknown = [];

        foreach (array_unique($contexts) as $context) {
            $cached = Cache::get("context-health:{$context}");

            if (is_bool($cached)) {
                $result[$context] = $cached;
            } else {
                $unknown[] = $context;
            }
        }

        if ($unknown === []) {
            return $result;
        }

        // Without kubectl nothing can be said, so nothing is called unreachable.
        if ($kubectl === null) {
            return $result + array_fill_keys($unknown, true);
        }

        try {
            $responses = Process::pool(function (Pool $pool) use ($unknown, $kubectl): void {
                foreach ($unknown as $context) {
                    $isolated = $this->locator->isolate([$kubectl, "--context={$context}", 'get', '--raw=/readyz', '--request-timeout=4s']);
                    $pool->as($context)->env($isolated['environment'])->timeout(8)->command($isolated['command']);
                }
            })->start()->wait();
        } catch (ProcessTimedOutException) {
            return $result + array_fill_keys($unknown, true);
        }

        foreach ($unknown as $context) {
            $answers = $responses->collect()->get($context)?->successful() ?? true;
            Cache::put("context-health:{$context}", $answers, self::TTL_SECONDS);
            $result[$context] = $answers;
        }

        return $result;
    }

    public function forget(string $context): void
    {
        Cache::forget("context-health:{$context}");
    }
}
