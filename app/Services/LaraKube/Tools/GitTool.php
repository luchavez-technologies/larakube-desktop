<?php

namespace App\Services\LaraKube\Tools;

class GitTool extends AbstractCliTool
{
    public function slug(): string
    {
        return 'git';
    }

    public function label(): string
    {
        return 'Git';
    }

    public function purpose(): string
    {
        return 'Needed to deploy Laravel apps.';
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
