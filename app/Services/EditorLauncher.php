<?php

namespace App\Services;

use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\Process;

/**
 * Opens a project folder in a code editor installed on this machine. macOS
 * apps are found in the Applications folders (JetBrains Toolbox installs to
 * ~/Applications) and launched with `open -a`; elsewhere the editor's own
 * command-line launcher is used.
 */
class EditorLauncher
{
    /** @var array<string, array{label: string, app: string, cli: string}> */
    public const EDITORS = [
        'vscode' => ['label' => 'VS Code', 'app' => 'Visual Studio Code', 'cli' => 'code'],
        'phpstorm' => ['label' => 'PhpStorm', 'app' => 'PhpStorm', 'cli' => 'phpstorm'],
        'zed' => ['label' => 'Zed', 'app' => 'Zed', 'cli' => 'zed'],
        'cursor' => ['label' => 'Cursor', 'app' => 'Cursor', 'cli' => 'cursor'],
    ];

    /**
     * @param  list<string>|null  $applicationDirectories
     */
    public function __construct(private ToolLocator $locator, private ?array $applicationDirectories = null) {}

    /**
     * @return list<array{slug: string, label: string}>
     */
    public function available(): array
    {
        $editors = [];

        foreach (self::EDITORS as $slug => $editor) {
            if ($this->application($editor['app']) !== null || $this->locator->find($editor['cli']) !== null) {
                $editors[] = ['slug' => $slug, 'label' => $editor['label']];
            }
        }

        return $editors;
    }

    public function open(string $slug, string $path): bool
    {
        $editor = self::EDITORS[$slug] ?? null;

        if ($editor === null || ! is_dir($path)) {
            return false;
        }

        $application = $this->application($editor['app']);
        $cli = $this->locator->find($editor['cli']);
        $command = match (true) {
            $application !== null => ['open', '-a', $application, $path],
            $cli !== null => [$cli, $path],
            default => null,
        };

        if ($command === null) {
            return false;
        }

        return Process::env(['PATH' => $this->locator->path()])->timeout(30)->run($command)->successful();
    }

    private function application(string $name): ?string
    {
        if (PHP_OS_FAMILY !== 'Darwin' && $this->applicationDirectories === null) {
            return null;
        }

        foreach ($this->applicationDirectories ?? $this->defaultApplicationDirectories() as $directory) {
            if (is_dir("{$directory}/{$name}.app")) {
                return "{$directory}/{$name}.app";
            }
        }

        return null;
    }

    /**
     * @return list<string>
     */
    private function defaultApplicationDirectories(): array
    {
        $home = ToolLocator::home();

        return $home !== '' ? ['/Applications', "{$home}/Applications"] : ['/Applications'];
    }
}
