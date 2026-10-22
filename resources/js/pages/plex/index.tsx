import { Link, usePoll } from '@inertiajs/react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import {
    Code2,
    ExternalLink,
    KeyRound,
    LayoutGrid,
    Network,
    Plus,
    RotateCw,
    Server as ServerIcon,
    Shield,
} from 'lucide-react';
import Button, { buttonClass } from '@/components/button';
import Card from '@/components/card';
import ServerSwitcher from '@/components/server-switcher';
import SyncStatusBadge, {
    type SyncStatus,
} from '@/components/sync-status-badge';
import AppLayout from '@/layouts/app-layout';
import { isLocalServer } from '@/lib/servers';
import { cn } from '@/lib/utils';
import { show as showServer } from '@/routes/servers';
import { index as plexIndex, refresh } from '@/routes/servers/plex';
import type {
    CompanionApp,
    NodeMetrics,
    PlexCommonsServicesReport,
    PlexServiceCategoryDetail,
    PlexServiceOptionDetail,
    PlexStatus,
    PlexTenant,
    PodMetrics,
    Server,
} from '@/types/larakube';
import PlexAddEngineModal from './components/plex-add-engine-modal';
import PlexHeroKpiBar from './components/plex-hero-kpi-bar';
import PlexProvisionModal from './components/plex-provision-modal';
import PlexQuickConnectModal from './components/plex-quick-connect-modal';
import PlexServiceEngineCard from './components/plex-service-engine-card';
import PlexTenantHub from './components/plex-tenant-hub';
import PlexTopologyCanvas from './components/topology/plex-topology-canvas';
import type { TopologyProject } from './components/topology/types';
import PlexEmptyState from './plex-empty-state';

function PlexPageHeader({
    server,
    servers,
    badge,
    onOpenProvision,
    onOpenQuickConnect,
    onOpenAddEngine,
}: {
    server: Server;
    servers: Server[];
    badge?: ReactNode;
    onOpenProvision?: () => void;
    onOpenQuickConnect?: () => void;
    onOpenAddEngine?: () => void;
}) {
    return (
        <header className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
            <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                    <h1 className="truncate text-[28px] leading-tight font-semibold tracking-[-0.03em] text-ink">
                        Plex Commons
                    </h1>
                    {badge}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-soft">
                    Shared backing infrastructure backbone — powering tenant
                    apps, cluster tools, and devboxes.
                </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
                <ServerSwitcher
                    servers={servers}
                    value={server.name}
                    buildHref={(name) => plexIndex(name).url}
                />

                {onOpenQuickConnect && (
                    <Button
                        variant="secondary"
                        size="md"
                        onClick={onOpenQuickConnect}
                        title="View cluster connection snippets and .env blocks"
                    >
                        <Code2 className="size-3.5" />
                        <span>Quick Connect</span>
                    </Button>
                )}

                {onOpenAddEngine && (
                    <Button
                        variant="secondary"
                        size="md"
                        onClick={onOpenAddEngine}
                        title="Add companion engines like Meilisearch, MySQL, or MinIO"
                    >
                        <Plus className="size-3.5" />
                        <span>Add Engine</span>
                    </Button>
                )}

                {onOpenProvision && (
                    <Button
                        variant="secondary"
                        size="md"
                        onClick={onOpenProvision}
                        title="Provision custom credentials for an external workload"
                    >
                        <KeyRound className="size-3.5" />
                        <span>Provision Tenant</span>
                    </Button>
                )}

                <Link
                    href={refresh(server.name).url}
                    method="post"
                    as="button"
                    className={buttonClass('secondary', 'md', 'px-2.5')}
                    title="Refresh status from cluster"
                >
                    <RotateCw className="size-3.5" />
                    <span className="sr-only">Refresh</span>
                </Link>

                <Link
                    href={showServer(server.name).url}
                    className={buttonClass('secondary', 'md', 'px-2.5')}
                    title={`Open ${server.name} in Servers`}
                >
                    <ExternalLink className="size-3.5" />
                    <span className="sr-only">Open server</span>
                </Link>
            </div>
        </header>
    );
}

