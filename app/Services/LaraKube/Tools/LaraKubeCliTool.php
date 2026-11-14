<?php

namespace App\Services\LaraKube\Tools;

use App\Services\LaraKube\CliInstaller;
use App\Services\LaraKube\ToolLocator;

class LaraKubeCliTool extends AbstractDirectCliTool
{
    public function slug(): string
    {
        return 'larakube';
    }

    public function label(): string
    {
        return 'LaraKube CLI';
    }

    public function purpose(): string
    {
        return 'Runs every action in this app.';
    }

    public function runsOnWindowsHost(): bool
    {
        return true;
    }

    public function locate(ToolLocator $locator): ?string
    {
        if ($locator->isWindows() && ! $locator->hasExplicitDirectories()) {
            return $locator->nativeWindowsLaraKubePath();
        }

        return $locator->find($this->binary());
    }

    protected function cliCommand(string $channel): array
    {
        return ['cli:install', "--channel={$channel}"];
    }

    protected function downloadUrl(CliInstaller $installer, string $channel): string
    {
        return $installer->downloadUrl($channel);
    }

    protected function executeInstall(CliInstaller $installer, string $channel): array
    {
        return $installer->install($channel);
    }
}
