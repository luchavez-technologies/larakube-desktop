import { Head, usePoll } from '@inertiajs/react';
import { useState } from 'react';
import { Globe, Send, Settings, ExternalLink, Inbox } from 'lucide-react';
import { buttonClass } from '@/components/button';
import ServerSwitcher from '@/components/server-switcher';
import { ExternalLinkButton } from '@/lib/open-external';
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

/** A pulsing placeholder line/block — always on a bg-surface card, never bare on the
 * page background, since bg-paper (the pulse color) is too close to the page's own
 * background to read as a skeleton out there. */
function Pulse({ className }: { className?: string }) {
    return <div className={`animate-pulse rounded-md bg-paper ${className}`} />;
}

function MailboxesSkeleton() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <Pulse className="h-8 w-64 rounded-lg" />
                <Pulse className="h-8 w-32 rounded-lg" />
            </div>
            <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
                <div className="border-b border-line bg-paper/50 px-5 py-3">
                    <Pulse className="h-3 w-40" />
                </div>
                <div className="divide-y divide-line">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div
                            key={i}
                            className="flex items-center gap-4 px-5 py-3.5"
                        >
                            <Pulse className="h-3.5 w-48" />
                            <Pulse className="h-3.5 w-24" />
                            <Pulse className="h-3.5 w-16" />
                            <Pulse className="ml-auto h-7 w-20 rounded-lg" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function DomainsSkeleton() {
    return (
        <div className="space-y-6">
            <Pulse className="h-8 w-48 rounded-lg" />
            <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div
                        key={i}
                        className="flex items-center gap-4 rounded-2xl bg-surface p-5 ring-1 ring-line"
                    >
                        <Pulse className="size-10 shrink-0 rounded-xl" />
                        <div className="flex-1 space-y-2">
                            <Pulse className="h-3.5 w-40" />
                            <Pulse className="h-3 w-56" />
                        </div>
                        <Pulse className="h-7 w-24 rounded-lg" />
                    </div>
                ))}
            </div>
        </div>
    );
}

function RelaySkeleton() {
    return (
        <div className="space-y-6">
            <div className="rounded-2xl bg-surface p-6 ring-1 ring-line">
                <Pulse className="mb-5 h-4 w-56" />
                <div className="space-y-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="space-y-1.5">
                            <Pulse className="h-3 w-28" />
                            <Pulse className="h-9 w-full rounded-lg" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function SettingsSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
                {Array.from({ length: 2 }).map((_, i) => (
                    <div
                        key={i}
                        className="rounded-2xl bg-surface p-6 ring-1 ring-line"
                    >
                        <Pulse className="mb-5 h-4 w-56" />
                        <div className="space-y-3">
                            {Array.from({ length: 3 }).map((_, j) => (
                                <Pulse key={j} className="h-3.5 w-full" />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function MailSkeleton({ tab }: { tab: TabType }) {
    switch (tab) {
        case 'domains':
            return <DomainsSkeleton />;
        case 'relay':
            return <RelaySkeleton />;
        case 'settings':
            return <SettingsSkeleton />;
        default:
            return <MailboxesSkeleton />;
    }
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
                            <ExternalLinkButton
                                url={serverInfo.webmailUrl}
                                className={buttonClass('secondary', 'md')}
                                title="Open Bulwark Webmail in default browser"
                            >
                                <ExternalLink className="h-4 w-4" />
                                <span>Webmail</span>
                            </ExternalLinkButton>
                        )}

                        {isInstalled && serverInfo?.adminUrl && (
                            <ExternalLinkButton
                                url={serverInfo.adminUrl}
                                className={buttonClass('secondary', 'md')}
                                title="Open Stalwart Admin Console in default browser"
                            >
                                <ExternalLink className="h-4 w-4" />
                                <span>Admin Console</span>
                            </ExternalLinkButton>
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
                            <MailSkeleton tab={activeTab} />
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
