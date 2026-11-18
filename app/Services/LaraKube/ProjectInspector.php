<?php

namespace App\Services\LaraKube;

use App\Models\Project;
use App\Models\Server;
use App\Services\Runtime\WslDistro;
use App\Services\Wsl;

/**
 * Reads a project's LaraKube state from its own files, read-only:
 * .larakube.json (framework, name, hosts) and the gitignored
 * .larakube.local.json (which server an environment is bound to).
 */
class ProjectInspector
{
    private ?bool $distroAwake = null;

    public function __construct(
        private FrameworkCatalog $catalog,
        private ?GlobalSettings $globalSettings = null,
        private ?ToolLocator $locator = null,
        private ?Wsl $wsl = null,
    ) {
        $this->globalSettings = $globalSettings ?? rescue(fn () => app(GlobalSettings::class), report: false);
        $this->locator = $locator ?? rescue(fn () => app(ToolLocator::class), report: false);
        $this->wsl = $wsl ?? rescue(fn () => app(Wsl::class), report: false);
    }

    private function hostPath(string $path): string
    {
        if ($path === '') {
            return '';
        }

        $locator = $this->locator ?? app(ToolLocator::class);

        return $locator->isWindows() ? WslDistro::toWindows($path) : $path;
    }

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
     * @return array{path: string, exists: bool, initialized: bool, name: string, framework: ?string, detectedFramework: ?string, webHost: ?string, serverIp: ?string, serverContext: ?string, deployable: bool, localTld: ?string, globalTld: string, effectiveTld: string, database: ?string, cacheDriver: ?string, objectStorage: ?string, phpVersion: ?string, serverVariation: ?string, additionalExtensions: list<string>, features: list<string>, git: array{remote: ?string, platform: string, repoSlug: ?string, hasWorkflow: bool, remotes?: list<array{name: string, remote: string, host: string, repoSlug: string, platform: string}>}, environments: array<string, array{name: string, isLocal: bool, webHost: ?string, serverIp: ?string, serverContext: ?string, serverName?: ?string, serverProvider?: ?string, plex: list<string>, managed: list<string>, components: list<string>, features: list<string>, replicas: array<string, mixed>, autoscale: array<string, mixed>, resources: array<string, mixed>, ci: array{platform: string, gitRemote?: ?string, remoteUrl?: ?string, repoSlug: ?string, hasWorkflow: bool, branch: string, registry: ?array<string, mixed>, securityAudit: ?array<string, mixed>, forgejoHost?: ?string, teaLoggedIn?: bool, teaLogin?: ?string, teaLogins?: list<array{name: string, host: string, user: string, default: bool}>}}>}
     */
    public function inspect(string $path, string $environment = 'production', ?bool $allowWslFilesystem = null, ?Project $projectModel = null): array
    {
        if ($this->shouldSkipWslFilesystem($allowWslFilesystem)) {
            return $this->inspectFromDatabaseCache($path, $environment, $projectModel);
        }

        $hostPath = $this->hostPath($path);
        $blueprint = $this->readJson("{$hostPath}/.larakube.json");
        $local = $this->readJson("{$hostPath}/.larakube.local.json");
        $git = $this->detectGit($path);

        $result = $this->inspectBlueprint($blueprint, $local, $environment, $path, $git);

        $this->syncToDatabase($path, $result, $blueprint);

        return $result;
    }

    private function shouldSkipWslFilesystem(?bool $allowWslFilesystem): bool
    {
        $locator = $this->locator ?? app(ToolLocator::class);
        if (! $locator->isWindows()) {
            return false;
        }

        if ($allowWslFilesystem !== null) {
            return ! $allowWslFilesystem;
        }

        if ($this->distroAwake === null) {
            $wsl = $this->wsl ?? rescue(fn () => app(Wsl::class), report: false);
            $this->distroAwake = $wsl !== null ? $wsl->distroIsRunning() : false;
        }

        return ! $this->distroAwake;
    }

