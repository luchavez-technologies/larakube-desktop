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

    public function __construct(private ?GlobalSettings $globalSettings = null) {}

    /**
     * @return array{path: string, exists: bool, initialized: bool, name: string, framework: ?string, detectedFramework: ?string, webHost: ?string, serverIp: ?string, serverContext: ?string, deployable: bool, localTld: ?string, globalTld: string, effectiveTld: string, database: ?string, cacheDriver: ?string, objectStorage: ?string, environments: array<string, array{name: string, isLocal: bool, webHost: ?string, serverIp: ?string, serverContext: ?string, serverName?: ?string, plex: list<string>, managed: list<string>}>}
     */
    public function inspect(string $path, string $environment = 'production'): array
    {
        $blueprint = $this->readJson("{$path}/.larakube.json");
        $local = $this->readJson("{$path}/.larakube.local.json");
        // A blueprint with no framework is Laravel: the LaraKube CLI reads null that way.
        $framework = is_string($blueprint['framework'] ?? null) ? $blueprint['framework'] : ($blueprint !== null ? 'laravel' : null);
        $host = $blueprint['environments'][$environment]['hosts']['web'] ?? null;
        $cloud = is_array($local) ? ($local['environments'][$environment]['cloud'] ?? null) : null;
        $ip = is_array($cloud) ? ($cloud['ip'] ?? null) : null;
        $context = is_array($cloud) ? ($cloud['context'] ?? null) : null;
        if ($ip === null && is_string($context) && preg_match('/^larakube-(.+)$/', $context, $m)) {
            $ip = $m[1];
        }

        $environments = [];
        if ($blueprint !== null && is_array($blueprint['environments'] ?? null)) {
            foreach ($blueprint['environments'] as $name => $envConfig) {
                if (! is_string($name)) {
                    continue;
                }
                $envHost = is_array($envConfig) ? ($envConfig['hosts']['web'] ?? null) : null;
                $envCloud = is_array($local) ? ($local['environments'][$name]['cloud'] ?? null) : null;
                $envIp = is_array($envCloud) ? ($envCloud['ip'] ?? null) : null;
                $envContext = is_array($envCloud) ? ($envCloud['context'] ?? null) : null;
                if ($envIp === null && is_string($envContext) && preg_match('/^larakube-(.+)$/', $envContext, $m)) {
                    $envIp = $m[1];
                }
                $environments[$name] = [
                    'name' => $name,
                    'isLocal' => $name === 'local',
                    'webHost' => is_string($envHost) && $envHost !== '' ? $envHost : null,
                    'serverIp' => is_string($envIp) && $envIp !== '' ? $envIp : null,
                    'serverContext' => is_string($envContext) && $envContext !== '' ? $envContext : null,
                    'plex' => is_array($envConfig['plex'] ?? null) ? array_values(array_filter($envConfig['plex'], 'is_string')) : [],
                    'managed' => is_array($envConfig['managed'] ?? null) ? array_values(array_filter($envConfig['managed'], 'is_string')) : [],
                ];
            }
        }

        $projectLocalTld = is_string($blueprint['localTld'] ?? null) ? $blueprint['localTld'] : null;
        $globalTld = $this->globalSettings?->getLocalTld() ?? 'test';
        $effectiveTld = ($projectLocalTld !== null && $projectLocalTld !== '') ? $projectLocalTld : $globalTld;

        return [
            'path' => $path,
            'exists' => is_dir($path),
            'initialized' => $blueprint !== null,
            'name' => is_string($blueprint['name'] ?? null) ? $blueprint['name'] : basename($path),
            'framework' => $framework,
            'detectedFramework' => $blueprint === null ? $this->detect($path) : null,
            'webHost' => is_string($host) && $host !== '' ? $host : null,
            'serverIp' => is_string($ip) && $ip !== '' ? $ip : null,
            'serverContext' => is_string($context) && $context !== '' ? $context : null,
            'deployable' => $framework !== null && array_key_exists($framework, self::DEPLOYABLE),
            'localTld' => $projectLocalTld,
            'globalTld' => $globalTld,
            'effectiveTld' => $effectiveTld,
            'database' => is_string($blueprint['database'] ?? null) ? $blueprint['database'] : null,
            'cacheDriver' => is_string($blueprint['cacheDriver'] ?? null) ? $blueprint['cacheDriver'] : null,
            'objectStorage' => is_string($blueprint['objectStorage'] ?? null) ? $blueprint['objectStorage'] : null,
            'environments' => $environments,
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
