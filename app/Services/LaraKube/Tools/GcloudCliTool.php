<?php

namespace App\Services\LaraKube\Tools;

class GcloudCliTool extends AbstractCliTool
{
    public function slug(): string
    {
        return 'gcloud';
    }

    public function label(): string
    {
        return 'Google Cloud CLI';
    }

    public function purpose(): string
    {
        return 'Needed for Google Cloud servers.';
    }

    public function provider(): ?string
    {
        return 'gcp';
    }

    public function runsOnWindowsHost(): bool
    {
        return true;
    }
}
