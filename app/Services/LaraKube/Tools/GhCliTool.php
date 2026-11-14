<?php

namespace App\Services\LaraKube\Tools;

class GhCliTool extends AbstractCliTool
{
    public function slug(): string
    {
        return 'gh';
    }

    public function label(): string
    {
        return 'GitHub CLI';
    }

    public function purpose(): string
    {
        return 'Manages GitHub Actions CI and GHCR image registry secrets.';
    }

    public function localOnly(): bool
    {
        return true;
    }
}
