<?php

namespace App\Enums;

enum RunKind: string
{
    case CreateServer = 'create-server';
    case DestroyServer = 'destroy-server';
    /** A local command-line tool (kubectl, OpenTofu, …) installed from Setup. */
    case InstallTool = 'install-tool';
    case InstallClusterTool = 'install-cluster-tool';
    case RemoveClusterTool = 'remove-cluster-tool';

    public function changesClusterTools(): bool
    {
        return $this === self::InstallClusterTool || $this === self::RemoveClusterTool;
    }
}
