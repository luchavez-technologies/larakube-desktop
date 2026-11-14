<?php

namespace App\Services\LaraKube\Tools;

class OpenTofuTool extends AbstractCliTool
{
    public function slug(): string
    {
        return 'tofu';
    }

    public function label(): string
    {
        return 'OpenTofu';
    }

    public function purpose(): string
    {
        return 'Provisions new cloud servers.';
    }

    public function required(): bool
    {
        return true;
    }

    public function versionArgs(): array
    {
        return ['version'];
    }

    public function runsOnWindowsHost(): bool
    {
        return true;
    }
}
