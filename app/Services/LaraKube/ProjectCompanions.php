<?php

namespace App\Services\LaraKube;

use App\Services\Runtime\WslDistro;
use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Support\Facades\Cache;

/**
 * This project's installed companion connection details, as
 * `larakube companion:list --json` reports them — the same host/user/
 * password/database `up`'s terminal output shows, for a caller that only has
 * the Local Dev Companions card to look at.
 */
class ProjectCompanions
{
    public function __construct(private ToolLocator $locator) {}

    /**
     * @return list<array<string, mixed>>
     */
    public function credentials(string $projectPath): array
    {
        $cli = $this->locator->find('larakube');
        $hostPath = $this->locator->isWindows() ? WslDistro::toWindows($projectPath) : $projectPath;

        if ($cli === null || ! is_dir($hostPath)) {
            return [];
        }

        try {
            $result = $this->locator->run([$cli, 'companion:list', '--json', '--no-interaction'], 15, cwd: $projectPath);
        } catch (ProcessTimedOutException) {
            return [];
        }

        $lines = preg_split('/\R/', trim($result->output())) ?: [];
        $decoded = json_decode((string) end($lines), true);

        if (! is_array($decoded) || ($decoded['success'] ?? false) !== true || ! is_array($decoded['companions'] ?? null)) {
            return [];
        }

        return array_values(array_filter($decoded['companions'], is_array(...)));
    }

    /**
     * The image each companion installs with the current CLI build, by slug.
     * Pins only change with the CLI itself, so this is cached against the CLI
     * binary's own modification time and asks again after an update.
     *
     * @return array<string, string>
     */
    public function pinnedImages(): array
    {
        $cli = $this->locator->find('larakube');

        if ($cli === null) {
            return [];
        }

        $hostCli = $this->locator->isWindows() ? WslDistro::toWindows($cli) : $cli;
        $version = is_file($hostCli) ? (string) filemtime($hostCli) : 'unknown';

        return Cache::remember("companion-pins:{$version}", now()->addDay(), function () use ($cli): array {
            try {
                $result = $this->locator->run([$cli, 'companion:list', '--json', '--no-interaction'], 15);
            } catch (ProcessTimedOutException) {
                return [];
            }

            $lines = preg_split('/\R/', trim($result->output())) ?: [];
            $catalog = json_decode((string) end($lines), true)['catalog'] ?? [];
            $pins = [];

            foreach (is_array($catalog) ? $catalog : [] as $entry) {
                if (is_string($entry['slug'] ?? null) && is_string($entry['image'] ?? null)) {
                    $pins[$entry['slug']] = $entry['image'];
                }
            }

            return $pins;
        });
    }
}
