<?php

namespace App\Services\LaraKube;

use App\Enums\RunKind;
use App\Models\Run;
use Native\Desktop\Facades\ChildProcess;
use RuntimeException;

/**
 * Starts LaraKube CLI commands as NativePHP child processes and records each
 * one as a Run. Output arrives asynchronously through the ChildProcess event
 * listeners. Always non-interactive: a GUI cannot answer a terminal prompt.
 */
class CliRunner
{
    public function __construct(private ToolLocator $locator) {}

    /**
     * @param  list<string>  $arguments  CLI arguments after the binary, without secrets
     * @param  array<string, string>  $secretEnvironment  credentials passed by env, never stored on the Run
     */
    public function start(string $label, array $arguments, array $secretEnvironment = [], ?RunKind $kind = null, ?string $subject = null): Run
    {
        $cli = $this->locator->find('larakube');

        if ($cli === null) {
            throw new RuntimeException('The LaraKube CLI is not installed.');
        }

        $command = [$cli, ...$arguments, '--no-interaction'];

        $run = Run::create([
            'label' => $label,
            'kind' => $kind,
            'subject' => $subject,
            'command' => $command,
        ]);

        $isolated = $this->locator->isolate($command, $secretEnvironment);

        ChildProcess::start(
            cmd: $isolated['command'],
            alias: $run->alias(),
            cwd: storage_path('app'),
            env: $isolated['environment'],
        );

        return $run;
    }

    public function cancel(Run $run): void
    {
        ChildProcess::stop($run->alias());
    }
}
