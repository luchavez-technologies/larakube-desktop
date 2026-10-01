<?php

namespace App\Services\LaraKube;

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
     */
    public function __construct(private ?array $directories = null) {}

    /**
     * @return list<string>
     */
    public function directories(): array
    {
        if ($this->directories !== null) {
            return $this->directories;
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
        foreach ($this->directories() as $directory) {
            $candidate = "{$directory}/{$binary}";

            if (is_file($candidate) && is_executable($candidate)) {
                return $candidate;
            }
        }

        return null;
    }

    public function path(): string
    {
        return implode(PATH_SEPARATOR, $this->directories());
    }

    /**
     * Environment for any process that runs a CLI tool on the user's behalf.
     *
     * @return array<string, string>
     */
    public function environment(): array
    {
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
     * @return array{command: list<string>, environment: array<string, string>}
     */
    public function isolate(array $command, array $extraEnvironment = []): array
    {
        $environment = [...$this->environment(), ...$extraEnvironment];

        $assignments = [];
        foreach (array_keys($environment) as $name) {
            if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $name) !== 1) {
                throw new \InvalidArgumentException("Invalid environment variable name [{$name}].");
            }

            $assignments[] = $name.'="$'.$name.'"';
        }

        return [
            'command' => ['/bin/sh', '-c', 'exec /usr/bin/env -i '.implode(' ', $assignments).' "$@"', 'larakube-desktop', ...$command],
            'environment' => $environment,
        ];
    }

    public static function home(): string
    {
        return rtrim((string) ($_SERVER['HOME'] ?? getenv('HOME') ?: ''), '/');
    }
}
