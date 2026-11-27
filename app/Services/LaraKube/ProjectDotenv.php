<?php

namespace App\Services\LaraKube;

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Models\Project;
use App\Models\Run;
use App\Services\Runtime\WslDistro;
use App\Support\LaraKubeLabels;
use Carbon\CarbonImmutable;
use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Support\Facades\Cache;

/**
 * Real-time dotenv drift comparison against cluster secrets/configmaps,
 * as `larakube dotenv <environment> --json` reports it.
 */
class ProjectDotenv
{
    public const LAST_PUSH_CACHE_PREFIX = 'dotenv.last_pushed_at:';

    public const CI_REMOTE_CACHE_PREFIX = 'dotenv.ci_remote:';

    public function __construct(private ToolLocator $locator) {}

    /**
     * @return array{environment: ?string, namespace: ?string, context: ?string, items: list<array<string, mixed>>, summary: array<string, mixed>}|null
     */
    public function get(string $projectPath, string $environment, bool $reveal = false): ?array
    {
        $cli = $this->locator->find('larakube');
        $hostPath = $this->locator->isWindows() ? WslDistro::toWindows($projectPath) : $projectPath;

        if ($cli === null || ! is_dir($hostPath)) {
            return null;
        }

        try {
            $cmd = [$cli, 'dotenv', $environment, '--json', '--no-interaction'];
            if ($reveal) {
                $cmd[] = '--reveal';
            }
            $result = $this->locator->run($cmd, 30, cwd: $projectPath);
        } catch (ProcessTimedOutException) {
            return null;
        }

        $lines = preg_split('/\R/', trim($result->output())) ?: [];
        $decoded = json_decode((string) end($lines), true);

        if (! is_array($decoded) || ($decoded['success'] ?? false) !== true || ! is_array($decoded['items'] ?? null)) {
            return null;
        }

        return [
            'environment' => $decoded['environment'] ?? $environment,
            'namespace' => $decoded['namespace'] ?? null,
            'context' => is_string($decoded['context'] ?? null) ? $decoded['context'] : null,
            'items' => array_values(array_filter($decoded['items'], is_array(...))),
            'summary' => is_array($decoded['summary'] ?? null) ? $decoded['summary'] : [],
        ];
    }

