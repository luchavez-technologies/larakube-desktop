<?php

namespace App\Listeners;

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Jobs\Sync\SyncClusterToolsJob;
use App\Jobs\Sync\SyncMailJob;
use App\Jobs\Sync\SyncServerDomainsJob;
use App\Models\Activity;
use App\Models\Run;
use App\Models\Server;
use App\Services\Elevation;
use App\Services\LaraKube\ClusterStatus;
use App\Services\LaraKube\ContextHealth;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\RunNotifier;
use Native\Desktop\Events\ChildProcess\ErrorReceived;
use Native\Desktop\Events\ChildProcess\MessageReceived;
use Native\Desktop\Events\ChildProcess\ProcessExited;
use Native\Desktop\Events\ChildProcess\StartupError;

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

    /** A process that never started has no exit to wait for, so the run ends here, with the reason on its log. */
    public function handleStartupError(StartupError $event): void
    {
        $run = $this->run($event->alias);

        if ($run === null || $run->status !== RunStatus::Running) {
            return;
        }

        $run->appendTo('output', "The command could not be started: {$event->error}\n");
        $run->forceFill(['status' => RunStatus::Failed, 'finished_at' => now()])->save();
    }

    public function handleExit(ProcessExited $event): void
    {
        $run = $this->run($event->alias);

        if ($run === null) {
            return;
        }

        $result = $this->decodeResult($run->stdout)
            ?? $this->missingFlagResult($run->output)
            ?? ($event->code !== 0 ? $this->exceptionResult($run->output) : null);

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

        // What Setup remembered about this computer is out of date once an install ends.
        if ($run->kind === RunKind::InstallTool || $run->kind === RunKind::SetupLocal) {
            app(ReadinessCheck::class)->forget($run->kind === RunKind::InstallTool ? $run->tool : null);
        }

        // Passwordless sudo exists only while the local setup runs.
        if ($run->kind === RunKind::SetupLocal) {
            app(Elevation::class)->revoke();
        }

        app(RunNotifier::class)->runFinished($run);

        $context = $run->meta['context'] ?? null;
        $server = $context !== null ? Server::firstWhere('context', $context) : null;

        if ($server !== null && $run->kind?->changesClusterTools()) {
            SyncClusterToolsJob::dispatch($server->id);

            if ($status === RunStatus::Succeeded) {
                $this->recordActivity($run, $server);
            }
        }

        if ($context !== null && $run->kind?->changesBackups()) {
            app(ClusterStatus::class)->forgetBackup($context);
        }

        // Busted on completion, not when the action is clicked — the run is
        // async, so the state the click triggers doesn't exist yet at click
        // time. Covers provision/evict/rotate/add-service (PlexInit) and
        // start/stop, whichever outcome (success or failure can both change
        // what's actually running).
        if ($context !== null && $run->kind?->changesPlex()) {
            app(ClusterStatus::class)->forgetPlex($context);
        }

        if ($context !== null && $run->kind === RunKind::ConnectDomain) {
            app(ClusterStatus::class)->forgetDns($context);

            if ($server !== null) {
                SyncServerDomainsJob::dispatch($server->id);
            }
        }

        if ($context !== null && $run->kind === RunKind::EnableSsl) {
            app(ClusterStatus::class)->forgetTls($context);

            if ($server !== null) {
                SyncServerDomainsJob::dispatch($server->id);
            }
        }

        // Repair/resize exist to bring a broken cluster back — the next page
        // visit should see that immediately, not a cached "unreachable" from
        // before the fix.
        if ($context !== null && in_array($run->kind, [RunKind::RepairServer, RunKind::ResizeServer], true)) {
            app(ContextHealth::class)->forget($context);

            if ($server !== null) {
                SyncClusterToolsJob::dispatch($server->id);
            }
        }

        if ($server !== null && $run->kind?->changesMail()) {
            // Deploying mail for the first time means the tool list itself doesn't
            // know about it yet; everything else already has an installed mail tool.
            if ($run->kind === RunKind::MailDeploy) {
                SyncClusterToolsJob::dispatch($server->id);
            } else {
                SyncMailJob::dispatch($server->id);
            }

            if ($status === RunStatus::Succeeded) {
                $this->recordActivity($run, $server);
            }
        }
    }

    private function recordActivity(Run $run, Server $server): void
    {
        $type = $run->kind?->activityType();

        if ($type === null) {
            return;
        }

        $tool = $run->meta['tool'] ?? $run->tool;

        Activity::create([
            'server_id' => $server->id,
            'cluster_tool_id' => $tool !== null ? $server->clusterTools()->where('tool', $tool)->value('id') : null,
            'run_id' => $run->id,
            'type' => $type,
            'title' => $run->label,
            'occurred_at' => now(),
        ]);
    }

    /**
     * The message of an uncaught exception, from the block Symfony Console
     * prints for it ("In File.php line 32:" then the indented message).
     *
     * @return array{success: false, error: string}|null
     */
    private function exceptionResult(string $output): ?array
    {
        if (preg_match_all('/^In \S+ line \d+:[ \t]*\R(?:[ \t]*\R)*((?:[ \t]+\S[^\r\n]*(?:\R|$))+)/m', $output, $matches) < 1) {
            return null;
        }

        $message = trim((string) preg_replace('/\s+/', ' ', (string) end($matches[1])));

        return $message === '' ? null : ['success' => false, 'error' => "The LaraKube CLI stopped with: {$message}"];
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
