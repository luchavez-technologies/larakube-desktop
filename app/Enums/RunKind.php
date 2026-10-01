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
    /** A brand-new app scaffolded by one of the CLI's `*:new` commands. */
    case NewProject = 'new-project';
    case InitProject = 'init-project';
    /** A cloud environment created with `env`, bound to an existing server. */
    case LinkServer = 'link-server';
    case ConfigureHost = 'configure-host';
    case DeployApp = 'deploy-app';
    case UpProject = 'up-project';
    case DownProject = 'down-project';
    case StartProject = 'start-project';
    case StopProject = 'stop-project';
    case PlexInit = 'plex-init';
    case PlexStart = 'plex-start';
    case PlexStop = 'plex-stop';
    case PlexJoin = 'plex-join';
    case PlexLeave = 'plex-leave';
    case ContextImport = 'context-import';
    case ContextSwitch = 'context-switch';
    case ContextBackup = 'context-backup';
    case ContextRestore = 'context-restore';
    case ContextRemove = 'context-remove';
    case ClusterGrant = 'cluster-grant';
    case ClusterRevoke = 'cluster-revoke';
    case CompanionAdd = 'companion-add';
    case CompanionRemove = 'companion-remove';
    case CompanionStart = 'companion-start';
    case CompanionStop = 'companion-stop';
    case CloudAuth = 'cloud-auth';

    public function changesClusterTools(): bool
    {
        return in_array($this, [self::InstallClusterTool, self::RemoveClusterTool, self::ConnectDomain], true);
    }
}