    /**
     * Update environment variables on local disk (.env or .env.{environment}),
     * push to the cluster (OpenBao / app-secrets) or CI ({ENV}_BUILD_ENV for
     * static sites), and optionally trigger rolling restart.
     *
     * @param  array<string, string|null>  $variables  Map of key => value (or null to remove)
     * @return array{success: bool, warning?: bool, message: string, status: array<string, mixed>|null, rolled: bool}
     */
    public function update(string $projectPath, string $environment, array $variables, bool $redeploy = false): array
    {
        $filename = $environment === 'local' ? '.env' : ".env.{$environment}";
        $filePath = rtrim($projectPath, '/').'/'.$filename;
        $hostPath = $this->locator->isWindows() ? WslDistro::toWindows($filePath) : $filePath;

        $existingLines = file_exists($hostPath) ? (file($hostPath, FILE_IGNORE_NEW_LINES) ?: []) : [];
        $updatedLines = [];
        $handledKeys = [];

        foreach ($existingLines as $line) {
            $trimmed = trim($line);
            if ($trimmed === '' || str_starts_with($trimmed, '#')) {
                if (preg_match('/^#\s*([a-zA-Z_][a-zA-Z0-9_]*)=(.*)$/', $trimmed, $matches)) {
                    $key = $matches[1];
                    if (array_key_exists($key, $variables)) {
                        $handledKeys[$key] = true;
                        $newVal = $variables[$key];
                        if ($newVal !== null) {
                            $updatedLines[] = "{$key}=".$this->formatEnvValue((string) $newVal);
                        }

                        continue;
                    }
                }
                $updatedLines[] = $line;

                continue;
            }

            if (preg_match('/^([a-zA-Z_][a-zA-Z0-9_]*)=(.*)$/', $trimmed, $matches)) {
                $key = $matches[1];
                if (array_key_exists($key, $variables)) {
                    $handledKeys[$key] = true;
                    $newVal = $variables[$key];
                    if ($newVal !== null) {
                        $updatedLines[] = "{$key}=".$this->formatEnvValue((string) $newVal);
                    }

                    continue;
                }
            }

            $updatedLines[] = $line;
        }

        foreach ($variables as $key => $val) {
            if (! isset($handledKeys[$key]) && $val !== null) {
                $updatedLines[] = "{$key}=".$this->formatEnvValue((string) $val);
            }
        }

        $content = implode("\n", $updatedLines);
        if ($content !== '') {
            $content .= "\n";
        }
        file_put_contents($hostPath, $content);

        // Push to cluster or CI (for static sites / hybrid apps)
        $pushData = null;
        $pushError = null;
        $cli = $this->locator->find('larakube');
        if ($cli !== null) {
            try {
                $cmd = [$cli, 'dotenv:push', $environment, '--json', '--no-interaction'];
                $result = $this->locator->run($cmd, 60, cwd: $projectPath);
                $lines = preg_split('/\R/', trim($result->output())) ?: [];
                $decoded = json_decode((string) end($lines), true);

                if (is_array($decoded)) {
                    $pushData = $decoded;
                    if (($decoded['success'] ?? true) === false) {
                        $pushError = is_string($decoded['error'] ?? null)
                            ? $decoded['error']
                            : 'Failed to push variables.';
                    }
                } elseif (! $result->successful()) {
                    $errorOut = trim($result->errorOutput() ?: $result->output());
                    $pushError = $errorOut !== '' ? $errorOut : 'Failed to push variables.';
                }
            } catch (\Throwable $e) {
                $pushError = $e->getMessage();
            }
        }

        if ($cli !== null && $pushError === null) {
            $this->recordPushTimestamp($projectPath, $environment);
        }

        $status = $this->get($projectPath, $environment, true);
        $namespace = $status['namespace'] ?? null;
        $rolled = false;

        if ($redeploy && $namespace) {
            $kubectl = $this->locator->find('kubectl') ?: 'kubectl';
            try {
                // The environment's own cluster, never kubectl's current context: that may be a
                // different cluster entirely, where the restart quietly finds nothing to restart.
                $context = is_string($status['context'] ?? null) && $status['context'] !== '' ? $status['context'] : null;
                $restartCmd = [
                    $kubectl,
                    ...($context !== null ? ['--context', $context] : []),
                    'rollout',
                    'restart',
                    'deployment',
                    '-l',
                    LaraKubeLabels::PREVIEW.'!=true,'.LaraKubeLabels::ROLE.'!=share',
                    '-n',
                    $namespace,
                ];
                $rolled = $this->locator->run($restartCmd, 30, cwd: $projectPath)->successful();
            } catch (\Throwable) {
                $rolled = false;
            }
        }

        if ($pushError !== null) {
            return [
                'success' => true,
                'warning' => true,
                'message' => "Saved to {$filename}, but push failed: {$pushError}",
                'status' => $status,
                'rolled' => $rolled,
            ];
        }

        $backend = is_array($pushData) ? ($pushData['backend'] ?? null) : null;
        if (in_array($backend, ['forgejo', 'github', 'gitlab'], true)) {
            $ciLabel = match ($backend) {
                'forgejo' => 'Forgejo',
                'github' => 'GitHub',
                'gitlab' => 'GitLab',
            };
            $secretName = is_string($pushData['secretName'] ?? null)
                ? $pushData['secretName']
                : strtoupper($environment).'_BUILD_ENV';

            return [
                'success' => true,
                'message' => "Environment variables saved to {$filename} and pushed to {$ciLabel} ({$secretName}).",
                'status' => $status,
                'rolled' => $rolled,
            ];
        }

        $ciSync = is_array($pushData) && is_array($pushData['ci'] ?? null) ? $pushData['ci'] : null;
        if ($ciSync !== null && ($ciSync['pushed'] ?? false) === true) {
            $ciSecret = is_string($ciSync['secretName'] ?? null)
                ? $ciSync['secretName']
                : strtoupper($environment).'_BUILD_ENV';

            return [
                'success' => true,
                'message' => $rolled
                    ? "Environment variables saved, pushed to cluster + CI ({$ciSecret}), and workloads rolled in '{$namespace}'."
                    : "Environment variables saved and pushed to cluster + CI ({$ciSecret}).",
                'status' => $status,
                'rolled' => $rolled,
            ];
        }

        return [
            'success' => true,
            'message' => $rolled
                ? "Environment variables saved and application workloads rolled in '{$namespace}'."
                : 'Environment variables saved and pushed to cluster.',
            'status' => $status,
            'rolled' => $rolled,
        ];
    }

