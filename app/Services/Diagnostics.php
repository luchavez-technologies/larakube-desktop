<?php

namespace App\Services;

use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\LaraKube\ReadinessCheck;
use Throwable;

/**
 * Everything someone helping with a problem would ask for, as one block of text: versions, the state of WSL and the CLI,
 * the end of the app's log and the last failed runs. Secrets are removed before it is shown.
 */
class Diagnostics
{
    public function __construct(private AppUpdates $updates, private Wsl $wsl, private ReadinessCheck $readiness) {}

    public function report(): string
    {
        $update = $this->updates->status();
        $sections = [
            "LaraKube Desktop {$update['version']} on ".PHP_OS_FAMILY.' (PHP '.PHP_VERSION.')'."\nUpdates: ".($update['enabled'] ? "on, {$update['state']}" : 'off in this build'),
        ];

        if ($this->wsl->isWindows()) {
            $check = $this->safely(fn (): array => $this->wsl->check());
            $sections[] = 'LaraKube Linux (WSL): '.(is_array($check) ? "{$check['state']} - {$check['message']}" : "check failed: {$check}");
        }

        $cli = $this->safely(fn (): array => $this->readiness->status('larakube', true));
        $sections[] = 'LaraKube CLI: '.(is_array($cli)
            ? ($cli['installed'] ? "{$cli['path']} ({$cli['version']})" : 'not found'.($cli['diagnostic'] ? " - {$cli['diagnostic']}" : ''))
            : "check failed: {$cli}");

        $failed = Run::query()->where('status', RunStatus::Failed)->latest('id')->limit(3)->get();
        $sections[] = $failed->isEmpty()
            ? 'Recent failed runs: none'
            : "Recent failed runs:\n".$failed->map(fn (Run $run): string => "- #{$run->id} {$run->label} (exit ".($run->exit_code ?? 'none').")\n  ".implode(' ', array_map('strval', $run->command))."\n".$this->indent($this->tail($run->output, 12)))->implode("\n");

        $sections[] = "End of the app log:\n".$this->indent($this->logTail(40));

        return $this->redact(implode("\n\n", $sections));
    }

    /** @return array<string, mixed>|string the result, or the reason it could not be had */
    private function safely(callable $check): array|string
    {
        try {
            return $check();
        } catch (Throwable $e) {
            return $e->getMessage();
        }
    }

    private function logTail(int $lines): string
    {
        $files = glob(storage_path('logs/*.log')) ?: [];

        if ($files === []) {
            return '(no log file)';
        }

        usort($files, fn (string $a, string $b): int => filemtime($b) <=> filemtime($a));

        return $this->tail((string) file_get_contents($files[0]), $lines) ?: '(the log is empty)';
    }

    private function tail(string $text, int $lines): string
    {
        $all = preg_split('/\R/', rtrim($text)) ?: [];

        return implode("\n", array_slice($all, -$lines));
    }

    private function indent(string $text): string
    {
        return implode("\n", array_map(fn (string $line): string => '  '.$line, explode("\n", $text)));
    }

    private function redact(string $text): string
    {
        return (string) preg_replace([
            '/\bBearer\s+[A-Za-z0-9._~+\/=-]+/i',
            '/\b(token|secret|password|passwd|api[_-]?key|authorization)(["\']?\s*[=:]\s*["\']?)[^\s"\']+/i',
            '/\b(AKIA|ASIA)[A-Z0-9]{12,}\b/',
            '/\b(dop_v1|ghp|gho|github_pat|glpat|xox[bp])[_-][A-Za-z0-9_-]{8,}/',
        ], ['Bearer [removed]', '$1$2[removed]', '[removed]', '[removed]'], $text);
    }
}
