<?php

namespace App\Enums;

/**
 * Which slice of a server's synced data just changed. Carried by
 * ServerDataSynced so each page reloads only for the data it shows
 * (docs/decisions/0021-push-data-changes-to-the-ui.md).
 */
enum ServerDataScope: string
{
    case Tools = 'tools';
    case Mail = 'mail';
    case Drive = 'drive';
    case OpenBao = 'openbao';
    case Sso = 'sso';
    case Plex = 'plex';
    case Backups = 'backups';
    case Domains = 'domains';
    case ExternalDns = 'external-dns';
    case Tls = 'tls';
    case ClusterUsers = 'cluster-users';
}