    /**
     * Builds a project inspection from cached SQLite columns when LaraKube Linux
     * is asleep on Windows so `\\wsl.localhost\larakube-ubuntu\…` is never touched.
     *
     * @return array{path: string, exists: bool, initialized: bool, name: string, framework: ?string, detectedFramework: ?string, webHost: ?string, serverIp: ?string, serverContext: ?string, deployable: bool, localTld: ?string, globalTld: string, effectiveTld: string, database: ?string, cacheDriver: ?string, objectStorage: ?string, phpVersion: ?string, serverVariation: ?string, additionalExtensions: list<string>, features: list<string>, git: array{remote: ?string, platform: string, repoSlug: ?string, hasWorkflow: bool, remotes?: list<array{name: string, remote: string, host: string, repoSlug: string, platform: string}>}, environments: array<string, array{name: string, isLocal: bool, webHost: ?string, serverIp: ?string, serverContext: ?string, serverName?: ?string, serverProvider?: ?string, plex: list<string>, managed: list<string>, components: list<string>, features: list<string>, replicas: array<string, mixed>, autoscale: array<string, mixed>, resources: array<string, mixed>, ci: array{platform: string, gitRemote?: ?string, remoteUrl?: ?string, repoSlug: ?string, hasWorkflow: bool, branch: string, registry: ?array<string, mixed>, securityAudit: ?array<string, mixed>, forgejoHost?: ?string, teaLoggedIn?: bool, teaLogin?: ?string, teaLogins?: list<array{name: string, host: string, user: string, default: bool}>}}>}
     */
    private function inspectFromDatabaseCache(string $path, string $environment, ?Project $projectModel): array
    {
        $project = $projectModel ?? Project::with('server')->where('path', $path)->first();
        $blueprint = is_array($project?->blueprint_cache) ? $project->blueprint_cache : null;

        $local = null;
        if ($project?->server !== null) {
            $local = [
                'environments' => [
                    $environment => [
                        'cloud' => array_filter([
                            'ip' => $project->server->ip,
                            'context' => $project->server->context,
                        ], fn (?string $v): bool => $v !== null && $v !== ''),
                    ],
                ],
            ];
        }

        $emptyGit = [
            'remote' => null,
            'platform' => 'github',
            'repoSlug' => null,
            'hasWorkflow' => false,
            'remotes' => [],
        ];

        $result = $this->inspectBlueprint($blueprint, $local, $environment, $path, $emptyGit, skipFilesystem: true);

        if ($project !== null) {
            if ($result['name'] === '' || $result['name'] === basename($path)) {
                $result['name'] = $project->name ?: $result['name'];
            }
            if ($result['framework'] === null && $project->framework !== null) {
                $result['framework'] = $project->framework;
                $result['deployable'] = array_key_exists($project->framework, $this->deployableFrameworks());
            }
            if ($result['webHost'] === null && $project->web_host !== null && $project->web_host !== '') {
                $result['webHost'] = $project->web_host;
            }
            if ($project->last_inspected_at !== null || $blueprint !== null || $project->framework !== null) {
                $result['initialized'] = true;
            }
        }

        $result['exists'] = $path !== '';

        return $result;
    }

    /**
     * @param  array<string, mixed>  $result
     * @param  array<string, mixed>|null  $blueprint
     */
    private function syncToDatabase(string $path, array $result, ?array $blueprint): void
    {
        try {
            $project = Project::where('path', $path)->first();
            if ($project) {
                $serverId = null;
                if (! empty($result['serverContext'])) {
                    $serverId = Server::where('context', $result['serverContext'])->value('id');
                }
                if (! $serverId && ! empty($result['serverIp'])) {
                    $serverId = Server::where('ip', $result['serverIp'])->value('id');
                }
                if (! $serverId && ! empty($result['environments']) && is_array($result['environments'])) {
                    foreach ($result['environments'] as $env) {
                        if (! empty($env['serverContext'])) {
                            $serverId = Server::where('context', $env['serverContext'])->value('id');
                            if ($serverId) {
                                break;
                            }
                        }
                        if (! empty($env['serverIp'])) {
                            $serverId = Server::where('ip', $env['serverIp'])->value('id');
                            if ($serverId) {
                                break;
                            }
                        }
                    }
                }

                $project->update([
                    'name' => $result['name'] ?: basename($path),
                    'framework' => $result['framework'],
                    'server_id' => $serverId,
                    'web_host' => $result['webHost'],
                    'blueprint_cache' => $blueprint,
                    'last_inspected_at' => now(),
                ]);
            }
        } catch (\Throwable) {
        }
    }

