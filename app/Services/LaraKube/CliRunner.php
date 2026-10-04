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
     * @param  array<string, string>  $meta  what the run acts on (server, context, tool, project), for the UI and cache invalidation
     * @param  string|null  $cwd  a project folder, for commands that act on the project in the current directory
     * @param  array<string, mixed>|null  $devBox  a dev box from the stack list: run the command there over SSH instead of here
     */
    public function start(
        string $label,
        array $arguments,
        array $secretEnvironment = [],
        ?RunKind $kind = null,
        ?string $subject = null,
        array $meta = [],
        ?string $cwd = null,
        ?string $targetType = null,
        ?string $targetName = null,
        ?int $projectId = null,
        ?string $projectName = null,
        ?string $environment = null,
        ?string $serverName = null,
        ?string $context = null,
        ?string $tool = null,
        ?array $devBox = null,
    ): Run {
        if ($devBox !== null) {
            // The same commands, run on a dev box over SSH. Its projects folder is the working directory there.
            $command = app(DevBoxShell::class)->command($devBox, $arguments);
        } else {
            $cli = $this->locator->find('larakube');

            if ($cli === null) {
                throw new RuntimeException('The LaraKube CLI is not installed.');
            }

            $command = [$cli, ...$arguments, '--no-interaction'];
        }

        if ($projectId === null && isset($meta['project']) && is_numeric($meta['project'])) {
            $projectId = (int) $meta['project'];
        }

        if ($projectName === null && isset($meta['project']) && ! is_numeric($meta['project'])) {
            $projectName = (string) $meta['project'];
        }

        if ($environment === null && isset($meta['environment'])) {
            $environment = (string) $meta['environment'];
        }

        if ($serverName === null && isset($meta['server'])) {
            $serverName = (string) $meta['server'];
        }

        if ($context === null && isset($meta['context'])) {
            $context = (string) $meta['context'];
        }

        if ($tool === null && isset($meta['tool'])) {
            $tool = (string) $meta['tool'];
        }

        if ($targetType === null) {
            if ($projectId !== null || $projectName !== null) {
                $targetType = 'project';
                $targetName ??= $projectName;
            } elseif ($serverName !== null) {
                $targetType = 'server';
                $targetName ??= $serverName;
            } elseif ($tool !== null) {
                $targetType = 'tool';
                $targetName ??= $tool;
            } elseif ($kind !== null) {
                $kindVal = $kind->value;
                if (str_contains($kindVal, 'project') || in_array($kindVal, ['deploy-app', 'configure-host', 'link-server', 'plex-join', 'plex-leave'], true)) {
                    $targetType = 'project';
                } elseif (str_contains($kindVal, 'server') || in_array($kindVal, ['connect-domain', 'enable-ssl', 'install-cluster-tool', 'remove-cluster-tool', 'plex-init', 'plex-start', 'plex-stop'], true)) {
                    $targetType = 'server';
                } elseif (str_contains($kindVal, 'companion') || $kindVal === 'install-tool') {
                    $targetType = 'tool';
                } else {
                    $targetType = 'system';
                }
            } else {
                $targetType = 'system';
            }
        }

        $targetName ??= $subject;

        $run = Run::create([
            'label' => $label,
            'kind' => $kind,
            'subject' => $subject,
            'target_type' => $targetType,
            'target_name' => $targetName,
            'project_id' => $projectId,
            'project_name' => $projectName,
            'environment' => $environment,
            'server_name' => $serverName,
            'context' => $context,
            'tool' => $tool,
            'meta' => $meta === [] ? null : $meta,
            'command' => $command,
        ]);

        $isolated = $this->locator->isolate($command, $secretEnvironment);

        ChildProcess::start(
            cmd: $isolated['command'],
            alias: $run->alias(),
            cwd: $cwd ?? storage_path('app'),
            env: $isolated['environment'],
        );

        return $run;
    }

    public function cancel(Run $run): void
    {
        ChildProcess::stop($run->alias());
    }
}
