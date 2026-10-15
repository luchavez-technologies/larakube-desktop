import { Head, usePoll } from '@inertiajs/react';
import { useState } from 'react';
import {
    HardDrive,
    FileText,
    Sparkles,
    Settings,
    ExternalLink,
} from 'lucide-react';
import { buttonClass } from '@/components/button';
import ServerSwitcher from '@/components/server-switcher';
import { ExternalLinkButton } from '@/lib/open-external';
import AppLayout from '@/layouts/app-layout';
import SyncStatusBadge, {
    type SyncStatus,
} from '@/components/sync-status-badge';
import ToolLogo from '@/components/tool-logo';
import DriveEmptyState from './drive-empty-state';
import OverviewTab from './overview-tab';
import OfficeTab from './office-tab';
import ExtensionsTab from './extensions-tab';
import SettingsTab from './settings-tab';
import type {
    DriveExtension,
    DriveServerInfo,
    DriveSyncState,
    Server,
} from '@/types/larakube';

type Props = {
    server: Server;
    servers: Server[];
    isInstalled: boolean;
    serverInfo?: DriveServerInfo | null;
    extensions?: DriveExtension[];
    driveSync: DriveSyncState;
};

type TabType = 'overview' | 'office' | 'extensions' | 'settings';

function Pulse({ className }: { className?: string }) {
    return <div className={`animate-pulse rounded-md bg-paper ${className}`} />;
}

function DriveSkeleton() {
    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-line bg-surface p-6">
                <Pulse className="mb-4 h-6 w-64 rounded-lg" />
                <div className="grid gap-4 sm:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div
                            key={i}
                            className="space-y-2 rounded-xl border border-line bg-paper/50 p-4"
                        >
                            <Pulse className="h-3 w-20" />
                            <Pulse className="h-6 w-32" />
                        </div>
                    ))}
                </div>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-3 rounded-2xl border border-line bg-surface p-6">
                    <Pulse className="h-4 w-40" />
                    <Pulse className="h-10 w-full" />
                    <Pulse className="h-10 w-full" />
                </div>
                <div className="space-y-3 rounded-2xl border border-line bg-surface p-6">
                    <Pulse className="h-4 w-40" />
                    <Pulse className="h-10 w-full" />
                    <Pulse className="h-10 w-full" />
                </div>
            </div>
        </div>
    );
}

