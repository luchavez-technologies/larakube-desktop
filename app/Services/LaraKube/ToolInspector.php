<?php

namespace App\Services\LaraKube;

use Illuminate\Process\Exceptions\ProcessTimedOutException;

/**
 * What one installed Cluster Tool instance is made of, read through the
 * LaraKube CLI: its ConfigMaps and Secrets (`tool:resources`, values of
 * Secrets never included), one revealed Secret value (`tool:secret`), and
 * its components' recent logs (`{tool}:logs --json`). See
 * docs/decisions/0024-app-configuration-transparency.md.
 */
class ToolInspector
{
    public function __construct(private ToolLocator $locator) {}

    /** @return array<string, mixed>|null */
    public function resources(string $context, string $tool, string $domain): ?array
    {
        return $this->runJson(['tool:resources', 'production', "--tool={$tool}"], $context, $domain, 30);
    }

    /** @return array<string, mixed>|null */
    public function reveal(string $context, string $tool, string $domain, string $name, string $key): ?array
    {
        return $this->runJson(['tool:secret', 'production', "--tool={$tool}", "--name={$name}", "--key={$key}"], $context, $domain, 30);
    }

    /** @return array<string, mixed>|null */
    public function logs(string $context, string $tool, string $domain, ?string $component, ?string $sinceTime, int $tail): ?array
    {
        $args = ["{$tool}:logs", 'production', "--tail={$tail}"];
        if ($component !== null && $component !== '') {
            $args[] = "--component={$component}";
        }
        $args[] = $sinceTime !== null && $sinceTime !== '' ? "--since-time={$sinceTime}" : '--since=15m';

        return $this->runJson($args, $context, $domain, 45);
    }

    /**
     * A Supabase instance's deployed Edge Functions (`supabase:functions:list --json`).
     *
     * @return array<string, mixed>|null
     */
    public function supabaseFunctions(string $context, string $domain): ?array
    {
        return $this->runJson(['supabase:functions:list', 'production'], $context, $domain, 45);
    }

    /**
     * @param  list<string>  $args
     * @return array<string, mixed>|null
     */
    private function runJson(array $args, string $context, string $domain, int $timeout): ?array
    {
        $cli = $this->locator->find('larakube');
        if ($cli === null) {
            return null;
        }

        $cmd = [$cli, ...$args, "--context={$context}", '--json', '--no-interaction'];
        if ($domain !== '') {
            $cmd[] = "--domain={$domain}";
        }

        try {
            $result = $this->locator->run($cmd, $timeout);
        } catch (ProcessTimedOutException) {
            return null;
        }

        $lines = preg_split('/\R/', trim($result->output())) ?: [];
        $decoded = json_decode((string) end($lines), true);

        return is_array($decoded) ? $decoded : null;
    }
}