    private function formatEnvValue(string $value): string
    {
        if ($value === '') {
            return '';
        }

        if (preg_match('/[\s#"\'=\\\\]/', $value)) {
            return '"'.str_replace(['\\', '"'], ['\\\\', '\"'], $value).'"';
        }

        return $value;
    }

    public function recordPushTimestamp(string $projectPath, string $environment): void
    {
        Cache::forever($this->lastPushCacheKey($projectPath, $environment), now()->toIso8601String());
        $this->forgetRemoteCiCache($projectPath, $environment);
    }

    public function forgetRemoteCiCache(string $projectPath, string $environment): void
    {
        Cache::forget($this->remoteCiCacheKey($projectPath, $environment));
    }

    /**
     * Collects push metadata for an environment's variables: when secrets were
     * last pushed (from Desktop history + remote CI secret metadata), whether
     * `{ENV}_BUILD_ENV` exists on the target CI platform, and whether the local
     * `.env` file was modified after the last recorded push.
     *
     * @param  array<string, mixed>  $inspection
     * @return array{platform: string, secretName: string, existsOnCi: ?bool, lastPushedAt: ?string, localUpdatedAt: ?string, modifiedSincePush: bool}
     */
    public function pushMetadata(Project $project, string $environment, array $inspection): array
    {
        $envCi = is_array($inspection['environments'][$environment]['ci'] ?? null)
            ? $inspection['environments'][$environment]['ci']
            : [];
        $platform = is_string($envCi['platform'] ?? null) && $envCi['platform'] !== ''
            ? $envCi['platform']
            : 'github';
        $repoSlug = is_string($envCi['repoSlug'] ?? null) && $envCi['repoSlug'] !== ''
            ? $envCi['repoSlug']
            : null;
        $forgejoHost = is_string($envCi['forgejoHost'] ?? null) && $envCi['forgejoHost'] !== ''
            ? $envCi['forgejoHost']
            : null;
        $teaLogin = is_string($envCi['teaLogin'] ?? null) && $envCi['teaLogin'] !== ''
            ? $envCi['teaLogin']
            : $forgejoHost;
        $secretName = strtoupper($environment).'_BUILD_ENV';

        $lastPushedAt = $this->latestRecordedPush($project, $environment);

        $existsOnCi = null;
        $remoteUpdatedAt = null;
        if ($environment !== 'local') {
            $remote = $this->inspectRemoteCiSecret(
                $project->path,
                $environment,
                $platform,
                $secretName,
                $repoSlug,
                $teaLogin,
            );
            $existsOnCi = $remote['existsOnCi'];
            $remoteUpdatedAt = $remote['updatedAt'];
        }

        $effectivePushedAt = $this->maxIsoTimestamp($lastPushedAt, $remoteUpdatedAt);

        $envFilename = $environment === 'local' ? '.env' : ".env.{$environment}";
        $envHostPath = $this->locator->isWindows()
            ? WslDistro::toWindows(rtrim($project->path, '/').'/'.$envFilename)
            : rtrim($project->path, '/').'/'.$envFilename;
        clearstatcache(true, $envHostPath);
        $mtime = is_file($envHostPath) ? @filemtime($envHostPath) : false;
        $localUpdatedAt = is_int($mtime) ? CarbonImmutable::createFromTimestampUTC($mtime)->toIso8601String() : null;

        $pushedEpoch = $effectivePushedAt !== null ? strtotime($effectivePushedAt) : false;
        $localEpoch = is_int($mtime) ? $mtime : false;
        $modifiedSincePush = is_int($pushedEpoch) && is_int($localEpoch) && $localEpoch > ($pushedEpoch + 2);

        return [
            'platform' => $platform,
            'secretName' => $secretName,
            'existsOnCi' => $existsOnCi,
            'lastPushedAt' => $effectivePushedAt,
            'localUpdatedAt' => $localUpdatedAt,
            'modifiedSincePush' => $modifiedSincePush,
        ];
    }

