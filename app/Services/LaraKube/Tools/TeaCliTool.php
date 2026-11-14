<?php

namespace App\Services\LaraKube\Tools;

class TeaCliTool extends AbstractCliTool
{
    public function slug(): string
    {
        return 'tea';
    }

    public function label(): string
    {
        return 'Tea CLI';
    }

    public function purpose(): string
    {
        return 'Manages Forgejo and Gitea git forge repository secrets.';
    }

    public function localOnly(): bool
    {
        return true;
    }
}
