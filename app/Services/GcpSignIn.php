<?php

namespace App\Services;

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\LaraKube\ToolLocator;
use Native\Desktop\Facades\ChildProcess;
use RuntimeException;

/**
 * Google Cloud sign-in without a terminal. `gcloud auth login --no-launch-browser` prints a sign-in address and then
 * waits for the verification code Google shows after the user approves; the process stays alive as a Run, the address is
 * read from its output, and the code is written to its standard input.
 */
class GcpSignIn
{
    public const SUBJECT = 'gcp-auth';

    public function __construct(private ToolLocator $locator) {}

    public function start(): Run
    {
        $gcloud = $this->locator->find('gcloud');

        if ($gcloud === null) {
            throw new RuntimeException('The Google Cloud CLI is not installed. Install it from Setup first.');
        }

        Run::query()->where('subject', self::SUBJECT)->where('status', RunStatus::Running)->get()->each(function (Run $old): void {
            ChildProcess::stop($old->alias());
            $old->forceFill(['status' => RunStatus::Cancelled, 'finished_at' => now()])->save();
        });

        $command = [$gcloud, 'auth', 'login', '--no-launch-browser', '--update-adc'];

        $run = Run::create([
            'label' => 'Google Cloud sign-in',
            'kind' => RunKind::CloudAuth,
            'subject' => self::SUBJECT,
            'target_type' => 'system',
            'target_name' => 'Google Cloud',
            'command' => $command,
        ]);

        $this->locator->start($command, $run->alias());

        return $run;
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

    /** The code goes to the waiting process on stdin. It is not stored and never shown in a command line. */
    public function submitCode(Run $run, string $code): void
    {
        ChildProcess::message(trim($code)."\n", $run->alias());

        $run->forceFill(['meta' => [...($run->meta ?? []), 'code_sent' => '1']])->save();
    }

    /** @return list<array{id: string, name: string}> */
    public function projects(): array
    {
        $gcloud = $this->locator->find('gcloud');

        if ($gcloud === null) {
            return [];
        }

        $result = $this->locator->run([$gcloud, 'projects', 'list', '--format=json'], 60);
        $decoded = json_decode($result->output(), true);

        if (! $result->successful() || ! is_array($decoded)) {
            return [];
        }

        $projects = [];

        foreach ($decoded as $project) {
            if (is_array($project) && is_string($project['projectId'] ?? null)) {
                $projects[] = ['id' => $project['projectId'], 'name' => is_string($project['name'] ?? null) ? $project['name'] : $project['projectId']];
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
        $lines = array_values(array_filter(array_map('trim', explode("\n", $run->output)), fn (string $line): bool => $line !== ''));

        return implode("\n", array_slice($lines, -4)) ?: 'Google Cloud sign-in did not finish.';
    }
}
