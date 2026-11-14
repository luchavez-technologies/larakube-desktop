<?php

namespace App\Services\LaraKube\Tools;

class DockerTool extends AbstractCliTool
{
    public function slug(): string
    {
        return 'docker';
    }

    public function label(): string
    {
        return 'Docker';
    }

    public function purpose(): string
    {
        return 'Builds your apps to deploy them. OrbStack or Docker Desktop provide it; Podman works too.';
    }

    public function localOnly(): bool
    {
        return true;
    }

    public function canInstall(): bool
    {
        return false;
    }
}