    private function latestRecordedPush(Project $project, string $environment): ?string
    {
        $cached = Cache::get($this->lastPushCacheKey($project->path, $environment));
        $cachedIso = is_string($cached) && $cached !== '' ? $cached : null;

        $latestRun = Run::query()
            ->where(fn ($q) => $q->where('project_id', $project->id)->orWhere('subject', "project:{$project->id}"))
            ->whereIn('kind', [RunKind::DotenvPush->value, RunKind::ConfigureCi->value])
            ->where('status', RunStatus::Succeeded->value)
            ->where(fn ($q) => $q->where('environment', $environment)->orWhereNull('environment'))
            ->latest('id')
            ->first(['finished_at', 'created_at']);

        $runTimestamp = $latestRun !== null ? ($latestRun->finished_at ?? $latestRun->created_at) : null;
        $runIso = $runTimestamp?->toIso8601String();

        return $this->maxIsoTimestamp($cachedIso, $runIso);
    }

    /**
     * @return array{existsOnCi: ?bool, updatedAt: ?string}
     */
    private function inspectRemoteCiSecret(
        string $projectPath,
        string $environment,
        string $platform,
        string $secretName,
        ?string $repoSlug,
        ?string $forgejoHost,
    ): array {
        if ($repoSlug === null) {
            return ['existsOnCi' => null, 'updatedAt' => null];
        }

        $cacheKey = $this->remoteCiCacheKey($projectPath, $environment);
        $cached = Cache::get($cacheKey);
        if (
            is_array($cached)
            && is_bool($cached['existsOnCi'] ?? null)
            && ($cached['platform'] ?? null) === $platform
            && ($cached['repoSlug'] ?? null) === $repoSlug
        ) {
            return [
                'existsOnCi' => $cached['existsOnCi'],
                'updatedAt' => is_string($cached['updatedAt'] ?? null) ? $cached['updatedAt'] : null,
            ];
        }

        $result = ['existsOnCi' => null, 'updatedAt' => null];

        if ($platform === 'forgejo' && $forgejoHost !== null) {
            $tea = $this->locator->find('tea');
            if ($tea !== null) {
                $result = $this->queryTeaSecret($tea, $projectPath, $repoSlug, $forgejoHost, $secretName);
            }
        } elseif ($platform === 'github') {
            $gh = $this->locator->find('gh');
            if ($gh !== null) {
                $result = $this->queryGithubSecret($gh, $projectPath, $repoSlug, $secretName);
            }
        }

        if ($result['existsOnCi'] !== null) {
            Cache::put($cacheKey, [
                'platform' => $platform,
                'repoSlug' => $repoSlug,
                'existsOnCi' => $result['existsOnCi'],
                'updatedAt' => $result['updatedAt'],
            ], now()->addSeconds(15));
        }

        return $result;
    }

