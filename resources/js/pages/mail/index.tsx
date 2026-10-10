import { Head, Link, usePoll } from '@inertiajs/react';
import { useState } from 'react';
import { Globe, Send, Settings, ExternalLink, Inbox } from 'lucide-react';
import { buttonClass } from '@/components/button';
import ServerSwitcher from '@/components/server-switcher';
import { open } from '@/routes';
import { index as mailIndex } from '@/routes/servers/mail';
import AppLayout from '@/layouts/app-layout';
import SyncStatusBadge, {
    type SyncStatus,
} from '@/components/sync-status-badge';
import MailEmptyState from './mail-empty-state';
import MailboxesTab, { type AccountRow } from './mailboxes-tab';
import DomainsTab, { type DomainRow } from './domains-tab';
import RelayTab from './relay-tab';
import SettingsTab, { type ServerInfo } from './settings-tab';
import type { Server } from '@/types/larakube';

type Props = {
    server: Server;
    servers: Server[];
    isInstalled: boolean;
    hasSso?: boolean;
    serverInfo?: ServerInfo | null;
    domains?: DomainRow[];
    accounts?: {
        accounts: AccountRow[];
        queue: number;
    };
    mailSync: {
        status: SyncStatus;
        lastSyncedAt: string | null;
        error: string | null;
    };
};

type TabType = 'mailboxes' | 'domains' | 'relay' | 'settings';

function MailboxesSkeleton() {
    return (
        <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
                <div
                    key={i}
                    className="h-14 animate-pulse rounded-xl bg-paper"
                />
            ))}
        </div>
    );
}

export default function MailIndex({
    server,
    servers,
    isInstalled,
    hasSso = false,
    serverInfo,
    domains,
    accounts,
    mailSync,
}: Props) {
    const [activeTab, setActiveTab] = useState<TabType>('mailboxes');

    usePoll(
        2000,
        { only: ['serverInfo', 'domains', 'accounts', 'mailSync'] },
        { autoStart: isInstalled && mailSync.status === 'syncing' },
    );

    // Deferred props arrive as undefined until the follow-up request lands — show a
    // skeleton instead of silently defaulting to empty and popping in once real data lands.
    const loading =
        isInstalled &&
        (serverInfo === undefined ||
            domains === undefined ||
            accounts === undefined);

    const resolvedDomains = domains ?? [];
    const resolvedAccounts = accounts ?? { accounts: [], queue: 0 };

    const tabs: Array<{
        id: TabType;
        label: string;
        icon: typeof Inbox;
        count?: number;
    }> = [
        {
            id: 'mailboxes',
            label: 'Mailboxes',
            icon: Inbox,
            count: resolvedAccounts.accounts.length,
        },
        {
            id: 'domains',
            label: 'Domains & DNS',
            icon: Globe,
            count: resolvedDomains.length,
        },
        {
            id: 'relay',
            label: 'Outbound Relay',
            icon: Send,
        },
        {
            id: 'settings',
            label: 'Settings & Access',
            icon: Settings,
        },
    ];

    return (
        <AppLayout title={`Mail · ${server.name}`}>
            <Head title={`Mail · ${server.name}`} />

            <div className="mx-auto max-w-7xl space-y-6">
                {/* Header with Server Switcher */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold tracking-tight text-ink">
                                Mail Management
                            </h1>
                            {isInstalled && (
                                <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                                    Stalwart Active
                                </span>
                            )}
                            {isInstalled && (
                                <SyncStatusBadge
                                    status={mailSync.status}
                                    lastSyncedAt={mailSync.lastSyncedAt}
                                    error={mailSync.error}
                                    subject="mail"
                                />
                            )}
                        </div>
                        <p className="mt-1 text-xs text-soft">
                            High-performance JMAP/IMAP mailboxes and delivery
                            infrastructure.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <ServerSwitcher
                            servers={servers}
                            value={server.name}
                            buildHref={(name) => mailIndex(name).url}
                        />

                        {isInstalled && serverInfo?.webmailUrl && (
                            <Link
                                href={open().url}
                                method="post"
                                data={{ url: serverInfo.webmailUrl }}
                                as="button"
                                className={buttonClass('secondary', 'md')}
                                title="Open Bulwark Webmail in default browser"
                            >
                                <ExternalLink className="h-4 w-4" />
                                Webmail
                            </Link>
                        )}

                        {isInstalled && serverInfo?.adminUrl && (
                            <Link
                                href={open().url}
                                method="post"
                                data={{ url: serverInfo.adminUrl }}
                                as="button"
                                className={buttonClass('secondary', 'md')}
                                title="Open Stalwart Admin Console in default browser"
                            >
                                <ExternalLink className="h-4 w-4" />
                                Admin Console
                            </Link>
                        )}
                    </div>
                </div>

                {!isInstalled ? (
                    <MailEmptyState
                        server={server}
                        otherServers={servers.filter(
                            (s) =>
                                s.name !== server.name && s.status === 'ready',
                        )}
                    />
                ) : (
                    <div className="space-y-6">
                        {/* Tab Navigation */}
                        <div className="flex border-b border-line">
                            <div className="flex gap-2">
                                {tabs.map((tab) => {
                                    const Icon = tab.icon;
                                    const isActive = activeTab === tab.id;

                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            className={`relative flex items-center gap-2 px-4 py-3 text-xs font-medium transition ${
                                                isActive
                                                    ? 'text-brand'
                                                    : 'text-soft hover:text-ink'
                                            }`}
                                        >
                                            <Icon className="h-4 w-4" />
                                            <span>{tab.label}</span>
                                            {typeof tab.count === 'number' && (
                                                <span
                                                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                                        isActive
                                                            ? 'bg-brand/10 text-brand'
                                                            : 'text-muted bg-paper'
                                                    }`}
                                                >
                                                    {tab.count}
                                                </span>
                                            )}
                                            {isActive && (
                                                <div className="absolute inset-x-0 bottom-0 h-0.5 bg-brand" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Active Tab Content */}
                        {loading ? (
                            <MailboxesSkeleton />
                        ) : (
                            <>
                                {activeTab === 'mailboxes' && (
                                    <MailboxesTab
                                        server={server}
                                        accounts={resolvedAccounts.accounts}
                                        queue={resolvedAccounts.queue}
                                        hasSso={hasSso}
                                    />
                                )}

                                {activeTab === 'domains' && (
                                    <DomainsTab
                                        server={server}
                                        domains={resolvedDomains}
                                        serverHost={serverInfo?.host}
                                    />
                                )}

                                {activeTab === 'relay' && (
                                    <RelayTab
                                        server={server}
                                        relay={serverInfo?.relay}
                                    />
                                )}

                                {activeTab === 'settings' && (
                                    <SettingsTab
                                        server={server}
                                        info={serverInfo}
                                    />
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
