<?php

namespace App\Services\LaraKube;

use App\Services\Runtime\WslDistro;
use Illuminate\Contracts\Process\ProcessResult;
use Illuminate\Support\Facades\Process;
use Native\Desktop\Facades\ChildProcess;

/**
 * Finds executables without relying on the inherited PATH. Apps launched
 * from Finder or the Dock get a minimal PATH (no Homebrew, no ~/.local/bin),
 * so every binary is resolved against an explicit directory list, and the
 * same list is handed to child processes as their PATH.
 */
class ToolLocator
{
    /**
     * @param  list<string>|null  $directories
     * @param  bool|null  $windows  force the Windows behaviour (commands run inside the larakube-ubuntu WSL distro), for tests
     */
    public function __construct(private ?array $directories = null, private ?bool $windows = null) {}

    /** On Windows the CLI and its tools live inside the larakube-ubuntu WSL distro, so every command is run there. */
    public function isWindows(): bool
    {
        return $this->windows ?? PHP_OS_FAMILY === 'Windows';
    }

    /** @var array<string, string|null> Binaries already looked up in the distro. */
    private array $inDistro = [];

    private ?string $failure = null;

    /**
     * @return list<string>
     */
    public function directories(): array
    {
        if ($this->directories !== null) {
            return $this->directories;
        }

        if ($this->isWindows()) {
            return [WslDistro::HOME.'/.local/bin', WslDistro::HOME.'/.larakube/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
        }

        $home = self::home();

        return array_values(array_filter([
            $home !== '' ? "{$home}/.local/bin" : null,
            $home !== '' ? "{$home}/.larakube/bin" : null,
            $home !== '' ? "{$home}/bin" : null,
            '/opt/homebrew/bin',
            '/usr/local/bin',
            '/home/linuxbrew/.linuxbrew/bin',
            $home !== '' ? "{$home}/google-cloud-sdk/bin" : null,
            $home !== '' ? "{$home}/.orbstack/bin" : null,
            '/Applications/Docker.app/Contents/Resources/bin',
            '/usr/bin',
            '/bin',
            '/usr/sbin',
            '/sbin',
        ]));
    }

    public function find(string $binary): ?string
    {
        if ($this->isWindows() && $this->directories === null) {
            return $this->inDistro[$binary] ??= $this->findInDistro($binary);
        }

        foreach ($this->directories() as $directory) {
            $candidate = "{$directory}/{$binary}";

            if (is_file($candidate) && is_executable($candidate)) {
                return $candidate;
            }
        }

        return null;
    }

    /**
     * Asks the distro where a binary is, searching the same directories as on a Mac. No shell and no quoting:
     * `env` sets PATH and `which` answers, so there is no script for wsl.exe to mangle.
     */
    private function findInDistro(string $binary): ?string
    {
        $result = Process::timeout(90)->run([
            self::wslExecutable(), '-d', WslDistro::NAME, '--user', WslDistro::USER,
            '--exec', '/usr/bin/env', 'PATH='.$this->path(), '/usr/bin/which', $binary,
        ]);
        $found = trim($result->output());

        if ($result->successful() && $found !== '') {
            $this->failure = null;

            return $found;
        }

        $this->failure = 'wsl.exe exited '.$result->exitCode().': '.(trim(str_replace("\0", '', $result->errorOutput().' '.$result->output())) ?: 'no output');

        return null;
    }

    /** Why the last lookup in the distro found nothing, for the Setup screen. */
    public function lastFailure(): ?string
    {
        return $this->failure;
    }

    public static function wslExecutable(): string
    {
        return rtrim((string) (getenv('SystemRoot') ?: 'C:\\Windows'), '\\').'\\System32\\wsl.exe';
    }

    public function path(): string
    {
        // A Linux PATH, also when this app runs on Windows, where PHP's own separator is `;`.
        return implode(':', $this->directories());
    }

    /**
     * Environment for any process that runs a CLI tool on the user's behalf.
     *
     * @return array<string, string>
     */
    public function environment(): array
    {
        if ($this->isWindows()) {
            return ['PATH' => $this->path(), 'HOME' => WslDistro::HOME, 'LANG' => 'en_US.UTF-8', 'NO_COLOR' => '1'];
        }

        return array_filter([
            'PATH' => $this->path(),
            'HOME' => self::home(),
            'USER' => (string) (getenv('USER') ?: ''),
            'SSH_AUTH_SOCK' => (string) (getenv('SSH_AUTH_SOCK') ?: ''),
            'TMPDIR' => (string) (getenv('TMPDIR') ?: ''),
            'LANG' => 'en_US.UTF-8',
            'NO_COLOR' => '1',
        ], fn (string $value): bool => $value !== '');
    }

    /**
     * Wrap $command so it starts from an EMPTY environment plus only the
     * given variables. Both Electron (ChildProcess) and Symfony (Process)
     * otherwise inherit this app's own Laravel environment — DB_CONNECTION,
     * APP_CONFIG_CACHE and friends — which the LaraKube CLI, itself a Laravel
     * Zero app, would pick up and break on. Values travel in the spawn
     * environment and are referenced by name, so secrets never reach argv.
     *
     * @param  list<string>  $command
     * @param  array<string, string>  $extraEnvironment
     * @return array{command: list<string>, environment: array<string, string>, cwd: string|null}
     */
    public function isolate(array $command, array $extraEnvironment = [], ?string $cwd = null): array
    {
        foreach (array_keys($extraEnvironment) as $name) {
            $this->assertVariableName($name);
        }

        if ($this->isWindows()) {
            return $this->isolateForWsl($command, $extraEnvironment, $cwd);
        }

        $environment = [...$this->environment(), ...$extraEnvironment];

        $assignments = [];
        foreach (array_keys($environment) as $name) {
            $this->assertVariableName($name);

            $assignments[] = $name.'="$'.$name.'"';
        }

        return [
            'command' => ['/bin/sh', '-c', 'exec /usr/bin/env -i '.implode(' ', $assignments).' "$@"', 'larakube-desktop', ...$command],
            'environment' => $environment,
            'cwd' => $cwd,
        ];
    }

    /**
     * The same isolation, run inside the larakube-ubuntu distro: `wsl.exe -d larakube-ubuntu --user larakube [--cd <dir>]
     * --exec env VAR=value ... <command>`. No shell, so there is nothing to quote. Only variables named in WSLENV cross
     * from Windows into the distro, so the app's own environment cannot leak in, and the extra (secret) ones travel
     * that way by name and never reach a command line.
     *
     * @param  list<string>  $command
     * @param  array<string, string>  $extraEnvironment
     * @return array{command: list<string>, environment: array<string, string>, cwd: string|null}
     */
    private function isolateForWsl(array $command, array $extraEnvironment, ?string $cwd): array
    {
        $assignments = [];
        foreach ($this->environment() as $name => $value) {
            $assignments[] = "{$name}={$value}";
        }

        $environment = $extraEnvironment;
        if ($extraEnvironment !== []) {
            $environment['WSLENV'] = implode(':', array_keys($extraEnvironment));
        }

        return [
            'command' => [
                self::wslExecutable(), '-d', WslDistro::NAME, '--user', WslDistro::USER,
                ...($cwd !== null ? ['--cd', WslDistro::toLinux($cwd)] : []),
                '--exec', '/usr/bin/env', ...$assignments, ...$command,
            ],
            'environment' => $environment,
            'cwd' => null,
        ];
    }

    private function assertVariableName(string $name): void
    {
        if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $name) !== 1) {
            throw new \InvalidArgumentException("Invalid environment variable name [{$name}].");
        }
    }

    /**
     * Run a command to completion, isolated, on this machine or in the distro. Every place that runs a tool
     * goes through here (or start()), so Windows needs no special case anywhere else.
     *
     * @param  list<string>  $command
     * @param  array<string, string>  $environment  extra variables, such as a secret token
     */
    public function run(array $command, int $timeout = 60, array $environment = [], ?string $cwd = null, ?string $input = null): ProcessResult
    {
        $isolated = $this->isolate($command, $environment, $cwd);
        $process = Process::env($isolated['environment'])->timeout($timeout);

        if ($isolated['cwd'] !== null) {
            $process = $process->path($isolated['cwd']);
        }

        if ($input !== null) {
            $process = $process->input($input);
        }

        return $process->run($isolated['command']);
    }

    /**
     * Start a long-running command in the background under $alias, isolated.
     *
     * @param  list<string>  $command
     * @param  array<string, string>  $environment
     */
    public function start(array $command, string $alias, array $environment = [], ?string $cwd = null): void
    {
        $isolated = $this->isolate($command, $environment, $cwd);

        ChildProcess::start(
            cmd: $isolated['command'],
            alias: $alias,
            cwd: $isolated['cwd'] ?? storage_path('app'),
            env: $isolated['environment'],
        );
    }

    public static function home(): string
    {
        if (PHP_OS_FAMILY === 'Windows') {
            return WslDistro::HOME;
        }

        return rtrim((string) ($_SERVER['HOME'] ?? getenv('HOME') ?: ''), '/');
    }
}
