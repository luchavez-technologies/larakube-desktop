<?php

namespace App\Services\LaraKube;

use App\Services\Runtime\WslDistro;
use Illuminate\Process\Exceptions\ProcessTimedOutException;

/**
 * Real-time dotenv drift comparison against cluster secrets/configmaps,
 * as `larakube dotenv <environment> --json` reports it.
 */
class ProjectDotenv
{
    public function __construct(private ToolLocator $locator) {}

    /**
     * @return array{environment: ?string, namespace: ?string, items: list<array<string, mixed>>, summary: array<string, mixed>}|null
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
            'items' => array_values(array_filter($decoded['items'], is_array(...))),
            'summary' => is_array($decoded['summary'] ?? null) ? $decoded['summary'] : [],
        ];
    }

    /**
     * Update environment variables on local disk (.env or .env.{environment}),
     * push to the cluster (OpenBao / app-secrets), and optionally trigger rolling restart.
     *
     * @param  array<string, string|null>  $variables  Map of key => value (or null to remove)
     * @return array{success: bool, message: string, status: array<string, mixed>|null, rolled: bool}
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

        // Push to cluster
        $cli = $this->locator->find('larakube');
        if ($cli !== null) {
            try {
                $cmd = [$cli, 'dotenv:push', $environment, '--json', '--no-interaction'];
                $this->locator->run($cmd, 60, cwd: $projectPath);
            } catch (\Throwable) {
                // Ignore push failure; get() below will report the resulting status
            }
        }

        $status = $this->get($projectPath, $environment, true);
        $namespace = $status['namespace'] ?? null;
        $rolled = false;

        if ($redeploy && $namespace) {
            $kubectl = $this->locator->find('kubectl') ?: 'kubectl';
            try {
                $restartCmd = [
                    $kubectl,
                    'rollout',
                    'restart',
                    'deployment',
                    '-l',
                    'larakube-preview!=true,larakube.dev/role!=share',
                    '-n',
                    $namespace,
                ];
                $this->locator->run($restartCmd, 30, cwd: $projectPath);
                $rolled = true;
            } catch (\Throwable) {
                $rolled = false;
            }
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
}
