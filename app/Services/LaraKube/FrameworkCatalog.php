<?php

namespace App\Services\LaraKube;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Process;

/**
 * The frameworks a new app can start from and the questions each one asks,
 * read from `larakube new:frameworks --json`, so the New project form offers
 * exactly what the installed LaraKube CLI supports and nothing is kept here.
 */
class FrameworkCatalog
{
    public function __construct(private ToolLocator $locator) {}

    /**
     * @return array{categories: list<array{id: string, label: string}>, frameworks: list<array<string, mixed>>}|null null when the CLI is missing or too old
     */
    public function catalog(): ?array
    {
        $cli = $this->locator->find('larakube');

        if ($cli === null) {
            return null;
        }

        $key = 'larakube.new-frameworks.'.md5($cli.'|'.(string) @filemtime($cli));
        $cached = Cache::get($key);

        if (is_array($cached)) {
            return $this->normalize($cached);
        }

        $isolated = $this->locator->isolate([$cli, 'new:frameworks', '--json', '--no-interaction']);
        $result = Process::env($isolated['environment'])->timeout(30)->run($isolated['command']);

        $lines = preg_split('/\R/', trim($result->output())) ?: [];
        $decoded = json_decode((string) end($lines), true);

        if (! $result->successful() || ! is_array($decoded) || ! is_array($decoded['frameworks'] ?? null)) {
            return null;
        }

        Cache::forever($key, $decoded);

        return $this->normalize($decoded);
    }

    /**
     * The `larakube` arguments that create an app: the framework's command,
     * the app name, its fixed arguments, then the answers as flags.
     *
     * @param  array<string, mixed>  $framework
     * @param  list<string>  $flags
     * @return list<string>
     */
    public function scaffoldArguments(array $framework, string $name, array $flags): array
    {
        $args = is_array($framework['args'] ?? null) ? array_values(array_filter($framework['args'], is_string(...))) : [];

        return [(string) $framework['command'], $name, ...$args, ...$flags];
    }

    /**
     * Keeps only well-formed entries from the CLI's JSON.
     *
     * @param  array<mixed>  $raw
     * @return array{categories: list<array{id: string, label: string}>, frameworks: list<array<string, mixed>>}
     */
    private function normalize(array $raw): array
    {
        $categories = [];

        foreach (is_array($raw['categories'] ?? null) ? $raw['categories'] : [] as $category) {
            if (is_array($category) && is_string($category['id'] ?? null) && is_string($category['label'] ?? null)) {
                $categories[] = ['id' => $category['id'], 'label' => $category['label']];
            }
        }

        $frameworks = [];

        foreach (is_array($raw['frameworks'] ?? null) ? $raw['frameworks'] : [] as $framework) {
            if (is_array($framework) && is_string($framework['slug'] ?? null) && is_string($framework['label'] ?? null) && is_string($framework['command'] ?? null) && is_array($framework['fields'] ?? null)) {
                $frameworks[] = $framework;
            }
        }

        return ['categories' => $categories, 'frameworks' => $frameworks];
    }

    /**
     * @return array<string, mixed>|null
     */
    public function framework(string $slug): ?array
    {
        foreach ($this->catalog()['frameworks'] ?? [] as $framework) {
            if ($framework['slug'] === $slug) {
                return $framework;
            }
        }

        return null;
    }

    /**
     * What the form lists: everything the CLI does not hide.
     *
     * @return list<array<string, mixed>>
     */
    public function visible(): array
    {
        return array_values(array_filter($this->catalog()['frameworks'] ?? [], fn (array $framework): bool => empty($framework['hidden'])));
    }
}