export default function DriveIndex({
    server,
    servers,
    isInstalled,
    serverInfo,
    extensions,
    driveSync,
}: Props) {
    const [activeTab, setActiveTab] = useState<TabType>('overview');

    usePoll(
        2000,
        { only: ['serverInfo', 'extensions', 'driveSync'] },
        { autoStart: isInstalled && driveSync.status === 'syncing' },
    );

    const loading =
        isInstalled && (serverInfo === undefined || extensions === undefined);
    const resolvedExtensions = extensions ?? [];
    const host = serverInfo?.host || server.ip || `${server.name}.test`;
    const driveUrl = serverInfo?.url || `https://${host}`;
    const officeUrl = serverInfo?.office?.url;
    const isOfficeReady = Boolean(serverInfo?.office?.ready);

    const otherDriveServers = servers.filter((s) => s.name !== server.name);

    const tabs: Array<{
        id: TabType;
        label: string;
        icon: typeof HardDrive;
        badge?: string | number;
    }> = [
        {
            id: 'overview',
            label: 'Overview',
            icon: HardDrive,
        },
        {
            id: 'office',
            label: 'Office Suite',
            icon: FileText,
            badge: isOfficeReady ? 'Active' : undefined,
        },
        {
            id: 'extensions',
            label: 'Web Extensions',
            icon: Sparkles,
            badge:
                resolvedExtensions.filter((e) => e.installed).length ||
                undefined,
        },
        {
            id: 'settings',
            label: 'Settings',
            icon: Settings,
        },
    ];

    return (
        <AppLayout title={`Drive · ${server.name}`}>
            <Head title={`Drive · ${server.name}`} />

            <div className="mx-auto max-w-7xl space-y-6">
                {/* Header with Server Switcher */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <ToolLogo slug="drive" size="sm" />
                            <h1 className="text-xl font-bold tracking-tight text-ink">
                                Drive Management
                            </h1>
                            {isInstalled && (
                                <span className="inline-flex items-center rounded-md bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-600 ring-1 ring-sky-500/20 dark:text-sky-400">
                                    ownCloud oCIS
                                </span>
                            )}
                            {isInstalled && (
                                <SyncStatusBadge
                                    status={driveSync.status as SyncStatus}
                                    lastSyncedAt={driveSync.lastSyncedAt}
                                    error={driveSync.error}
                                    subject="drive"
                                />
                            )}
                        </div>
                        <p className="mt-1 text-xs text-soft">
                            High-performance Next-Gen Cloud Storage &
                            LibreOffice Document Collaboration.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <ServerSwitcher
                            servers={servers}
                            value={server.name}
                            buildHref={(name) => `/servers/${name}/drive`}
                        />

                        {isInstalled && (
                            <ExternalLinkButton
                                url={driveUrl}
                                className={buttonClass('primary', 'sm')}
                            >
                                <ExternalLink className="h-4 w-4" />
                                Open Drive
                            </ExternalLinkButton>
                        )}

                        {isInstalled && isOfficeReady && officeUrl && (
                            <ExternalLinkButton
                                url={officeUrl}
                                className={buttonClass('secondary', 'sm')}
                            >
                                <ExternalLink className="h-4 w-4" />
                                Open Collabora
                            </ExternalLinkButton>
                        )}
                    </div>
                </div>

                {!isInstalled ? (
                    <DriveEmptyState
                        server={server}
                        otherServers={otherDriveServers}
                    />
                ) : (
                    <>
                        {/* Tab Bar */}
                        <div className="border-b border-line">
                            <nav
                                className="-mb-px flex gap-6"
                                aria-label="Tabs"
                            >
                                {tabs.map((tab) => {
                                    const Icon = tab.icon;
                                    const isActive = activeTab === tab.id;

                                    return (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => setActiveTab(tab.id)}
                                            className={`group inline-flex cursor-pointer items-center gap-2 border-b-2 px-1 py-3 text-xs font-medium transition ${
                                                isActive
                                                    ? 'border-brand text-brand'
                                                    : 'border-transparent text-soft hover:border-line hover:text-ink'
                                            }`}
                                        >
                                            <Icon
                                                className={`h-4 w-4 ${
                                                    isActive
                                                        ? 'text-brand'
                                                        : 'text-muted group-hover:text-soft'
                                                }`}
                                            />
                                            <span>{tab.label}</span>
                                            {tab.badge !== undefined && (
                                                <span
                                                    className={`py-0.2 rounded-full px-1.5 text-[10px] font-semibold ${
                                                        isActive
                                                            ? 'bg-brand/10 text-brand'
                                                            : 'text-muted bg-paper ring-1 ring-line'
                                                    }`}
                                                >
                                                    {tab.badge}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </nav>
                        </div>

                        {/* Tab Content */}
                        {loading ? (
                            <DriveSkeleton />
                        ) : (
                            <>
                                {activeTab === 'overview' && (
                                    <OverviewTab
                                        server={server}
                                        info={serverInfo}
                                        extensionsCount={
                                            resolvedExtensions.filter(
                                                (e) => e.installed,
                                            ).length
                                        }
                                    />
                                )}

                                {activeTab === 'office' && (
                                    <OfficeTab
                                        server={server}
                                        office={serverInfo?.office}
                                        driveHost={serverInfo?.host}
                                    />
                                )}

                                {activeTab === 'extensions' && (
                                    <ExtensionsTab
                                        server={server}
                                        extensions={resolvedExtensions}
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
                    </>
                )}
            </div>
        </AppLayout>
    );
}
