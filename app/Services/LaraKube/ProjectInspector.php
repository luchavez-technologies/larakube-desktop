<?php

namespace App\Services\LaraKube;

/**
 * Reads a project's LaraKube state from its own files, read-only:
 * .larakube.json (framework, name, hosts) and the gitignored
 * .larakube.local.json (which server an environment is bound to).
 */
class ProjectInspector
{
    /** The frameworks `cloud:deploy` can ship, matching the CLI's AppFramework::isDeployable(). */
    public const DEPLOYABLE = [
        'laravel' => 'Laravel',
        'statamic' => 'Statamic',
        'wordpress' => 'WordPress',
        'nextjs' => 'Next.js',
        'vite' => 'Vite',
        'astro' => 'Astro',
        'docusaurus' => 'Docusaurus',
    ];

    /**
     * @return array{path: string, exists: bool, initialized: bool, name: string, framework: ?string, detectedFramework: ?string, webHost: ?string, serverIp: ?string, deployable: bool}
     */
    public function inspect(string $path, string $environment = 'production'): array
    {
        $blueprint = $this->readJson("{$path}/.larakube.json");
        $local = $this->readJson("{$path}/.larakube.local.json");
        // A blueprint with no framework is Laravel: the LaraKube CLI reads null that way.
        $framework = is_string($blueprint['framework'] ?? null) ? $blueprint['framework'] : ($blueprint !== null ? 'laravel' : null);
        $host = $blueprint['environments'][$environment]['hosts']['web'] ?? null;
        $ip = $local['environments'][$environment]['cloud']['ip'] ?? null;

        return [
            'path' => $path,
            'exists' => is_dir($path),
            'initialized' => $blueprint !== null,
            'name' => is_string($blueprint['name'] ?? null) ? $blueprint['name'] : basename($path),
            'framework' => $framework,
            'detectedFramework' => $blueprint === null ? $this->detect($path) : null,
            'webHost' => is_string($host) && $host !== '' ? $host : null,
            'serverIp' => is_string($ip) && $ip !== '' ? $ip : null,
            'deployable' => $framework !== null && array_key_exists($framework, self::DEPLOYABLE),
        ];
    }

    /**
     * A best guess to preselect in the picker; `larakube init --framework=`
     * is what actually decides.
     */
    public function detect(string $path): ?string
    {
        $composer = $this->readJson("{$path}/composer.json") ?? [];
        $package = $this->readJson("{$path}/package.json") ?? [];
        $requires = array_keys(($composer['require'] ?? []) + ($composer['require-dev'] ?? []));
        $packages = array_keys(($package['dependencies'] ?? []) + ($package['devDependencies'] ?? []));

        return match (true) {
            in_array('statamic/cms', $requires, true) => 'statamic',
            file_exists("{$path}/wp-config.php") || file_exists("{$path}/wp-config-sample.php") || in_array('roots/wordpress', $requires, true) => 'wordpress',
            file_exists("{$path}/artisan") => 'laravel',
            in_array('next', $packages, true) => 'nextjs',
            in_array('@docusaurus/core', $packages, true) => 'docusaurus',
            in_array('astro', $packages, true) => 'astro',
            in_array('vite', $packages, true) => 'vite',
            default => null,
        };
    }

    /**
     * @return array<string, mixed>|null
     */
    private function readJson(string $file): ?array
    {
        if (! is_file($file)) {
            return null;
        }

        $decoded = json_decode((string) file_get_contents($file), true);

        return is_array($decoded) ? $decoded : null;
    }
}
