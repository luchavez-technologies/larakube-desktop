<?php

namespace App\Listeners;

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Jobs\Sync\SyncClusterToolsJob;
use App\Jobs\Sync\SyncDriveJob;
use App\Jobs\Sync\SyncLocalClusterJob;
use App\Jobs\Sync\SyncLocalWorkloadsJob;
use App\Jobs\Sync\SyncMailJob;
use App\Jobs\Sync\SyncPlexJob;
use App\Jobs\Sync\SyncServerClusterUsersJob;
use App\Jobs\Sync\SyncServerDomainsJob;
use App\Jobs\Sync\SyncServerExternalDnsJob;
use App\Jobs\Sync\SyncServerTlsJob;
use App\Models\Activity;
use App\Models\Run;
use App\Models\Server;
use App\Services\Elevation;
use App\Services\LaraKube\CliRunner;
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

        if ($event->code !== 0 && $run->emitsJsonResult()) {
            $rawStdout = trim($run->stdout);
            if ($rawStdout !== '' && $this->decodeResult($rawStdout) === null) {
                if ($run->output === '') {
                    $run->output = $rawStdout."\n";
                }
            }
        }

        $rawLog = $run->output !== '' ? $run->output : $run->stdout;

        $result = $this->decodeResult($run->stdout)
            ?? $this->missingFlagResult($rawLog)
            ?? ($event->code !== 0 ? ($this->exceptionResult($rawLog) ?? $this->cliErrorResult($rawLog)) : null);

        $status = match (true) {
            $run->status === RunStatus::Cancelled => RunStatus::Cancelled,
            $event->code === 0 && ($result['success'] ?? true) !== false => RunStatus::Succeeded,
            default => RunStatus::Failed,
        };

        $run->forceFill([
            'status' => $status,
            'exit_code' => $event->code,
            'result' => $result,
            'output' => $run->output,
            'finished_at' => now(),
        ])->save();

        // What Setup remembered about this computer is out of date once an install ends.
        if ($run->kind === RunKind::InstallTool || $run->kind === RunKind::SetupLocal) {
            app(ReadinessCheck::class)->forget($run->kind === RunKind::InstallTool ? $run->tool : null);
        }

        // Passwordless sudo exists only for the length of the run that requested
        // it — local setup always, and a local `up` or a dnsmasq/gcloud
        // install/update only when CliRunner granted it (see its docblock there).
        if ($run->kind === RunKind::SetupLocal
            || ($run->kind === RunKind::UpProject && $run->environment === 'local')
            || ($run->kind === RunKind::InstallTool && in_array($run->tool, ['dnsmasq', 'gcloud'], true))) {
            app(Elevation::class)->revoke();
        }

        app(RunNotifier::class)->runFinished($run);

        // The local cluster's own up/down/start/stop was previously invisible
        // to LocalCluster's cache (nothing ever called its forget()), so this
        // state could sit stale until its TTL happened to expire. Now that
        // state lives in local_cluster_state, re-sync immediately rather than
        // wait for SyncLocalClusterJob's/SyncLocalWorkloadsJob's own
        // recurring tick — the latter is exactly what flips a project's
        // Projects-page badge between Running/Paused/Down right after this run.
        if ($run->environment === 'local'
            && in_array($run->kind, [RunKind::UpProject, RunKind::DownProject, RunKind::StartProject, RunKind::StopProject], true)
        ) {
            SyncLocalClusterJob::dispatch();
            SyncLocalWorkloadsJob::dispatch();
        }

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

            if ($server !== null) {
                SyncPlexJob::dispatch($server->id);
            }
        }

        if ($context !== null && in_array($run->kind, [RunKind::ConnectDomain, RunKind::DisconnectDomain], true)) {
            app(ClusterStatus::class)->forgetDns($context);

            if ($server !== null) {
                SyncServerDomainsJob::dispatch($server->id);
                SyncServerExternalDnsJob::dispatch($server->id);
            }

            if ($run->kind === RunKind::ConnectDomain && ($run->meta['also_enable_tls'] ?? '0') === '1' && $status === RunStatus::Succeeded) {
                $runner = app(CliRunner::class);
                $serverName = $run->meta['server'] ?? ($server !== null ? $server->name : 'server');
                $provider = $run->meta['provider'] ?? 'cloudflare';
                $group = $run->meta['group'] ?? null;
                $groupArg = $group !== null && $group !== '' ? ["--group={$group}"] : [];

                $runner->start(
                    label: "Automatic SSL certificates on {$serverName}",
                    arguments: ['tls:init', 'production', "--context={$context}", "--provider={$provider}", ...$groupArg, '--force'],
                    kind: RunKind::EnableSsl,
                    subject: $serverName,
                    meta: ['server' => $serverName, 'context' => $context, 'provider' => $provider],
                    targetType: 'server',
                    targetName: $serverName,
                    serverName: $serverName,
                    context: $context,
                );
            }
        }

        if ($context !== null && in_array($run->kind, [RunKind::EnableSsl, RunKind::PruneTls], true)) {
            app(ClusterStatus::class)->forgetTls($context);
            app(ClusterStatus::class)->forgetDns($context);

            if ($server !== null) {
                SyncServerDomainsJob::dispatch($server->id);
                SyncServerExternalDnsJob::dispatch($server->id);
                SyncServerTlsJob::dispatch($server->id);
            }
        }

        // ClusterGrant/ClusterRevoke don't carry 'context' in their own meta
        // (unlike the domain/TLS runs above) — $run->server_id is already
        // reliably populated from the run's own `context` column at save
        // time (see Run::booted()), so it's used directly here instead.
        if ($run->server_id !== null && in_array($run->kind, [RunKind::ClusterGrant, RunKind::ClusterRevoke], true)) {
            SyncServerClusterUsersJob::dispatch($run->server_id);
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

        if ($server !== null && $run->kind?->changesDrive()) {
            SyncClusterToolsJob::dispatch($server->id);
            SyncDriveJob::dispatch($server->id);

            $enableOffice = in_array($run->meta['enable_office'] ?? null, [true, '1', 1], true);
            if ($run->kind === RunKind::DriveDeploy && $enableOffice && $status === RunStatus::Succeeded && $context !== null) {
                $runner = app(CliRunner::class);
                $serverName = $run->meta['server'] ?? $server->name;
                $vpnOnly = in_array($run->meta['vpn_only'] ?? null, [true, '1', 1], true);
                $domain = $run->meta['domain'] ?? null;
                $args = ['drive:office:init', 'production', "--context={$context}", '--force'];
                if ($domain !== null && $domain !== '') {
                    $args[] = "--domain={$domain}";
                }
                if ($vpnOnly) {
                    $args[] = '--vpn-only';
                }

                $runner->start(
                    label: "Deploy Collabora Online on {$serverName}",
                    arguments: $args,
                    kind: RunKind::DriveOfficeDeploy,
                    subject: $serverName,
                    meta: ['server' => $serverName, 'context' => $context],
                    targetType: 'server',
                    targetName: $serverName,
                    serverName: $serverName,
                    context: $context,
                );
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

    /**
     * When Symfony Console or the CLI stops with a plain error message
     * (e.g. 'The "--foo" option does not exist.' or 'Command "bar" is not defined.'),
     * pull out the message so the run banner explains why it failed.
     *
     * @return array{success: false, error: string}|null
     */
    private function cliErrorResult(string $output): ?array
    {
        $lines = array_values(array_filter(array_map('trim', explode("\n", $output))));
        if ($lines === []) {
            return null;
        }

        return ['success' => false, 'error' => $lines[0]];
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
