<?php

namespace App\Services\LaraKube\Tools;

class AwsCliTool extends AbstractCliTool
{
    public function slug(): string
    {
        return 'aws';
    }

    public function label(): string
    {
        return 'AWS CLI';
    }

    public function purpose(): string
    {
        return 'Needed for Amazon Web Services servers.';
    }

    public function provider(): ?string
    {
        return 'aws';
    }

    public function runsOnWindowsHost(): bool
    {
        return true;
    }
}