    /**
     * @return array{existsOnCi: ?bool, updatedAt: ?string}
     */
    private function queryTeaSecret(string $tea, string $projectPath, string $repoSlug, string $forgejoHost, string $secretName): array
    {
        try {
            $res = $this->locator->run(
                [$tea, 'actions', 'secrets', 'list', '--repo', $repoSlug, '--login', $forgejoHost, '--output', 'json'],
                timeout: 8,
                cwd: $projectPath,
            );
        } catch (\Throwable) {
            return ['existsOnCi' => null, 'updatedAt' => null];
        }

        if (! $res->successful()) {
            return ['existsOnCi' => null, 'updatedAt' => null];
        }

        $trimmed = trim($res->output());
        if ($trimmed === '' || $trimmed === 'null' || $trimmed === '[]') {
            return ['existsOnCi' => false, 'updatedAt' => null];
        }

        $items = json_decode($trimmed, true);
        if (! is_array($items)) {
            return ['existsOnCi' => null, 'updatedAt' => null];
        }

        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }
            $name = (string) ($item['name'] ?? $item['Name'] ?? '');
            if (strcasecmp($name, $secretName) === 0) {
                return [
                    'existsOnCi' => true,
                    'updatedAt' => $this->normalizeTimestamp($item['updated_at'] ?? $item['created_at'] ?? $item['created'] ?? $item['Created'] ?? null),
                ];
            }
        }

        return ['existsOnCi' => false, 'updatedAt' => null];
    }

    /**
     * @return array{existsOnCi: ?bool, updatedAt: ?string}
     */
    private function queryGithubSecret(string $gh, string $projectPath, string $repoSlug, string $secretName): array
    {
        try {
            $res = $this->locator->run(
                [$gh, 'secret', 'list', '-R', $repoSlug, '--json', 'name,updatedAt'],
                timeout: 8,
                cwd: $projectPath,
            );
        } catch (\Throwable) {
            return ['existsOnCi' => null, 'updatedAt' => null];
        }

        if (! $res->successful()) {
            return ['existsOnCi' => null, 'updatedAt' => null];
        }

        $items = json_decode(trim($res->output()), true);
        if (! is_array($items)) {
            return ['existsOnCi' => null, 'updatedAt' => null];
        }

        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }
            $name = (string) ($item['name'] ?? '');
            if (strcasecmp($name, $secretName) === 0) {
                return [
                    'existsOnCi' => true,
                    'updatedAt' => $this->normalizeTimestamp($item['updatedAt'] ?? null),
                ];
            }
        }

        return ['existsOnCi' => false, 'updatedAt' => null];
    }

    private function normalizeTimestamp(mixed $raw): ?string
    {
        if (is_int($raw) || (is_string($raw) && ctype_digit($raw))) {
            return CarbonImmutable::createFromTimestampUTC((int) $raw)->toIso8601String();
        }

        if (is_string($raw) && trim($raw) !== '') {
            $ts = strtotime($raw);

            return is_int($ts) ? CarbonImmutable::createFromTimestampUTC($ts)->toIso8601String() : null;
        }

        return null;
    }

    private function maxIsoTimestamp(?string $a, ?string $b): ?string
    {
        if ($a === null) {
            return $b;
        }
        if ($b === null) {
            return $a;
        }

        $tsA = strtotime($a);
        $tsB = strtotime($b);
        if ($tsA === false) {
            return $b;
        }
        if ($tsB === false) {
            return $a;
        }

        return $tsA >= $tsB ? $a : $b;
    }

    private function lastPushCacheKey(string $projectPath, string $environment): string
    {
        return self::LAST_PUSH_CACHE_PREFIX.md5($projectPath).':'.$environment;
    }

    private function remoteCiCacheKey(string $projectPath, string $environment): string
    {
        return self::CI_REMOTE_CACHE_PREFIX.md5($projectPath).':'.$environment;
    }
}
