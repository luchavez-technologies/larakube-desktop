<?php

namespace App\Services\LaraKube\Tools;

use App\Services\LaraKube\CliInstaller;
use App\Services\LaraKube\ToolLocator;

class LaraKubeWslCliTool extends AbstractDirectCliTool
{
    public function slug(): string
    {
        return 'larakube-wsl';
    }

    public function binary(): string
    {
        return 'larakube';
    }

    public function label(): string
    {
        return 'LaraKube CLI';
    }

    public function purpose(): string
    {
        return 'Runs local Kubernetes and project commands inside WSL.';
    }

    public function localOnly(): bool
    {
        return true;
    }

    public function windowsOnly(): bool
    {
        return true;
    }

    public function locate(ToolLocator $locator): ?string
    {
        return $locator->findInWslDistro($this->binary());
    }

    protected function targetName(): string
    {
        return 'LaraKube CLI (WSL)';
    }

    protected function runEnvironment(): string
    {
        return 'wsl';
    }

    protected function cliCommand(string $channel): array
    {
        return ['cli:install', '--wsl', "--channel={$channel}"];
    }

    protected function downloadUrl(CliInstaller $installer, string $channel): string
    {
        return $installer->linuxCacheDownloadUrl($channel);
    }

    protected function executeInstall(CliInstaller $installer, string $channel): array
    {
        return $installer->installWsl($channel);
    }
}
