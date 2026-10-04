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
     * @return list<string>
     */
    public function command(array $box, array $arguments, ?string $project = null): array
    {
        $ip = (string) ($box['ip'] ?? '');
        $key = (string) ($box['sshKey'] ?? '');

        if (filter_var($ip, FILTER_VALIDATE_IP) === false || $key === '') {
            throw new InvalidArgumentException('This dev box has no address or SSH key on this computer.');
        }

        if ($project !== null && preg_match('/^[a-z0-9][a-z0-9-]*$/', $project) !== 1) {
            throw new InvalidArgumentException('That is not a project name.');
        }

        $folder = self::PROJECTS_DIRECTORY.($project !== null ? "/{$project}" : '');

        $remote = 'export PATH="$PATH:/usr/local/bin"; mkdir -p "$HOME/'.self::PROJECTS_DIRECTORY.'" && cd "$HOME/'.$folder.'" && larakube '
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
     * Runs a `--json` command on the box and returns its single result, or null when the box could not be reached
     * or answered with something else.
     *
     * @param  array{ip?: ?string, sshKey?: ?string}  $box
     * @param  list<string>  $arguments
     * @return array<string, mixed>|null
     */
    public function json(array $box, array $arguments, int $timeoutSeconds = 45): ?array
    {
        try {
            $isolated = $this->locator->isolate($this->command($box, $arguments));
            $result = Process::env($isolated['environment'])->timeout($timeoutSeconds)->run($isolated['command']);
        } catch (InvalidArgumentException|ProcessTimedOutException) {
            return null;
        }

        $lines = preg_split('/\R/', trim($result->output())) ?: [];
        $decoded = json_decode((string) end($lines), true);

        return $result->successful() && is_array($decoded) && ($decoded['success'] ?? false) === true ? $decoded : null;
    }
}
