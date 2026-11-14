<?php

namespace App\Services\LaraKube\Tools;

class SshTool extends AbstractCliTool
{
    public function slug(): string
    {
        return 'ssh';
    }

    public function label(): string
    {
        return 'OpenSSH Client';
    }

    public function purpose(): string
    {
        return 'Connects to and configures a VPS cloud:create just provisioned.';
    }

    public function versionArgs(): array
    {
        return ['-V'];
    }

    public function runsOnWindowsHost(): bool
    {
        return true;
    }

    public function canInstall(): bool
    {
        return false;
    }
}
