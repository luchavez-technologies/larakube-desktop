<?php

namespace App\Services\LaraKube\Tools;

class K9sTool extends AbstractCliTool
{
    public function slug(): string
    {
        return 'k9s';
    }

    public function label(): string
    {
        return 'k9s';
    }

    public function purpose(): string
    {
        return 'Terminal UI for browsing and managing Kubernetes clusters — optional, but what "Open in Terminal" uses on a server page.';
    }

    public function versionArgs(): array
    {
        return ['version', '--short'];
    }

    public function runsOnWindowsHost(): bool
    {
        return true;
    }
}
