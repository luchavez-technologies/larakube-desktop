<?php

namespace App\Services\LaraKube;

/**
 * Reads a project's LaraKube state from its own files, read-only:
 * .larakube.json (framework, name, hosts) and the gitignored
 * .larakube.local.json (which server an environment is bound to).
 */
class ProjectInspector
{
    public function __construct(private FrameworkCatalog $catalog, private ?GlobalSettings $globalSettings = null) {}

    /**
     * The frameworks `cloud:deploy` can ship, as the CLI says (slug => label).
     * Empty when the CLI is missing or too old to say.
     *
     * @return array<string, string>
     */
    public function deployableFrameworks(): array
    {
        $deployable = [];

        foreach ($this->catalog->catalog()['frameworks'] ?? [] as $framework) {
            if (! empty($framework['deployable'])) {
                $deployable[(string) $framework['slug']] = (string) $framework['label'];
            }
        }

        return $deployable;
    }

    /**
     * @return array{path: string, exists: bool, initialized: bool, name: string, framework: ?string, detectedFramework: ?string, webHost: ?string, serverIp: ?string, serverContext: ?string, deployable: bool, localTld: ?string, globalTld: string, effectiveTld: string, database: ?string, cacheDriver: ?string, objectStorage: ?string, git: array{remote: ?string, platform: string, repoSlug: ?string, hasWorkflow: bool}, environments: array<string, array{name: string, isLocal: bool, webHost: ?string, serverIp: ?string, serverContext: ?string, serverName?: ?string, serverProvider?: ?string, plex: list<string>, managed: list<string>, components: list<string>, replicas: array<string, mixed>, autoscale: array<string, mixed>, resources: array<string, mixed>, ci: array{platform: string, repoSlug: ?string, hasWorkflow: bool, branch: string, registry: ?array<string, mixed>, securityAudit: ?array<string, mixed>}}>}
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

        $git = $this->detectGit($path);

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

                $registry = is_array($envConfig['registry'] ?? null) ? $envConfig['registry'] : null;
                $securityAudit = is_array($envConfig['securityAudit'] ?? null) ? $envConfig['securityAudit'] : null;
                $envBranch = is_string($envConfig['branch'] ?? null) ? $envConfig['branch'] : ($name === 'production' ? 'main' : $name);

                $envFeatures = is_array($envConfig['features'] ?? null)
                    ? $envConfig['features']
                    : (is_array($blueprint['features'] ?? null) ? $blueprint['features'] : []);

                $components = ['web'];
                if (in_array('horizon', $envFeatures, true)) {
                    $components[] = 'horizon';
                }
                if (in_array('queues', $envFeatures, true)) {
                    $components[] = 'queues';
                }
                if (in_array('reverb', $envFeatures, true)) {
                    $components[] = 'reverb';
                }
                if (in_array('ssr', $envFeatures, true)) {
                    $components[] = 'ssr';
                }

                $environments[$name] = [
                    'name' => $name,
                    'isLocal' => $name === 'local',
                    'webHost' => is_string($envHost) && $envHost !== '' ? $envHost : null,
                    'serverIp' => is_string($envIp) && $envIp !== '' ? $envIp : null,
                    'serverContext' => is_string($envContext) && $envContext !== '' ? $envContext : null,
                    'plex' => is_array($envConfig['plex'] ?? null) ? array_values(array_filter($envConfig['plex'], 'is_string')) : [],
                    'managed' => is_array($envConfig['managed'] ?? null) ? array_values(array_filter($envConfig['managed'], 'is_string')) : [],
                    'components' => $components,
                    'replicas' => is_array($envConfig['replicas'] ?? null) ? $envConfig['replicas'] : [],
                    'autoscale' => is_array($envConfig['autoscale'] ?? null) ? $envConfig['autoscale'] : [],
                    'resources' => is_array($envConfig['resources'] ?? null) ? $envConfig['resources'] : [],
                    'ci' => [
                        'platform' => $git['platform'],
                        'repoSlug' => $git['repoSlug'],
                        'hasWorkflow' => $git['hasWorkflow'],
                        'branch' => $envBranch,
                        'registry' => $registry,
                        'securityAudit' => $securityAudit,
                    ],
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
            'deployable' => $framework !== null && array_key_exists($framework, $this->deployableFrameworks()),
            'localTld' => $projectLocalTld,
            'globalTld' => $globalTld,
            'effectiveTld' => $effectiveTld,
            'database' => is_string($blueprint['database'] ?? null) ? $blueprint['database'] : null,
            'cacheDriver' => is_string($blueprint['cacheDriver'] ?? null) ? $blueprint['cacheDriver'] : null,
            'objectStorage' => is_string($blueprint['objectStorage'] ?? null) ? $blueprint['objectStorage'] : null,
            'git' => $git,
            'environments' => $environments,
        ];
    }

    /**
     * @return array{remote: ?string, platform: string, repoSlug: ?string, hasWorkflow: bool}
     */
    public function detectGit(string $path): array
    {
        $remote = null;
        $configFile = "{$path}/.git/config";
        if (is_file($configFile)) {
            $content = (string) file_get_contents($configFile);
            if (preg_match('/\[remote\s+"origin"\][^\[]*?url\s*=\s*(.+)/i', $content, $m)) {
                $remote = trim($m[1]);
            }
        }

        $platform = 'github';
        $repoSlug = null;

        if ($remote !== null && preg_match('#^(?:https?://|git@)([^/:]+)[:/](.+?)(?:\.git)?$#', $remote, $m)) {
            $host = strtolower($m[1]);
            $repoSlug = trim($m[2]);
            $platform = match (true) {
                str_contains($host, 'gitlab') => 'gitlab',
                str_contains($host, 'forgejo') || str_contains($host, 'gitea') || str_contains($host, 'codeberg') => 'forgejo',
                default => 'github',
            };
        }

        $hasWorkflow = file_exists("{$path}/.github/workflows/deploy.yml")
            || file_exists("{$path}/.gitlab-ci.yml")
            || file_exists("{$path}/.forgejo/workflows/deploy.yml")
            || file_exists("{$path}/.gitea/workflows/deploy.yml");

        return [
            'remote' => $remote,
            'platform' => $platform,
            'repoSlug' => $repoSlug,
            'hasWorkflow' => $hasWorkflow,
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
