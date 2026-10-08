<?php

namespace App\Enums;

enum ActivityType: string
{
    case ServerFirstSynced = 'server-first-synced';
    case ServerSyncFailed = 'server-sync-failed';
    case ServerSyncRecovered = 'server-sync-recovered';

    case ToolFirstSynced = 'tool-first-synced';
    case ToolInstalled = 'tool-installed';
    case ToolRemoved = 'tool-removed';
    case ToolSyncFailed = 'tool-sync-failed';

    case MailDeployed = 'mail-deployed';
    case MailAccountCreated = 'mail-account-created';
    case MailAccountDeleted = 'mail-account-deleted';
    case MailDomainAdded = 'mail-domain-added';
    case MailRelayConfigured = 'mail-relay-configured';
    case MailSyncFailed = 'mail-sync-failed';
}
