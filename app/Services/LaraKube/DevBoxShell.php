<?php

namespace App\Services\LaraKube;

use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Support\Facades\Process;
use InvalidArgumentException;

/**
 * Runs the LaraKube CLI on a dev box over SSH, so the commands that make and run projects work
 * there exactly as on this computer. The box's own login is the one `devbox:create` set up; its key
 * is on this computer.
 */
class DevBoxShell
{
    /** Where projects live on the box, relative to its home. */
    public const PROJECTS_DIRECTORY = 'projects';

    public function __construct(private ToolLocator $locator) {}

    /**
     * The ssh command line that runs `larakube <arguments>` in the projects folder on the box.
     *
     * @param  array{ip?: ?string, sshKey?: ?string}  $box  a dev box from the stack list
     * @param  list<string>  $arguments  CLI arguments after the binary
     * @param  string|null  $project  a project folder under the projects folder to run in, for commands that act on the project in the current directory
     * @param  string|null  $readSecret  the name of an environment variable the command needs; its value is read from the first line of standard input on the box, so it is never in any command line
     * @return list<string>
     */
    public function command(array $box, array $arguments, ?string $project = null, ?string $readSecret = null): array
    {
        $ip = (string) ($box['ip'] ?? '');
        $key = (string) ($box['sshKey'] ?? '');

        if (filter_var($ip, FILTER_VALIDATE_IP) === false || $key === '') {
            throw new InvalidArgumentException('This dev box has no address or SSH key on this computer.');
        }

        if ($readSecret !== null && preg_match('/^[A-Z][A-Z0-9_]*$/', $readSecret) !== 1) {
            throw new InvalidArgumentException('That is not an environment variable name.');
        }

        if ($project !== null && preg_match('/^[a-z0-9][a-z0-9-]*$/', $project) !== 1) {
            throw new InvalidArgumentException('That is not a project name.');
        }

        $folder = self::PROJECTS_DIRECTORY.($project !== null ? "/{$project}" : '');

        $read = $readSecret !== null ? "IFS= read -r {$readSecret} && export {$readSecret} && " : '';

        $remote = $read.'export PATH="$PATH:/usr/local/bin"; mkdir -p "$HOME/'.self::PROJECTS_DIRECTORY.'" && cd "$HOME/'.$folder.'" && larakube '
            .implode(' ', array_map('escapeshellarg', [...$arguments, '--no-interaction']));

        return [
            $this->locator->find('ssh') ?? '/usr/bin/ssh',
            '-i', $key,
            '-o', 'BatchMode=yes',
            '-o', 'StrictHostKeyChecking=accept-new',
            '-o', 'ConnectTimeout=15',
            "larakube@{$ip}",
            'bash -lc '.escapeshellarg($remote),
        ];
    }

    /**
     * Wraps a command so the value of the environment variable $name, which this computer's process holds, is
     * sent to it on standard input. Pairs with command()'s $readSecret.
     *
     * @param  list<string>  $command
     * @return list<string>
     */
    public function feeding(array $command, string $name): array
    {
        if (preg_match('/^[A-Z][A-Z0-9_]*$/', $name) !== 1) {
            throw new InvalidArgumentException('That is not an environment variable name.');
        }

        return ['/bin/bash', '-c', 'printf \'%s\\n\' "$'.$name.'" | "$@"', 'larakube-desktop', ...$command];
    }

    /**
     * The ssh command line that runs a plain shell script on the box, for what is not a larakube command.
     *
     * @param  array{ip?: ?string, sshKey?: ?string}  $box
     * @return list<string>
     */
    public function script(array $box, string $script): array
    {
        $command = $this->command($box, []);

        return [...array_slice($command, 0, -1), 'bash -lc '.escapeshellarg($script)];
    }

    /**
     * Runs a `--json` command on the box and returns its single result, or null when the box could not be reached
     * or answered with something else.
     *
     * @param  array{ip?: ?string, sshKey?: ?string}  $box
     * @param  list<string>  $arguments
     * @param  array{0: string, 1: string}|null  $secret  [environment variable name, value] handed to the command on standard input
     * @param  string|null  $project  a project folder under the projects folder to run in
     * @return array<string, mixed>|null
     */
    public function json(array $box, array $arguments, int $timeoutSeconds = 45, ?array $secret = null, ?string $project = null): ?array
    {
        try {
            $isolated = $this->locator->isolate($this->command($box, $arguments, $project, $secret[0] ?? null));
            $process = Process::env($isolated['environment'])->timeout($timeoutSeconds);

            if ($secret !== null) {
                $process = $process->input($secret[1]."\n");
            }

            $result = $process->run($isolated['command']);
        } catch (InvalidArgumentException|ProcessTimedOutException) {
            return null;
        }

        $lines = preg_split('/\R/', trim($result->output())) ?: [];
        $decoded = json_decode((string) end($lines), true);

        return $result->successful() && is_array($decoded) && ($decoded['success'] ?? false) === true ? $decoded : null;
    }

    /**
     * Reads collaborator keys configured on the dev box.
     *
     * @param  array{ip?: ?string, sshKey?: ?string}  $box
     * @return list<array{type: string, name: string, key: string}>|null
     */
    public function collaborators(array $box): ?array
    {
        try {
            $isolated = $this->locator->isolate($this->script($box, 'cat ~/.ssh/authorized_keys 2>/dev/null || true'));
            $result = Process::env($isolated['environment'])->timeout(15)->run($isolated['command']);
        } catch (\Throwable) {
            return null;
        }

        if (! $result->successful()) {
            return null;
        }

        $lines = preg_split('/\R/', trim($result->output())) ?: [];
        $collaborators = [];

        foreach ($lines as $line) {
            $line = trim($line);
            if (preg_match('/#\s*larakube:collaborator:(github|key):([a-zA-Z0-9_.-]+)/', $line, $matches)) {
                $type = $matches[1];
                $name = $matches[2];
                $collaborators[] = [
                    'type' => $type,
                    'name' => $name,
                    'key' => trim(substr($line, 0, (int) strpos($line, '#'))),
                ];
            }
        }

        return $collaborators;
    }
}
