<?php

namespace App\Services;

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\CloudAccount;
use App\Services\LaraKube\ToolLocator;
use Native\Desktop\Facades\ChildProcess;

/**
 * Google Cloud sign-in without a terminal, driven through `larakube cloud:login --provider=gcp --json`: the CLI prints the
 * sign-in address and then waits for the verification code Google shows after the user approves. The process stays alive as
 * a Run, the address is read from its output, and the code is written to its standard input.
 */
class GcpSignIn
{
    public const SUBJECT = 'gcp-auth';

    public function __construct(private CliRunner $runner, private CloudAccount $account, private ?ToolLocator $locator = null) {}

    public function current(): ?Run
    {
        return Run::query()
            ->where('subject', self::SUBJECT)
            ->where('status', RunStatus::Running)
            ->latest('id')
            ->first();
    }

    public function start(bool $restart = false): Run
    {
        if (! $restart) {
            $existing = $this->current();
            if ($existing !== null) {
                return $existing;
            }
        }

        Run::query()->where('subject', self::SUBJECT)->where('status', RunStatus::Running)->get()->each(function (Run $old): void {
            ChildProcess::stop($old->alias());
            if (is_string($oldFile = $old->meta['stdin_file'] ?? null) && $oldFile !== '') {
                @unlink($oldFile);
            }
            $old->forceFill(['status' => RunStatus::Cancelled, 'finished_at' => now()])->save();
        });

        $secretEnvironment = [];
        $meta = [];

        if (! ($this->locator ?? app(ToolLocator::class))->wslFeatureEnabled()) {
            $stdinFile = storage_path('framework/temp/gcp-code-'.bin2hex(random_bytes(8)).'.txt');
            @mkdir(dirname($stdinFile), 0755, true);
            @unlink($stdinFile);
            $secretEnvironment['LARAKUBE_STDIN_FILE'] = $stdinFile;
            $meta['stdin_file'] = $stdinFile;
        }

        return $this->runner->start(
            label: 'Google Cloud sign-in',
            arguments: ['cloud:login', '--provider=gcp', '--json'],
            secretEnvironment: $secretEnvironment,
            kind: RunKind::CloudAuth,
            subject: self::SUBJECT,
            meta: $meta,
            targetType: 'system',
            targetName: 'Google Cloud',
        );
    }

    /** @return array{state: 'starting'|'waiting-code'|'signing-in'|'done'|'failed', url: ?string, message: ?string} */
    public function state(Run $run): array
    {
        $url = $this->url($run);

        return match (true) {
            $run->status === RunStatus::Succeeded => ['state' => 'done', 'url' => null, 'message' => null],
            $run->status !== RunStatus::Running => ['state' => 'failed', 'url' => null, 'message' => $this->tail($run)],
            ($run->meta['code_sent'] ?? null) === '1' => ['state' => 'signing-in', 'url' => null, 'message' => null],
            $url !== null => ['state' => 'waiting-code', 'url' => $url, 'message' => null],
            default => ['state' => 'starting', 'url' => null, 'message' => null],
        };
    }

    /** The code goes to the waiting process via its stdin file (or stdin pipe under WSL). It is never shown in a command line. */
    public function submitCode(Run $run, string $code): void
    {
        $stdinFile = $run->meta['stdin_file'] ?? null;

        if (is_string($stdinFile) && $stdinFile !== '') {
            @mkdir(dirname($stdinFile), 0755, true);
            $tmp = $stdinFile.'.tmp';
            file_put_contents($tmp, trim($code)."\n", LOCK_EX);
            @rename($tmp, $stdinFile);
        } else {
            ChildProcess::message(trim($code)."\n", $run->alias());
        }

        $run->forceFill(['meta' => [...($run->meta ?? []), 'code_sent' => '1']])->save();
    }

    /** @return list<array{id: string, name: string}> */
    public function projects(): array
    {
        $result = $this->account->call(['cloud:projects', '--provider=gcp']);
        $projects = [];

        foreach (is_array($result['projects'] ?? null) ? $result['projects'] : [] as $project) {
            if (is_array($project) && is_string($project['id'] ?? null)) {
                $projects[] = ['id' => $project['id'], 'name' => is_string($project['name'] ?? null) ? $project['name'] : $project['id']];
            }
        }

        return $projects;
    }

    private function url(Run $run): ?string
    {
        return preg_match('#https://accounts\.google\.com/o/oauth2/\S+#', $run->output, $match) === 1 ? $match[0] : null;
    }

    private function tail(Run $run): string
    {
        $error = $run->result['error'] ?? null;

        if (is_string($error) && $error !== '') {
            return $error;
        }

        $lines = array_values(array_filter(array_map('trim', explode("\n", $run->output)), fn (string $line): bool => $line !== ''));

        return implode("\n", array_slice($lines, -4)) ?: 'Google Cloud sign-in did not finish.';
    }
}