    /**
     * @param  array<string, mixed>|null  $blueprint
     * @param  array<string, mixed>|null  $local
     * @param  array{remote: ?string, platform: string, repoSlug: ?string, hasWorkflow: bool, remotes?: list<array{name: string, remote: string, host: string, repoSlug: string, platform: string}>}|null  $git
     * @return array{path: string, exists: bool, initialized: bool, name: string, framework: ?string, detectedFramework: ?string, webHost: ?string, serverIp: ?string, serverContext: ?string, deployable: bool, localTld: ?string, globalTld: string, effectiveTld: string, database: ?string, cacheDriver: ?string, objectStorage: ?string, phpVersion: ?string, serverVariation: ?string, additionalExtensions: list<string>, features: list<string>, git: array{remote: ?string, platform: string, repoSlug: ?string, hasWorkflow: bool, remotes?: list<array{name: string, remote: string, host: string, repoSlug: string, platform: string}>}, environments: array<string, array{name: string, isLocal: bool, webHost: ?string, serverIp: ?string, serverContext: ?string, serverName?: ?string, serverProvider?: ?string, plex: list<string>, managed: list<string>, components: list<string>, features: list<string>, replicas: array<string, mixed>, autoscale: array<string, mixed>, resources: array<string, mixed>, ci: array{platform: string, gitRemote?: ?string, remoteUrl?: ?string, repoSlug: ?string, hasWorkflow: bool, branch: string, registry: ?array<string, mixed>, securityAudit: ?array<string, mixed>}}>}
     */
    public function inspectBlueprint(?array $blueprint, ?array $local = null, string $environment = 'production', string $path = '', ?array $git = null, bool $skipFilesystem = false): array
    {
        $git ??= ['remote' => null, 'platform' => 'github', 'repoSlug' => null, 'hasWorkflow' => false, 'remotes' => []];

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

                $remotes = is_array($git['remotes'] ?? null) ? $git['remotes'] : [];
                $savedRemote = is_array($envConfig) && is_string($envConfig['gitRemote'] ?? null) && $envConfig['gitRemote'] !== ''
                    ? $envConfig['gitRemote']
                    : null;
                $savedPlatform = is_array($envConfig) && is_string($envConfig['ciPlatform'] ?? null) && in_array($envConfig['ciPlatform'], ['github', 'forgejo', 'gitlab'], true)
                    ? $envConfig['ciPlatform']
                    : null;

                $matchedRemote = null;
                if ($savedRemote !== null) {
                    foreach ($remotes as $candidate) {
                        if ($candidate['name'] === $savedRemote) {
                            $matchedRemote = $candidate;
                            break;
                        }
                    }
                }
                if ($matchedRemote === null && is_array($registry) && is_string($registry['host'] ?? null) && $registry['host'] !== '') {
                    $regHost = strtolower($registry['host']);
                    foreach ($remotes as $candidate) {
                        if ($candidate['host'] === $regHost) {
                            $matchedRemote = $candidate;
                            break;
                        }
                    }
                }
                if ($matchedRemote === null) {
                    foreach ($remotes as $candidate) {
                        if ($candidate['name'] === 'origin') {
                            $matchedRemote = $candidate;
                            break;
                        }
                    }
                    $matchedRemote ??= $remotes[0] ?? null;
                }

                $registryProvider = is_array($registry) && is_string($registry['provider'] ?? null)
                    ? strtolower($registry['provider'])
                    : null;
                $workflowContents = '';
                $workflowPlatform = null;
                if ($path !== '' && ! $skipFilesystem) {
                    foreach ([
                        "{$this->hostPath($path)}/.github/workflows/larakube-deploy-{$name}.yml",
                        "{$this->hostPath($path)}/.forgejo/workflows/larakube-deploy-{$name}.yml",
                        "{$this->hostPath($path)}/.gitea/workflows/larakube-deploy-{$name}.yml",
                    ] as $workflowPath) {
                        if (is_file($workflowPath)) {
                            $workflowContents = (string) file_get_contents($workflowPath);
                            if (preg_match('/^\s*REGISTRY_PROVIDER:\s*forgejo\b/m', $workflowContents) === 1) {
                                $workflowPlatform = 'forgejo';
                            }
                            break;
                        }
                    }
                }

                $resolvedPlatform = $savedPlatform
                    ?? (in_array($matchedRemote['platform'] ?? null, ['forgejo', 'gitlab'], true) ? $matchedRemote['platform'] : null)
                    ?? (in_array($registryProvider, ['forgejo', 'gitlab'], true) ? $registryProvider : null)
                    ?? $workflowPlatform
                    ?? ($matchedRemote['platform'] ?? $git['platform']);

                $forgejoHost = $resolvedPlatform === 'forgejo'
                    ? $this->resolveForgejoHost($registry, $matchedRemote, $workflowContents)
                    : null;
                $allTeaLogins = $resolvedPlatform === 'forgejo' ? $this->teaLogins() : [];
                $savedTeaLogin = is_string($envConfig['teaLogin'] ?? null) && trim($envConfig['teaLogin']) !== ''
                    ? trim($envConfig['teaLogin'])
                    : null;
                $hostTeaLogins = $forgejoHost !== null
                    ? $this->matchingTeaLogins($forgejoHost, $allTeaLogins)
                    : [];
                $resolvedTeaLogin = $forgejoHost !== null
                    ? $this->resolveTeaLoginName($forgejoHost, $savedTeaLogin, $allTeaLogins)
                    : null;
                $teaLoggedIn = $resolvedTeaLogin !== null;

                $resolvedRepoSlug = ($matchedRemote['repoSlug'] ?? '') !== ''
                    ? $matchedRemote['repoSlug']
                    : (is_array($registry) && is_string($registry['image'] ?? null) && $registry['image'] !== ''
                        ? $registry['image']
                        : $git['repoSlug']);

                $environments[$name] = [
                    'name' => $name,
                    'isLocal' => $name === 'local',
                    'webHost' => is_string($envHost) && $envHost !== '' ? $envHost : null,
                    'serverIp' => is_string($envIp) && $envIp !== '' ? $envIp : null,
                    'serverContext' => is_string($envContext) && $envContext !== '' ? $envContext : null,
                    'plex' => is_array($envConfig['plex'] ?? null) ? array_values(array_filter($envConfig['plex'], 'is_string')) : [],
                    'managed' => is_array($envConfig['managed'] ?? null) ? array_values(array_filter($envConfig['managed'], 'is_string')) : [],
                    'components' => $components,
                    'features' => array_values(array_filter($envFeatures, 'is_string')),
                    'replicas' => is_array($envConfig['replicas'] ?? null) ? $envConfig['replicas'] : [],
                    'autoscale' => is_array($envConfig['autoscale'] ?? null) ? $envConfig['autoscale'] : [],
                    'resources' => is_array($envConfig['resources'] ?? null) ? $envConfig['resources'] : [],
                    'ci' => [
                        'platform' => $resolvedPlatform,
                        'gitRemote' => $matchedRemote['name'] ?? $savedRemote ?? 'origin',
                        'remoteUrl' => $matchedRemote['remote'] ?? $git['remote'],
                        'repoSlug' => $resolvedRepoSlug,
                        'hasWorkflow' => $git['hasWorkflow'],
                        'branch' => $envBranch,
                        'registry' => $registry,
                        'securityAudit' => $securityAudit,
                        'forgejoHost' => $forgejoHost,
                        'teaLoggedIn' => $teaLoggedIn,
                        'teaLogin' => $resolvedTeaLogin,
                        'teaLogins' => $hostTeaLogins,
                    ],
                ];
            }
        }

        $projectName = is_string($blueprint['name'] ?? null)
            ? $blueprint['name']
            : ($path !== '' ? basename($path) : 'app');

        $projectLocalTld = is_string($blueprint['localTld'] ?? null) ? $blueprint['localTld'] : null;
        $globalTld = $this->globalSettings?->getLocalTld() ?? 'test';
        $effectiveTld = ($projectLocalTld !== null && $projectLocalTld !== '') ? $projectLocalTld : $globalTld;

        if (! isset($environments['local'])) {
            $environments['local'] = [
                'name' => 'local',
                'isLocal' => true,
                'webHost' => "{$projectName}.{$effectiveTld}",
                'serverIp' => null,
                'serverContext' => null,
                'plex' => [],
                'managed' => [],
                'components' => ['web'],
                'features' => is_array($blueprint['features'] ?? null) ? array_values(array_filter($blueprint['features'], 'is_string')) : [],
                'replicas' => [],
                'autoscale' => [],
                'resources' => [],
                'ci' => [
                    'platform' => $git['platform'],
                    'repoSlug' => $git['repoSlug'],
                    'hasWorkflow' => $git['hasWorkflow'],
                    'branch' => 'main',
                    'registry' => null,
                    'securityAudit' => null,
                    'forgejoHost' => null,
                    'teaLoggedIn' => false,
                ],
            ];
        }

        $hostPath = $this->hostPath($path);

        return [
            'path' => $path,
            'exists' => $skipFilesystem ? ($path !== '') : ($path !== '' ? is_dir($hostPath) : true),
            'initialized' => $blueprint !== null,
            'name' => $projectName,
            'framework' => $framework,
            'detectedFramework' => (! $skipFilesystem && $blueprint === null && $path !== '' && is_dir($hostPath)) ? $this->detect($path) : null,
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
            'phpVersion' => is_string($blueprint['phpVersion'] ?? null) ? $blueprint['phpVersion'] : ($framework === 'laravel' || $framework === 'wordpress' || $framework === 'statamic' ? '8.5' : null),
            'serverVariation' => is_string($blueprint['serverVariation'] ?? null) ? $blueprint['serverVariation'] : ($framework === 'laravel' ? 'fpm-nginx' : null),
            'additionalExtensions' => is_array($blueprint['additionalExtensions'] ?? null)
                ? array_values(array_filter($blueprint['additionalExtensions'], 'is_string'))
                : [],
            'features' => is_array($blueprint['features'] ?? null)
                ? array_values(array_filter($blueprint['features'], 'is_string'))
                : [],
            'git' => $git,
            'environments' => $environments,
        ];
    }

    /**
     * @return array{remote: ?string, platform: string, repoSlug: ?string, hasWorkflow: bool, remotes: list<array{name: string, remote: string, host: string, repoSlug: string, platform: string}>}
     */
    public function detectGit(string $path): array
    {
        $hostPath = $this->hostPath($path);
        $remotes = [];
        $allTeaLogins = $this->teaLogins();
        $configFile = "{$hostPath}/.git/config";
        if (is_file($configFile)) {
            $content = (string) file_get_contents($configFile);
            if (preg_match_all('/\[remote\s+"([^"]+)"\]([^\[]*)/i', $content, $matches, PREG_SET_ORDER)) {
                foreach ($matches as $match) {
                    $remoteName = trim($match[1]);
                    $section = $match[2];
                    if (! preg_match('/^\s*url\s*=\s*(.+)$/mi', $section, $urlMatch)) {
                        continue;
                    }

                    $rawUrl = trim($urlMatch[1]);
                    $parsed = $this->parseGitRemoteUrl($rawUrl, $allTeaLogins);
                    $remotes[] = [
                        'name' => $remoteName,
                        'remote' => $rawUrl,
                        'host' => $parsed['host'] ?? '',
                        'repoSlug' => $parsed['repoSlug'] ?? '',
                        'platform' => $parsed['platform'] ?? 'github',
                    ];
                }
            }
        }

        $primary = null;
        foreach ($remotes as $candidate) {
            if ($candidate['name'] === 'origin') {
                $primary = $candidate;
                break;
            }
        }
        $primary ??= $remotes[0] ?? null;

        $remote = $primary['remote'] ?? null;
        $platform = $primary['platform'] ?? 'github';
        $repoSlug = ($primary['repoSlug'] ?? '') !== '' ? $primary['repoSlug'] : null;

        // The CLI's own generator (ConfiguresCloudEnvironment::configureGha/
        // configureForgejo) names each environment's workflow
        // larakube-deploy-{environment}.yml, never a literal deploy.yml — the
        // exact glob cloud:configure's own detector (InteractsWithPipelines)
        // uses. A hardcoded single filename here always missed every real
        // workflow the CLI has ever generated, showing "not configured" for
        // projects that were deployed and working.
        $hasWorkflow = (glob("{$hostPath}/.github/workflows/larakube-deploy-*.yml") ?: []) !== []
            || file_exists("{$hostPath}/.gitlab-ci.yml")
            || (glob("{$hostPath}/.forgejo/workflows/larakube-deploy-*.yml") ?: []) !== []
            || (glob("{$hostPath}/.gitea/workflows/larakube-deploy-*.yml") ?: []) !== [];

        return [
            'remote' => $remote,
            'platform' => $platform,
            'repoSlug' => $repoSlug,
            'hasWorkflow' => $hasWorkflow,
            'remotes' => $remotes,
        ];
    }

    /**
     * @param  list<array{name: string, host: string, user: string, default: bool}>  $teaLogins
     * @return array{host: string, repoSlug: string, platform: ?string}|null
     */
    private function parseGitRemoteUrl(string $remote, array $teaLogins = []): ?array
    {
        $remote = trim($remote);

        if (preg_match('#^[a-z][a-z0-9+.-]*://(?:[^@/]+@)?([^/:]+)(?::\d+)?/(.+?)(?:\.git)?/?$#i', $remote, $m)
            || preg_match('#^(?:[^@]+@)?([^:/]+):(.+?)(?:\.git)?/?$#', $remote, $m)) {
            $host = strtolower(trim($m[1]));
            $repoSlug = ltrim(trim($m[2]), '/');
            $platform = match (true) {
                str_contains($host, 'gitlab') => 'gitlab',
                str_contains($host, 'forgejo')
                    || str_contains($host, 'gitea')
                    || str_contains($host, 'codeberg')
                    || str_starts_with($host, 'git.')
                    || str_contains($host, '.git.') => 'forgejo',
                str_contains($host, 'github') => 'github',
                $teaLogins !== [] && $this->matchingTeaLogins($host, $teaLogins) !== [] => 'forgejo',
                default => null,
            };

            return [
                'host' => $host,
                'repoSlug' => $repoSlug,
                'platform' => $platform,
            ];
        }

        return null;
    }

    /**
     * A best guess to preselect in the picker; `larakube init --framework=`
     * is what actually decides.
     */
    public function detect(string $path): ?string
    {
        $hostPath = $this->hostPath($path);
        $composer = $this->readJson("{$hostPath}/composer.json") ?? [];
        $package = $this->readJson("{$hostPath}/package.json") ?? [];
        $requires = array_keys(($composer['require'] ?? []) + ($composer['require-dev'] ?? []));
        $packages = array_keys(($package['dependencies'] ?? []) + ($package['devDependencies'] ?? []));

        return match (true) {
            in_array('statamic/cms', $requires, true) => 'statamic',
            file_exists("{$hostPath}/wp-config.php") || file_exists("{$hostPath}/wp-config-sample.php") || in_array('roots/wordpress', $requires, true) => 'wordpress',
            file_exists("{$hostPath}/artisan") => 'laravel',
            in_array('next', $packages, true) => 'nextjs',
            in_array('@docusaurus/core', $packages, true) => 'docusaurus',
            in_array('astro', $packages, true) => 'astro',
            in_array('vite', $packages, true) => 'vite',
            default => null,
        };
    }

    /**
     * @param  array<string, mixed>|null  $registry
     * @param  array{name: string, remote: string, host: string, repoSlug: string, platform: string}|null  $matchedRemote
     */
    private function resolveForgejoHost(?array $registry, ?array $matchedRemote, string $workflowContents): ?string
    {
        if (is_array($registry) && is_string($registry['host'] ?? null) && trim($registry['host']) !== '') {
            return strtolower(trim($registry['host']));
        }

        $remoteHost = $matchedRemote['host'] ?? '';
        if ($remoteHost !== '' && str_contains($remoteHost, '.')) {
            return strtolower($remoteHost);
        }

        if ($workflowContents !== '' && preg_match('/^\s*REGISTRY_HOST:\s*[\'"]?([^\'"\s#]+)/m', $workflowContents, $match)) {
            $host = strtolower(trim($match[1]));
            if ($host !== '') {
                return $host;
            }
        }

        return null;
    }

    /**
     * Reads all authenticated `tea` CLI logins from native `config.yml` files.
     *
     * @return list<array{name: string, host: string, user: string, default: bool}>
     */
    private function teaLogins(): array
    {
        $home = $this->hostPath(ToolLocator::home());
        if ($home === '') {
            return [];
        }

        $xdgConfig = trim((string) getenv('XDG_CONFIG_HOME'));
        $candidates = array_values(array_unique(array_filter([
            "{$home}/Library/Application Support/tea/config.yml",
            $xdgConfig !== '' ? rtrim($xdgConfig, '/').'/tea/config.yml' : null,
            "{$home}/.config/tea/config.yml",
        ])));

        $all = [];
        $seenNames = [];
        foreach ($candidates as $configPath) {
            if (! is_file($configPath)) {
                continue;
            }

            foreach ($this->parseTeaConfigLogins((string) file_get_contents($configPath)) as $login) {
                $key = strtolower($login['name']);
                if (! isset($seenNames[$key])) {
                    $seenNames[$key] = true;
                    $all[] = $login;
                }
            }
        }

        return $all;
    }

    /**
     * @param  list<array{name: string, host: string, user: string, default: bool}>  $allLogins
     * @return list<array{name: string, host: string, user: string, default: bool}>
     */
    private function matchingTeaLogins(string $host, array $allLogins): array
    {
        $host = strtolower(trim($host));
        if ($host === '') {
            return [];
        }

        $matched = [];
        foreach ($allLogins as $login) {
            $nameLower = strtolower($login['name']);
            $urlHost = $login['host'];
            $hostMatch = $nameLower === $host
                || $urlHost === $host
                || ($urlHost !== '' && (str_starts_with($urlHost, $host.':') || str_starts_with($host, $urlHost.':')));

            if ($hostMatch) {
                $matched[] = $login;
            }
        }

        return $matched;
    }

    /**
     * @param  list<array{name: string, host: string, user: string, default: bool}>  $allLogins
     */
    private function resolveTeaLoginName(string $host, ?string $preferredLogin, array $allLogins): ?string
    {
        $matches = $this->matchingTeaLogins($host, $allLogins);
        if ($matches === []) {
            return null;
        }

        if ($preferredLogin !== null && $preferredLogin !== '') {
            foreach ($matches as $match) {
                if (strcasecmp($match['name'], $preferredLogin) === 0) {
                    return $match['name'];
                }
            }
        }

        $hostLower = strtolower(trim($host));
        foreach ($matches as $match) {
            if (strtolower($match['name']) === $hostLower) {
                return $match['name'];
            }
        }

        foreach ($matches as $match) {
            if ($match['default']) {
                return $match['name'];
            }
        }

        return $matches[0]['name'];
    }

    /**
     * @return list<array{name: string, host: string, user: string, default: bool}>
     */
    private function parseTeaConfigLogins(string $content): array
    {
        $lines = preg_split('/\R/', $content) ?: [];
        $inLogins = false;
        $entries = [];
        $current = null;

        foreach ($lines as $line) {
            if (! $inLogins) {
                if (preg_match('/^logins:\s*$/i', $line)) {
                    $inLogins = true;
                }

                continue;
            }

            // A non-indented non-list line begins the next top-level YAML key.
            if ($line !== '' && ! str_starts_with($line, ' ') && ! str_starts_with($line, "\t") && ! str_starts_with($line, '-') && ! str_starts_with($line, '#')) {
                break;
            }

            if (preg_match('/^\s*-\s*(.*)$/', $line, $itemMatch)) {
                if ($current !== null) {
                    $entries[] = $current;
                }
                $current = [];
                $remainder = trim($itemMatch[1]);
                if (preg_match('/^([A-Za-z0-9_-]+):\s*(.*)$/', $remainder, $kv)) {
                    $current[strtolower($kv[1])] = trim($kv[2], " \t'\"");
                }

                continue;
            }

            if ($current !== null && preg_match('/^\s+([A-Za-z0-9_-]+):\s*(.*)$/', $line, $kv)) {
                $current[strtolower($kv[1])] = trim($kv[2], " \t'\"");
            }
        }

        if ($current !== null) {
            $entries[] = $current;
        }

        $logins = [];
        foreach ($entries as $entry) {
            $token = trim($entry['token'] ?? '');
            if ($token === '') {
                continue;
            }

            $name = trim($entry['name'] ?? '');
            $url = $entry['url'] ?? '';
            $urlHost = '';
            if ($url !== '') {
                $parsedHost = parse_url($url, PHP_URL_HOST);
                $parsedPort = parse_url($url, PHP_URL_PORT);
                $urlHost = strtolower(is_string($parsedHost) ? $parsedHost : '');
                if ($urlHost !== '' && is_int($parsedPort)) {
                    $urlHost .= ':'.$parsedPort;
                }
            }

            if ($name === '' && $urlHost === '') {
                continue;
            }

            $logins[] = [
                'name' => $name !== '' ? $name : $urlHost,
                'host' => $urlHost,
                'user' => trim($entry['user'] ?? ''),
                'default' => strtolower($entry['default'] ?? '') === 'true',
            ];
        }

        return $logins;
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
