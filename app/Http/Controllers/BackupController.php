<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ClusterStatus;
use App\Services\LaraKube\StackCatalog;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Native\Desktop\Facades\Shell;

/**
 * Backups of one server. Every action is a `backup:*` CLI command shown in
 * Activity; nothing here backs anything up itself. Keys and the Cloudflare token
 * reach the CLI through its environment, never its arguments, so they are not
 * kept on the run. The recovery card (the passphrase) is a file the CLI writes;
 * this app only points at it and never reads it.
 */
class BackupController extends Controller
{
    public const SCHEDULES = [
        'nightly' => '0 3 * * *',
        'weekly' => '0 3 * * 0',
        'twice-daily' => '0 3,15 * * *',
    ];

    public function setup(Request $request, string $server, StackCatalog $stacks, CliRunner $runner): RedirectResponse
    {
        $stack = $this->stack($server, $stacks);

        $validated = $request->validate([
            'endpoint' => ['required', 'url:https', 'max:255'],
            'bucket' => ['required', 'string', 'max:100', 'regex:/^[a-z0-9][a-z0-9.-]*$/'],
            'access_key' => ['required', 'string', 'max:255'],
            'secret_key' => ['required', 'string', 'max:255'],
            'region' => ['nullable', 'string', 'max:50', 'regex:/^[a-z0-9-]+$/'],
            'create_bucket' => ['nullable', 'boolean'],
            'cloudflare_token' => ['nullable', 'string', 'max:255'],
        ]);

        $arguments = [
            'backup:init', 'production', "--context={$stack['context']}",
            "--endpoint={$validated['endpoint']}",
            "--bucket={$validated['bucket']}",
            '--region='.($validated['region'] ?? 'auto'),
            '--json',
        ];

        $environment = [
            'LARAKUBE_BACKUP_ACCESS_KEY' => $validated['access_key'],
            'LARAKUBE_BACKUP_SECRET_KEY' => $validated['secret_key'],
        ];

        if (($validated['create_bucket'] ?? false) && ! empty($validated['cloudflare_token'])) {
            $arguments[] = '--create-bucket';
            $environment['LARAKUBE_CLOUDFLARE_TOKEN'] = $validated['cloudflare_token'];
        }

        return $this->start($runner, $stack, $server, "Set up backups on {$server}", RunKind::BackupInit, $arguments, $environment);
    }

    public function schedule(Request $request, string $server, StackCatalog $stacks, CliRunner $runner): RedirectResponse
    {
        $stack = $this->stack($server, $stacks);

        $validated = $request->validate([
            'schedule' => ['required', Rule::in(array_keys(self::SCHEDULES))],
            'timezone' => ['required', 'string', 'max:64', 'regex:/^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/'],
        ]);

        return $this->start($runner, $stack, $server, "Schedule backups on {$server}", RunKind::BackupSchedule, [
            'backup:schedule', 'production', "--context={$stack['context']}",
            '--cron='.self::SCHEDULES[$validated['schedule']],
            "--timezone={$validated['timezone']}",
        ]);
    }

    public function unschedule(string $server, StackCatalog $stacks, CliRunner $runner): RedirectResponse
    {
        $stack = $this->stack($server, $stacks);

        return $this->start($runner, $stack, $server, "Stop scheduled backups on {$server}", RunKind::BackupUnschedule, [
            'backup:unschedule', 'production', "--context={$stack['context']}", '--force',
        ]);
    }

    public function run(string $server, StackCatalog $stacks, CliRunner $runner): RedirectResponse
    {
        $stack = $this->stack($server, $stacks);

        return $this->start($runner, $stack, $server, "Back up {$server} now", RunKind::BackupRun, [
            'backup:run', 'production', "--context={$stack['context']}", '--json',
        ]);
    }

    /** Reads every item of a backup to prove it can be restored. Changes nothing. */
    public function check(Request $request, string $server, StackCatalog $stacks, CliRunner $runner): RedirectResponse
    {
        $stack = $this->stack($server, $stacks);
        $validated = $request->validate(['backup' => ['nullable', 'string', 'regex:/^[0-9-]+$/']]);

        $arguments = ['backup:restore', 'production', "--context={$stack['context']}", '--deep', '--dry-run', '--force'];

        if (! empty($validated['backup'])) {
            $arguments[] = "--backup={$validated['backup']}";
        }

        return $this->start($runner, $stack, $server, "Check a backup of {$server}", RunKind::BackupCheck, $arguments);
    }

    /** Replaces live data, so the item's name has to be typed back. */
    public function restore(Request $request, string $server, StackCatalog $stacks, CliRunner $runner): RedirectResponse
    {
        $stack = $this->stack($server, $stacks);

        $validated = $request->validate([
            'kind' => ['required', Rule::in(['database', 'volume'])],
            'name' => ['required', 'string', 'max:120', 'regex:/^[A-Za-z0-9._-]+$/'],
            'confirm' => ['required', 'same:name'],
            'backup' => ['nullable', 'string', 'regex:/^[0-9-]+$/'],
        ], ['confirm.same' => 'Type the name exactly to confirm.']);

        $arguments = [
            'backup:restore', 'production', "--context={$stack['context']}",
            "--{$validated['kind']}={$validated['name']}", '--force',
        ];

        if (! empty($validated['backup'])) {
            $arguments[] = "--backup={$validated['backup']}";
        }

        return $this->start($runner, $stack, $server, "Restore {$validated['name']} on {$server}", RunKind::BackupRestore, $arguments);
    }

    /** Without `apply` it only shows what would go. */
    public function prune(Request $request, string $server, StackCatalog $stacks, CliRunner $runner): RedirectResponse
    {
        $stack = $this->stack($server, $stacks);
        $apply = $request->boolean('apply');

        $arguments = ['backup:prune', 'production', "--context={$stack['context']}"];

        if ($apply) {
            array_push($arguments, '--apply', '--force');
        }

        return $this->start(
            $runner, $stack, $server,
            $apply ? "Delete old backups of {$server}" : "Preview old backups of {$server}",
            $apply ? RunKind::BackupPrune : RunKind::BackupCheck,
            $arguments,
        );
    }

    /** Shows the recovery card file in the system's file manager. It is never read here. */
    public function recoveryCard(string $server, StackCatalog $stacks, ClusterStatus $status): RedirectResponse
    {
        $stack = $this->stack($server, $stacks);
        $card = $status->backup($stack['context'])['recoveryCard'] ?? null;

        if (is_array($card) && ($card['exists'] ?? false) && is_string($card['path'])) {
            Shell::showInFolder($card['path']);
        }

        return back();
    }

    /** @return array<string, mixed> */
    private function stack(string $server, StackCatalog $stacks): array
    {
        $stack = $stacks->find($server);
        abort_unless($stack !== null && is_string($stack['context']), 404);

        return $stack;
    }

    /**
     * @param  array<string, mixed>  $stack
     * @param  list<string>  $arguments
     * @param  array<string, string>  $environment
     */
    private function start(CliRunner $runner, array $stack, string $server, string $label, RunKind $kind, array $arguments, array $environment = []): RedirectResponse
    {
        $run = $runner->start(
            label: $label,
            arguments: $arguments,
            secretEnvironment: $environment,
            kind: $kind,
            subject: "server:{$server}",
            meta: ['server' => $server, 'context' => $stack['context']],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $stack['context'],
        );

        return to_route('runs.show', $run);
    }
}
