<?php

namespace App\Listeners;

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\LaraKube\ClusterStatus;
use App\Services\LaraKube\ToolCatalog;
use Native\Desktop\Events\ChildProcess\ErrorReceived;
use Native\Desktop\Events\ChildProcess\MessageReceived;
use Native\Desktop\Events\ChildProcess\ProcessExited;

/**
 * Folds a LaraKube CLI child process's streams into its Run. Under --json the
 * CLI writes progress to stderr and exactly one JSON result line to stdout;
 * without it, everything is human output and belongs in the log.
 */
class RecordRunOutput
{
    public function handleMessage(MessageReceived $event): void
    {
        $run = $this->run($event->alias);

        $run?->appendTo($run->emitsJsonResult() ? 'stdout' : 'output', $this->chunk($event->data));
    }

    public function handleError(ErrorReceived $event): void
    {
        $this->run($event->alias)?->appendTo('output', $this->chunk($event->data));
    }

    public function handleExit(ProcessExited $event): void
    {
        $run = $this->run($event->alias);

        if ($run === null) {
            return;
        }

        $result = $this->decodeResult($run->stdout) ?? $this->missingFlagResult($run->output);

        $status = match (true) {
            $run->status === RunStatus::Cancelled => RunStatus::Cancelled,
            $event->code === 0 && ($result['success'] ?? true) !== false => RunStatus::Succeeded,
            default => RunStatus::Failed,
        };

        $run->forceFill([
            'status' => $status,
            'exit_code' => $event->code,
            'result' => $result,
            'finished_at' => now(),
        ])->save();

        $context = $run->meta['context'] ?? null;

        if ($context !== null && $run->kind?->changesClusterTools()) {
            app(ToolCatalog::class)->forget($context);
        }

        if ($context !== null && $run->kind === RunKind::ConnectDomain) {
            app(ClusterStatus::class)->forgetDns($context);
        }

        if ($context !== null && $run->kind === RunKind::EnableSsl) {
            app(ClusterStatus::class)->forgetTls($context);
        }
    }

    /**
     * A non-interactive run that stopped for a missing flag prints
     * "Missing --group" followed by what the flag is for; turn that into the
     * failure message the run page shows.
     *
     * @return array{success: false, error: string}|null
     */
    private function missingFlagResult(string $output): ?array
    {
        if (preg_match('/Missing (--[a-z0-9-]+)\s*\R\s*\R?\s*(\S[^\r\n]*)/', $output, $matches) !== 1) {
            return null;
        }

        return ['success' => false, 'error' => "The CLI needs {$matches[1]}: {$matches[2]}."];
    }

    private function run(string $alias): ?Run
    {
        $id = Run::idFromAlias($alias);

        return $id !== null ? Run::find($id) : null;
    }

    private function chunk(mixed $data): string
    {
        $text = is_string($data) ? $data : (string) json_encode($data);

        return (string) preg_replace('/\e\[[0-9;?]*[A-Za-z]/', '', $text);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function decodeResult(string $stdout): ?array
    {
        $lines = array_reverse(preg_split('/\R/', trim($stdout)) ?: []);

        foreach ($lines as $line) {
            $decoded = json_decode($line, true);

            if (is_array($decoded)) {
                return $decoded;
            }
        }

        return null;
    }
}
