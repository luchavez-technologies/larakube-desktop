<?php

namespace App\Services\LaraKube\Tools;

class KubectlTool extends AbstractCliTool
{
    public function slug(): string
    {
        return 'kubectl';
    }

    public function label(): string
    {
        return 'kubectl';
    }

    public function purpose(): string
    {
        return 'Talks to your Kubernetes clusters.';
    }

    public function required(): bool
    {
        return true;
    }

    public function versionArgs(): array
    {
        return ['version', '--client'];
    }

    public function runsOnWindowsHost(): bool
    {
        return true;
    }
}
