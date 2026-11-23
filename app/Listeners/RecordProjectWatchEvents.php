<?php

namespace App\Listeners;

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Events\LocalWorkloadsSynced;
use App\Events\RunFinished;
use App\Models\Project;
use App\Models\Run;
use App\Services\LaraKube\ProjectWatcher;
use Native\Desktop\Events\ChildProcess\MessageReceived;
use Native\Desktop\Events\ChildProcess\ProcessExited;
use Throwable;

/**
 * Drives live reload: folds `larakube watch --json` output into its project's
 * state, and keeps each watcher in step with whether its project is running.
 * The 15-second local workload sync covers app launch, pauses and anything
 * done outside Desktop; a finished local up/stop/down acts at once.
 */
class RecordProjectWatchEvents
{
    public function __construct(private ProjectWatcher $watcher) {}

    public function handleMessage(MessageReceived $event): void
    {
        $projectId = ProjectWatcher::projectIdFromAlias($event->alias);

        if ($projectId !== null) {
            $this->watcher->record($projectId, is_string($event->data) ? $event->data : (string) json_encode($event->data));
        }
    }

    public function handleExit(ProcessExited $event): void
    {
        $projectId = ProjectWatcher::projectIdFromAlias($event->alias);

        if ($projectId !== null) {
            $this->watcher->exited($projectId, $event->code);
        }
    }

    public function handleWorkloadsSynced(LocalWorkloadsSynced $event): void
    {
        $this->quietly(fn () => $this->watcher->reconcileAll());
    }

    public function handleRunFinished(RunFinished $event): void
    {
        $this->quietly(fn () => $this->afterRun($event));
    }

    /** Live reload is a convenience: it never breaks the sync or the run that triggered it. */
    private function quietly(callable $callback): void
    {
        try {
            $callback();
        } catch (Throwable $e) {
            report($e);
        }
    }

    private function afterRun(RunFinished $event): void
    {
        $kind = RunKind::tryFrom((string) $event->kind);

        if ($event->project === null || ! in_array($kind, [RunKind::UpProject, RunKind::StartProject, RunKind::StopProject, RunKind::DownProject], true)) {
            return;
        }

        $run = Run::find($event->run);
        $project = Project::find($event->project);

        if ($run === null || $project === null || ($run->environment ?? 'local') !== 'local') {
            return;
        }

        if (in_array($kind, [RunKind::StopProject, RunKind::DownProject], true)) {
            $this->watcher->reconcile($project, running: false);

            return;
        }

        if ($event->status === RunStatus::Succeeded->value) {
            // A fresh up may have added Horizon or Reverb: look again.
            $this->watcher->reset($project);
            $this->watcher->reconcile($project, running: true);
        }
    }
}
