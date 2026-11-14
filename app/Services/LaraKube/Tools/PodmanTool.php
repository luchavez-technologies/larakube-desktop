<?php

namespace App\Services\LaraKube\Tools;

use App\Services\LaraKube\ToolLocator;

class PodmanTool extends AbstractCliTool
{
    public function slug(): string
    {
        return 'podman';
    }

    public function label(): string
    {
        return 'Podman';
    }

    public function purpose(): string
    {
        return 'Builds your apps to deploy them, instead of Docker.';
    }

    public function localOnly(): bool
    {
        return true;
    }

    public function isInstallable(ToolLocator $locator): bool
    {
        // Podman installs through apt, so only Linux (and WSL) can offer it.
        return PHP_OS_FAMILY === 'Linux';
    }

    public function installArguments(bool $update = false): array
    {
        $args = ['runtime:install', '--runtime=podman'];

        if ($update) {
            $args[] = '--update';
        }

        return $args;
    }
}
