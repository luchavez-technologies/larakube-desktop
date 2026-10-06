<?php

namespace App\Enums;

enum RunKind: string
{
    case CreateServer = 'create-server';
    case DestroyServer = 'destroy-server';
    /** A server made as a development machine with devbox:create. */
    case CreateDevBox = 'create-dev-box';
    /** A new app scaffolded on a dev box over SSH. */
    case NewDevBoxProject = 'new-dev-box-project';
    /** Public names for an app on a dev box under the person's own Cloudflare domain (`share`), and taking them down (`share:remove`). */
    /** Up, down, start or stop of an app on a dev box, run there over SSH. */
    case OperateDevBoxProject = 'operate-dev-box-project';
    case ShareDomainDevBoxProject = 'share-domain-dev-box-project';
    case RemoveDomainDevBoxProject = 'remove-domain-dev-box-project';
    /** The LaraKube CLI on a dev box, installed again from the channel Desktop uses. */
    case UpdateDevBoxCli = 'update-dev-box-cli';
    /** A server made with cloud:create, rebooted over SSH. */
    case RestartServer = 'restart-server';
    /** A local command-line tool (kubectl, OpenTofu, …) installed from Setup. */
    case InstallTool = 'install-tool';
    /** The CLI's local setup (container runtime and a local k3s cluster), run with temporary passwordless sudo. */
    case SetupLocal = 'setup-local';
    /** Backups on a server: destination, schedule, a backup now, checking and restoring one, clearing old ones. */
    case BackupInit = 'backup-init';
    case BackupSchedule = 'backup-schedule';
    case BackupUnschedule = 'backup-unschedule';
    case BackupRun = 'backup-run';
    case BackupCheck = 'backup-check';
    case BackupRestore = 'backup-restore';
    case BackupPrune = 'backup-prune';
    case InstallClusterTool = 'install-cluster-tool';
    case RemoveClusterTool = 'remove-cluster-tool';
    case ConnectDomain = 'connect-domain';
    case EnableSsl = 'enable-ssl';
    /** A brand-new app scaffolded by one of the CLI's `*:new` commands. */
    case NewProject = 'new-project';
    case CloneProject = 'clone-project';
    case CloneDevBoxProject = 'clone-dev-box-project';
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
    /** Experimental: a development workspace (browser editor and a clone of a repository) on a server. */
    case WorkspaceCreate = 'workspace-create';
    case WorkspaceSuspend = 'workspace-suspend';
    case WorkspaceResume = 'workspace-resume';
    case WorkspaceRemove = 'workspace-remove';
    /** A tunnel from this computer to a workspace editor. Runs until it is stopped. */
    case WorkspaceOpen = 'workspace-open';

    public function changesBackups(): bool
    {
        return in_array($this, [self::BackupInit, self::BackupSchedule, self::BackupUnschedule, self::BackupRun, self::BackupRestore, self::BackupPrune], true);
    }

    public function changesClusterTools(): bool
    {
        return in_array($this, [self::InstallClusterTool, self::RemoveClusterTool, self::ConnectDomain], true);
    }
}
