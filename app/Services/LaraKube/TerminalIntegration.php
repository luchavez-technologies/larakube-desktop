<?php

namespace App\Services\LaraKube;

use Illuminate\Support\Facades\File;

class TerminalIntegration
{
    public const EXPORT_LINE = 'export PATH="$HOME/.larakube/bin:$PATH"';

    /**
     * Resolve the user's primary shell configuration file (e.g. ~/.zshrc or ~/.bashrc).
     */
    public function profilePath(): string
    {
        $home = ToolLocator::home();
        $shell = (string) (getenv('SHELL') ?: '');

        if (str_contains($shell, 'zsh') || PHP_OS_FAMILY === 'Darwin') {
            return "{$home}/.zshrc";
        }

        return "{$home}/.bashrc";
    }

    /**
     * Check if the ~/.larakube/bin directory is already exported in the shell profile.
     */
    public function isConfigured(): bool
    {
        $home = ToolLocator::home();
        $candidates = [
            "{$home}/.zshrc",
            "{$home}/.bashrc",
            "{$home}/.bash_profile",
            "{$home}/.profile",
        ];

        foreach ($candidates as $candidate) {
            if (File::exists($candidate)) {
                $content = (string) File::get($candidate);
                if (str_contains($content, '.larakube/bin')) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Append the export line to the shell profile.
     *
     * @return array{success: bool, file: string, message: string}
     */
    public function install(): array
    {
        $file = $this->profilePath();

        if ($this->isConfigured()) {
            return [
                'success' => true,
                'file' => $file,
                'message' => 'LaraKube bin directory is already in your shell configuration.',
            ];
        }

        $line = "\n# Added by LaraKube Desktop\n".self::EXPORT_LINE."\n";

        File::append($file, $line);

        return [
            'success' => true,
            'file' => $file,
            'message' => "Added LaraKube bin directory to {$file}.",
        ];
    }
}
