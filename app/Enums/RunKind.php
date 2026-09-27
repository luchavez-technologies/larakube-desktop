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
    case ConnectDomain = 'connect-domain';
    case EnableSsl = 'enable-ssl';

    public function changesClusterTools(): bool
    {
        return in_array($this, [self::InstallClusterTool, self::RemoveClusterTool, self::ConnectDomain], true);
    }
}
