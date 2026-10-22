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
    /** @var array<string, array{label: string, app?: string|list<string>, cli?: string, terminal?: bool, category?: 'editor'|'agent', universal?: bool, languages?: list<string>, frameworks?: list<string>}> */
    public const EDITORS = [
        'antigravity' => [
            'label' => 'Antigravity',
            'app' => 'Antigravity',
            'cli' => 'agy',
            'universal' => true,
            'category' => 'agent',
        ],
        'claude' => [
            'label' => 'Claude Desktop',
            'app' => 'Claude',
            'universal' => true,
            'category' => 'agent',
        ],
        'claude-code' => [
            'label' => 'Claude Code (CLI)',
            'cli' => 'claude',
            'terminal' => true,
            'universal' => true,
            'category' => 'agent',
        ],
        'opencode' => [
            'label' => 'OpenCode',
            'app' => 'OpenCode',
            'cli' => 'opencode',
            'universal' => true,
            'category' => 'agent',
        ],
        'chatgpt' => [
            'label' => 'ChatGPT / Codex',
            'app' => ['ChatGPT', 'Codex'],
            'cli' => 'codex',
            'universal' => true,
            'category' => 'agent',
        ],
        'cursor' => [
            'label' => 'Cursor',
            'app' => 'Cursor',
            'cli' => 'cursor',
            'universal' => true,
            'category' => 'editor',
        ],
        'windsurf' => [
            'label' => 'Windsurf',
            'app' => 'Windsurf',
            'cli' => 'windsurf',
            'universal' => true,
            'category' => 'editor',
        ],
        'vscode' => [
            'label' => 'VS Code',
            'app' => 'Visual Studio Code',
            'cli' => 'code',
            'universal' => true,
            'category' => 'editor',
        ],
        'phpstorm' => [
            'label' => 'PhpStorm',
            'app' => 'PhpStorm',
            'cli' => 'phpstorm',
            'languages' => ['php'],
            'frameworks' => ['laravel', 'statamic', 'wordpress', 'bedrock'],
            'category' => 'editor',
        ],
        'zed' => [
            'label' => 'Zed',
            'app' => 'Zed',
            'cli' => 'zed',
            'universal' => true,
            'category' => 'editor',
        ],
        'sublime' => [
            'label' => 'Sublime Text',
            'app' => 'Sublime Text',
            'cli' => 'subl',
            'universal' => true,
            'category' => 'editor',
        ],
        'pycharm' => [
            'label' => 'PyCharm',
            'app' => ['PyCharm', 'PyCharm CE'],
            'cli' => 'pycharm',
            'languages' => ['python'],
            'frameworks' => ['django', 'fastapi'],
            'category' => 'editor',
        ],
        'webstorm' => [
            'label' => 'WebStorm',
            'app' => 'WebStorm',
            'cli' => 'webstorm',
            'languages' => ['javascript', 'typescript'],
            'frameworks' => ['nextjs', 'next', 'react', 'vue', 'vite', 'astro', 'docusaurus', 'nestjs', 'adonisjs'],
            'category' => 'editor',
        ],
        'goland' => [
            'label' => 'GoLand',
            'app' => 'GoLand',
            'cli' => 'goland',
            'languages' => ['go'],
            'frameworks' => ['gin'],
            'category' => 'editor',
        ],
        'rustrover' => [
            'label' => 'RustRover',
            'app' => 'RustRover',
            'cli' => 'rustrover',
            'languages' => ['rust'],
            'frameworks' => ['axum'],
            'category' => 'editor',
        ],
        'rubymine' => [
            'label' => 'RubyMine',
            'app' => 'RubyMine',
            'cli' => 'rubymine',
            'languages' => ['ruby'],
            'frameworks' => ['rails'],
            'category' => 'editor',
        ],
        'rider' => [
            'label' => 'Rider',
            'app' => 'Rider',
            'cli' => 'rider',
            'languages' => ['csharp', 'dotnet'],
            'frameworks' => ['dotnet'],
            'category' => 'editor',
        ],
        'idea' => [
            'label' => 'IntelliJ IDEA',
            'app' => ['IntelliJ IDEA', 'IntelliJ IDEA CE'],
            'cli' => 'idea',
            'languages' => ['java', 'kotlin'],
            'frameworks' => ['springboot'],
            'category' => 'editor',
        ],
    ];

    /**
     * @param  list<string>|null  $applicationDirectories
     */
    public function __construct(private ToolLocator $locator, private ?array $applicationDirectories = null) {}

    /**
     * @return list<array{slug: string, label: string, category: 'editor'|'agent'}>
     */
    public function available(?string $framework = null): array
    {
        $installed = [];

        foreach (self::EDITORS as $slug => $editor) {
            $hasApp = isset($editor['app']) && $this->application($editor['app']) !== null;
            $hasCli = isset($editor['cli']) && $this->locator->find($editor['cli']) !== null;

            if ($hasApp || $hasCli) {
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
                'category' => ($editor['category'] ?? 'editor') === 'agent' ? 'agent' : 'editor',
            ], array_keys($installed), array_values($installed));
        }

        $frameworkSlug = strtolower(trim($framework));
        $matched = [];
        $universal = [];

        foreach ($installed as $slug => $editor) {
            $frameworks = is_array($editor['frameworks'] ?? null) ? $editor['frameworks'] : [];
            /** @var 'agent'|'editor' $category */
            $category = ($editor['category'] ?? 'editor') === 'agent' ? 'agent' : 'editor';
            $item = [
                'slug' => $slug,
                'label' => $editor['label'],
                'category' => $category,
            ];

            if (in_array($frameworkSlug, $frameworks, true)) {
                $matched[] = $item;
            } elseif (! empty($editor['universal'])) {
                $universal[] = $item;
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
            'category' => ($editor['category'] ?? 'editor') === 'agent' ? 'agent' : 'editor',
        ], array_keys($installed), array_values($installed));
    }

    public function open(string $slug, string $path): bool
    {
        $editor = self::EDITORS[$slug] ?? null;

        if ($editor === null || ! is_dir($path)) {
            return false;
        }

        if (! empty($editor['terminal'])) {
            $cli = $this->locator->find($editor['cli']);
            if ($cli === null) {
                return false;
            }
            $escaped = escapeshellarg($path);

            return app(TerminalLauncher::class)->open("cd {$escaped} && {$cli}");
        }

        $application = $this->application($editor['app']);
        $cli = isset($editor['cli']) ? $this->locator->find($editor['cli']) : null;

        if ($application !== null) {
            return Process::env(['PATH' => $this->locator->path()])->timeout(30)->run(['open', '-a', $application, $path])->successful();
        }

        if ($cli !== null) {
            if ($editor['category'] === 'agent') {
                $escaped = escapeshellarg($path);

                return app(TerminalLauncher::class)->open("cd {$escaped} && {$cli}");
            }

            return Process::env(['PATH' => $this->locator->path()])->timeout(30)->run([$cli, $path])->successful();
        }

        return false;
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
