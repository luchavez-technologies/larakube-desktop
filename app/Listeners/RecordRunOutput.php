<?php

namespace App\Listeners;

use App\Enums\RunStatus;
use App\Models\Run;
use Native\Desktop\Events\ChildProcess\ErrorReceived;
use Native\Desktop\Events\ChildProcess\MessageReceived;
use Native\Desktop\Events\ChildProcess\ProcessExited;

/**
 * Folds a LaraKube CLI child process's streams into its Run. Under --json the
 * CLI writes progress to stderr and exactly one JSON result line to stdout.
 */
class RecordRunOutput
{
    public function handleMessage(MessageReceived $event): void
    {
        $this->run($event->alias)?->appendTo('stdout', $this->chunk($event->data));
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

        $result = $this->decodeResult($run->stdout);

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
