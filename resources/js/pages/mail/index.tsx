import { Head, Link, router } from '@inertiajs/react';
import { useState } from 'react';
import { Globe, Send, Settings, ExternalLink, Inbox } from 'lucide-react';
import { buttonClass } from '@/components/button';
import { open } from '@/routes';
import AppLayout from '@/layouts/app-layout';
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
    serverInfo?: ServerInfo | null;
    domains?: DomainRow[];
    accounts?: {
        accounts: AccountRow[];
        queue: number;
    };
};

type TabType = 'mailboxes' | 'domains' | 'relay' | 'settings';

export default function MailIndex({
    server,
    servers,
    isInstalled,
    serverInfo,
    domains = [],
    accounts = { accounts: [], queue: 0 },
}: Props) {
    const [activeTab, setActiveTab] = useState<TabType>('mailboxes');

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
            count: accounts.accounts.length,
        },
        {
            id: 'domains',
            label: 'Domains & DNS',
            icon: Globe,
            count: domains.length,
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
                        </div>
                        <p className="mt-1 text-xs text-soft">
                            High-performance JMAP/IMAP mailboxes and delivery
                            infrastructure.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <label className="flex h-9 items-center gap-2.5 rounded-lg bg-surface px-3 ring-1 ring-line">
                            <span className="text-xs text-soft">Server</span>
                            <select
                                value={server.name}
                                onChange={(e) =>
                                    router.visit(
                                        `/servers/${e.target.value}/mail`,
                                    )
                                }
                                className="text-foreground bg-transparent text-[13px] font-medium outline-none"
                            >
                                {servers.map((candidate) => (
                                    <option
                                        key={candidate.name}
                                        value={candidate.name}
                                    >
                                        {candidate.name}
                                    </option>
                                ))}
                            </select>
                        </label>

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
                        {activeTab === 'mailboxes' && (
                            <MailboxesTab
                                server={server}
                                accounts={accounts.accounts}
                                queue={accounts.queue}
                            />
                        )}

                        {activeTab === 'domains' && (
                            <DomainsTab
                                server={server}
                                domains={domains}
                                serverHost={serverInfo?.host}
                            />
                        )}

                        {activeTab === 'relay' && <RelayTab server={server} />}

                        {activeTab === 'settings' && (
                            <SettingsTab server={server} info={serverInfo} />
                        )}
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