export default function PlexIndex({
    server,
    servers,
    projects = [],
    plex,
    plexSync,
    services,
    podMetrics,
    nodeMetrics,
    companions,
}: {
    server: Server;
    servers: Server[];
    projects?: TopologyProject[];
    plex?: PlexStatus | null;
    plexSync: {
        status: SyncStatus;
        lastSyncedAt: string | null;
        error: string | null;
    };
    services?: PlexCommonsServicesReport | null;
    podMetrics?: PodMetrics | null;
    nodeMetrics?: NodeMetrics | null;
    companions?: CompanionApp[] | null;
}) {
    const awaitingFirstSync = plex === null && plexSync.status !== 'error';
    const isLocal = isLocalServer(server);

    usePoll(
        2000,
        { only: ['plex', 'services', 'plexSync', 'podMetrics', 'nodeMetrics'] },
        { autoStart: plexSync.status === 'syncing' || awaitingFirstSync },
    );

    // View mode: Grid vs Topology Map
    const [viewMode, setViewMode] = useState<'grid' | 'topology'>('grid');

    // Modal and filter states
    const [activeEngineFilter, setActiveEngineFilter] = useState<string | null>(
        null,
    );
    const [isProvisionOpen, setIsProvisionOpen] = useState(false);
    const [isAddEngineOpen, setIsAddEngineOpen] = useState(false);
    const [isQuickConnectOpen, setIsQuickConnectOpen] = useState(false);
    const [quickConnectTenant, setQuickConnectTenant] =
        useState<PlexTenant | null>(null);
    const [quickConnectDriver, setQuickConnectDriver] = useState<string | null>(
        null,
    );

    // Handle Quick Connect modal triggers
    const handleOpenQuickConnectForTenant = (tenant: PlexTenant) => {
        setQuickConnectTenant(tenant);
        setQuickConnectDriver(null);
        setIsQuickConnectOpen(true);
    };

    const handleOpenQuickConnectForDriver = (driver: string) => {
        setQuickConnectDriver(driver);
        setQuickConnectTenant(null);
        setIsQuickConnectOpen(true);
    };

    const handleFilterByEngine = (driver: string) => {
        setActiveEngineFilter((current) =>
            current === driver ? null : driver,
        );
        const el = document.getElementById('tenant-hub');
        if (el) {
            el.scrollIntoView({ behavior: 'smooth' });
        }
    };

    // 1. Loading Skeleton State (ADR 0009)
    if (plex === undefined || awaitingFirstSync) {
        return (
            <AppLayout title="Plex Commons">
                <PlexPageHeader server={server} servers={servers} />
                {/* Responsive skeleton shaped like the new Command Center */}
                <div className="space-y-6">
                    {/* Top KPI skeleton */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {[1, 2, 3, 4].map((i) => (
                            <Card
                                key={i}
                                className="h-28 animate-pulse bg-paper/60 p-4.5"
                            >
                                <div className="h-4 w-24 rounded bg-line" />
                                <div className="mt-3 h-7 w-16 rounded bg-line" />
                            </Card>
                        ))}
                    </div>

                    {/* Engines Deck skeleton */}
                    <div>
                        <div className="mb-3 h-5 w-44 animate-pulse rounded bg-line" />
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {[1, 2, 3].map((i) => (
                                <Card
                                    key={i}
                                    className="h-44 animate-pulse bg-paper/60 p-5"
                                >
                                    <div className="h-10 w-10 rounded-xl bg-line" />
                                    <div className="mt-4 h-5 w-32 rounded bg-line" />
                                    <div className="mt-2 h-4 w-48 rounded bg-line" />
                                </Card>
                            ))}
                        </div>
                    </div>

                    {/* Tenant Matrix skeleton */}
                    <Card className="h-72 animate-pulse bg-paper/60 p-6">
                        <div className="h-6 w-56 rounded bg-line" />
                        <div className="mt-4 h-10 w-full rounded bg-line" />
                        <div className="mt-4 space-y-2">
                            {[1, 2, 3].map((i) => (
                                <div
                                    key={i}
                                    className="h-14 rounded-xl bg-line"
                                />
                            ))}
                        </div>
                    </Card>
                </div>
            </AppLayout>
        );
    }

    // 2. Unreachable Error State
    if (plex === null) {
        return (
            <AppLayout title="Plex Commons">
                <PlexPageHeader server={server} servers={servers} />
                <Card label="Plex Commons" tone="error">
                    <div className="flex items-center gap-3 py-2 text-accent">
                        <Shield className="size-5 shrink-0 text-accent" />
                        <p className="text-xs">
                            Couldn&apos;t reach {server.name} to check Plex
                            Commons
                            {plexSync.error ? `: ${plexSync.error}` : '.'}
                        </p>
                    </div>
                </Card>
            </AppLayout>
        );
    }

    const initialized = Boolean(plex.initialized);
    const toolTenants = plex.tenants?.tool ?? [];
    const projectTenants = plex.tenants?.project ?? [];
    const customTenants = plex.tenants?.custom ?? [];
    const allTenants = [...toolTenants, ...projectTenants, ...customTenants];

    // Collect all active service engines across categories
    const activeServiceEntries: {
        category: PlexServiceCategoryDetail;
        option: PlexServiceOptionDetail;
    }[] = [];

    if (services?.categories) {
        for (const cat of services.categories) {
            for (const opt of cat.options) {
                if (opt.enabled) {
                    activeServiceEntries.push({ category: cat, option: opt });
                }
            }
        }
    }

    return (
        <AppLayout title="Plex Commons">
            <PlexPageHeader
                server={server}
                servers={servers}
                badge={
                    initialized && (
                        <SyncStatusBadge
                            status={plexSync.status}
                            lastSyncedAt={plexSync.lastSyncedAt}
                            error={plexSync.error}
                            subject="Commons"
                        />
                    )
                }
                onOpenProvision={
                    initialized ? () => setIsProvisionOpen(true) : undefined
                }
                onOpenQuickConnect={
                    initialized
                        ? () => handleOpenQuickConnectForDriver('')
                        : undefined
                }
                onOpenAddEngine={
                    initialized ? () => setIsAddEngineOpen(true) : undefined
                }
            />

            {!initialized ? (
                <PlexEmptyState server={server} />
            ) : (
                <div className="space-y-7">
                    {/* 1. Hero KPI Bar ("Backbone Vital Signs") */}
                    <PlexHeroKpiBar
                        plex={plex}
                        services={services}
                        podMetrics={podMetrics}
                        nodeMetrics={nodeMetrics}
                    />

                    {/* View Switcher: Services Deck vs Topology Map */}
                    <div className="flex items-center justify-between border-b border-line pb-2">
                        <div className="flex items-center gap-1.5 rounded-xl border border-line bg-paper/60 p-1 shadow-2xs">
                            <button
                                type="button"
                                onClick={() => setViewMode('grid')}
                                className={cn(
                                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                                    viewMode === 'grid'
                                        ? 'bg-surface text-ink shadow-xs ring-1 ring-line'
                                        : 'text-soft hover:text-ink',
                                )}
                            >
                                <LayoutGrid className="size-3.5" />
                                <span>Services & Tenants</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setViewMode('topology')}
                                className={cn(
                                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                                    viewMode === 'topology'
                                        ? 'bg-surface text-brand shadow-xs ring-1 ring-line'
                                        : 'text-soft hover:text-ink',
                                )}
                            >
                                <Network className="size-3.5" />
                                <span>Cluster Topology Map</span>
                            </button>
                        </div>
                    </div>

                    {viewMode === 'topology' ? (
                        <PlexTopologyCanvas
                            server={server}
                            projects={projects}
                            plex={plex}
                            services={services}
                            podMetrics={podMetrics}
                        />
                    ) : (
                        <>
                            {/* 2. Backing Service Engine Deck (Dedicated Cards Grid) */}
                            <div>
                                <div className="mb-3.5 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-xs font-semibold tracking-wider text-soft uppercase">
                                            Active Backing Engines (
                                            {activeServiceEntries.length})
                                        </h2>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setIsAddEngineOpen(true)}
                                        className="text-xs text-soft hover:text-ink"
                                    >
                                        <Plus className="size-3.5" />
                                        <span>Add Engine</span>
                                    </Button>
                                </div>

                                {activeServiceEntries.length === 0 ? (
                                    <Card className="p-8 text-center text-xs text-soft">
                                        <ServerIcon className="mx-auto mb-2 size-8 text-faint" />
                                        No shared service engines are active on
                                        this Commons yet.
                                    </Card>
                                ) : (
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                        {activeServiceEntries.map(
                                            ({ category, option }) => (
                                                <PlexServiceEngineCard
                                                    key={option.driver}
                                                    category={category}
                                                    option={option}
                                                    podMetrics={podMetrics}
                                                    tenants={allTenants}
                                                    onFilterByEngine={
                                                        handleFilterByEngine
                                                    }
                                                    onQuickConnect={
                                                        handleOpenQuickConnectForDriver
                                                    }
                                                    companions={
                                                        isLocal
                                                            ? companions
                                                            : null
                                                    }
                                                />
                                            ),
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* 3. Unified Tenant Ecosystem Hub */}
                            <div id="tenant-hub">
                                <PlexTenantHub
                                    server={server}
                                    toolTenants={toolTenants}
                                    projectTenants={projectTenants}
                                    customTenants={customTenants}
                                    services={services}
                                    activeEngineFilter={activeEngineFilter}
                                    onSelectEngineFilter={setActiveEngineFilter}
                                    onOpenProvisionModal={() =>
                                        setIsProvisionOpen(true)
                                    }
                                    onQuickConnect={
                                        handleOpenQuickConnectForTenant
                                    }
                                />
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Modals & Dialogs */}
            <PlexProvisionModal
                isOpen={isProvisionOpen}
                onClose={() => setIsProvisionOpen(false)}
                server={server}
                services={services}
            />

            <PlexAddEngineModal
                isOpen={isAddEngineOpen}
                onClose={() => setIsAddEngineOpen(false)}
                server={server}
                services={services}
            />

            <PlexQuickConnectModal
                isOpen={isQuickConnectOpen}
                onClose={() => setIsQuickConnectOpen(false)}
                tenant={quickConnectTenant}
                driver={quickConnectDriver}
                services={services}
            />
        </AppLayout>
    );
}
