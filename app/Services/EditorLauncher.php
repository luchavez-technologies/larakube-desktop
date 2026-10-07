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
    /** @var array<string, array{label: string, app: string|list<string>, cli: string, universal?: bool, languages?: list<string>, frameworks?: list<string>}> */
    public const EDITORS = [
        'vscode' => [
            'label' => 'VS Code',
            'app' => 'Visual Studio Code',
            'cli' => 'code',
            'universal' => true,
        ],
        'phpstorm' => [
            'label' => 'PhpStorm',
            'app' => 'PhpStorm',
            'cli' => 'phpstorm',
            'languages' => ['php'],
            'frameworks' => ['laravel', 'statamic', 'wordpress', 'bedrock'],
        ],
        'zed' => [
            'label' => 'Zed',
            'app' => 'Zed',
            'cli' => 'zed',
            'universal' => true,
        ],
        'cursor' => [
            'label' => 'Cursor',
            'app' => 'Cursor',
            'cli' => 'cursor',
            'universal' => true,
        ],
        'windsurf' => [
            'label' => 'Windsurf',
            'app' => 'Windsurf',
            'cli' => 'windsurf',
            'universal' => true,
        ],
        'sublime' => [
            'label' => 'Sublime Text',
            'app' => 'Sublime Text',
            'cli' => 'subl',
            'universal' => true,
        ],
        'pycharm' => [
            'label' => 'PyCharm',
            'app' => ['PyCharm', 'PyCharm CE'],
            'cli' => 'pycharm',
            'languages' => ['python'],
            'frameworks' => ['django', 'fastapi'],
        ],
        'webstorm' => [
            'label' => 'WebStorm',
            'app' => 'WebStorm',
            'cli' => 'webstorm',
            'languages' => ['javascript', 'typescript'],
            'frameworks' => ['nextjs', 'next', 'react', 'vue', 'vite', 'astro', 'docusaurus', 'nestjs', 'adonisjs'],
        ],
        'goland' => [
            'label' => 'GoLand',
            'app' => 'GoLand',
            'cli' => 'goland',
            'languages' => ['go'],
            'frameworks' => ['gin'],
        ],
        'rustrover' => [
            'label' => 'RustRover',
            'app' => 'RustRover',
            'cli' => 'rustrover',
            'languages' => ['rust'],
            'frameworks' => ['axum'],
        ],
        'rubymine' => [
            'label' => 'RubyMine',
            'app' => 'RubyMine',
            'cli' => 'rubymine',
            'languages' => ['ruby'],
            'frameworks' => ['rails'],
        ],
        'rider' => [
            'label' => 'Rider',
            'app' => 'Rider',
            'cli' => 'rider',
            'languages' => ['csharp', 'dotnet'],
            'frameworks' => ['dotnet'],
        ],
        'idea' => [
            'label' => 'IntelliJ IDEA',
            'app' => ['IntelliJ IDEA', 'IntelliJ IDEA CE'],
            'cli' => 'idea',
            'languages' => ['java', 'kotlin'],
            'frameworks' => ['springboot'],
        ],
    ];

    /**
     * @param  list<string>|null  $applicationDirectories
     */
    public function __construct(private ToolLocator $locator, private ?array $applicationDirectories = null) {}

    /**
     * @return list<array{slug: string, label: string}>
     */
    public function available(?string $framework = null): array
    {
        $installed = [];

        foreach (self::EDITORS as $slug => $editor) {
            if ($this->application($editor['app']) !== null || $this->locator->find($editor['cli']) !== null) {
                $installed[$slug] = $editor;
            }
        }

        if ($installed === []) {
            return [];
        }

        if ($framework === null) {
            return array_map(fn (string $slug, array $editor): array => [
                'slug' => $slug,
                'label' => $editor['label'],
            ], array_keys($installed), array_values($installed));
        }

        $frameworkSlug = strtolower(trim($framework));
        $matched = [];
        $universal = [];

        foreach ($installed as $slug => $editor) {
            $frameworks = $editor['frameworks'] ?? [];
            if (in_array($frameworkSlug, $frameworks, true)) {
                $matched[] = ['slug' => $slug, 'label' => $editor['label']];
            } elseif (! empty($editor['universal'])) {
                $universal[] = ['slug' => $slug, 'label' => $editor['label']];
            }
        }

        if ($matched !== []) {
            return [...$matched, ...$universal];
        }

        if ($universal !== []) {
            return $universal;
        }

        return array_map(fn (string $slug, array $editor): array => [
            'slug' => $slug,
            'label' => $editor['label'],
        ], array_keys($installed), array_values($installed));
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

    /**
     * @param  string|list<string>  $name
     */
    private function application(string|array $name): ?string
    {
        if (PHP_OS_FAMILY !== 'Darwin' && $this->applicationDirectories === null) {
            return null;
        }

        $names = is_array($name) ? $name : [$name];

        foreach ($this->applicationDirectories ?? $this->defaultApplicationDirectories() as $directory) {
            foreach ($names as $candidate) {
                if (is_dir("{$directory}/{$candidate}.app")) {
                    return "{$directory}/{$candidate}.app";
                }
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
