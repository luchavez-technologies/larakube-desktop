import { Deferred, Form, Link, usePoll } from '@inertiajs/react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import {
    ExternalLink,
    RotateCw,
    Activity,
    Shield,
    Database,
    KeyRound,
    Trash2,
} from 'lucide-react';
import Button, { buttonClass } from '@/components/button';
import Card from '@/components/card';
import ServerSwitcher from '@/components/server-switcher';
import PlexCommonsServicesCard from '@/components/plex-commons-services-card';
import SyncStatusBadge, {
    type SyncStatus,
} from '@/components/sync-status-badge';
import ToolLogo from '@/components/tool-logo';
import AppLayout from '@/layouts/app-layout';
import { show as showServer } from '@/routes/servers';
import { index as plexIndex, refresh, provision } from '@/routes/servers/plex';
import {
    evict as evictTenant,
    rotate as rotateTenant,
} from '@/routes/servers/plex/tenants';
import type {
    PlexCommonsServicesReport,
    PlexStatus,
    PlexTenant,
    PodMetrics,
    Server,
} from '@/types/larakube';
import PlexEmptyState from './plex-empty-state';

const ROTATION_LABEL: Record<string, { label: string; tone: string }> = {
    manual: { label: 'Manual (.env)', tone: 'text-soft' },
    unreachable: { label: 'Unreachable', tone: 'text-amber-500' },
    managed: { label: 'OpenBao-managed', tone: 'text-emerald-500' },
};

function EvictConfirmDialog({
    server,
    tenant,
    onCancel,
}: {
    server: Server;
    tenant: PlexTenant;
    onCancel: () => void;
}) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-6"
            onClick={onCancel}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-[440px] rounded-2xl bg-surface p-7 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <h2 className="text-xl font-semibold tracking-[-0.02em]">
                    Evict {tenant.name}?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-soft">
                    Frees its database, S3 bucket, and Redis index on this
                    Commons. A safety backup is taken first. For the orphaned-
                    tenant case — if the project still exists, use plex:leave
                    from it instead.
                </p>
                <div className="mt-5 flex justify-end gap-2.5">
                    <Button variant="secondary" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Form
                        action={
                            evictTenant({
                                server: server.name,
                                tenant: tenant.name,
                            }).url
                        }
                        method="post"
                    >
                        <Button type="submit" variant="danger">
                            <Trash2 className="h-4 w-4" />
                            Evict
                        </Button>
                    </Form>
                </div>
            </div>
        </div>
    );
}

function TenantRow({ server, tenant }: { server: Server; tenant: PlexTenant }) {
    const [confirmingEvict, setConfirmingEvict] = useState(false);
    const rotation = tenant.rotation
        ? (ROTATION_LABEL[tenant.rotation.state] ?? {
              label: tenant.rotation.state,
              tone: 'text-soft',
          })
        : null;

    return (
        <>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper/60 p-3 text-xs">
                <div className="min-w-0">
                    <div className="font-mono font-semibold text-ink">
                        {tenant.name}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-soft">
                        {tenant.database && (
                            <span className="inline-flex items-center gap-1">
                                <Database className="size-3" />
                                {tenant.database}
                                {tenant.databaseService
                                    ? ` (${tenant.databaseService})`
                                    : ''}
                            </span>
                        )}
                        {tenant.redisIndex !== null && (
                            <span>Redis DB {tenant.redisIndex}</span>
                        )}
                        {tenant.s3Bucket && <span>S3 {tenant.s3Bucket}</span>}
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {rotation && (
                        <span
                            className={`font-mono text-[10px] ${rotation.tone}`}
                        >
                            {rotation.label}
                        </span>
                    )}
                    {tenant.database && (
                        <Link
                            href={
                                rotateTenant({
                                    server: server.name,
                                    tenant: tenant.name,
                                }).url
                            }
                            method="post"
                            as="button"
                            className={buttonClass('ghost', 'sm', 'text-soft')}
                            title="Rotate this tenant's database credential"
                        >
                            <RotateCw className="size-3" />
                        </Link>
                    )}
                    <button
                        type="button"
                        onClick={() => setConfirmingEvict(true)}
                        className={buttonClass('ghost', 'sm', 'text-accent')}
                        title="Evict this tenant from the Commons"
                    >
                        <Trash2 className="size-3" />
                    </button>
                </div>
            </div>
            {confirmingEvict && (
                <EvictConfirmDialog
                    server={server}
                    tenant={tenant}
                    onCancel={() => setConfirmingEvict(false)}
                />
            )}
        </>
    );
}

function ResourceUsageCard({ metrics }: { metrics?: PodMetrics | null }) {
    if (metrics === undefined) {
        return (
            <Card label="Resource Usage">
                <div className="flex items-center gap-3 py-2 text-soft">
                    <Activity className="size-5 shrink-0 animate-pulse text-faint" />
                    <p className="text-xs">Checking…</p>
                </div>
            </Card>
        );
    }

    const components = metrics?.components
        ? Object.entries(metrics.components)
        : [];

    return (
        <Card
            label="Resource Usage"
            action={
                <span className="text-[10px] text-faint">
                    CPU/memory snapshot, not request traffic
                </span>
            }
        >
            {!metrics?.available ? (
                <div className="py-2 text-xs text-soft">
                    <p>Hardware telemetry unavailable.</p>
                    <p className="mt-0.5 text-[11px] text-faint">
                        metrics-server may not be installed on this cluster.
                    </p>
                </div>
            ) : components.length === 0 ? (
                <p className="py-2 text-xs text-soft">
                    No Commons pods are running yet.
                </p>
            ) : (
                <div className="space-y-2">
                    {components.map(([name, stat]) => (
                        <div
                            key={name}
                            className="flex items-center justify-between text-xs"
                        >
                            <div className="flex items-center gap-1.5">
                                <ToolLogo slug={name} size="sm" />
                                <span className="font-medium text-ink capitalize">
                                    {name}
                                </span>
                                {stat.podCount > 1 && (
                                    <span className="font-mono text-[10px] text-faint">
                                        (×{stat.podCount})
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 font-mono text-[11px] text-soft">
                                <span>{stat.cpu}</span>
                                <span className="text-line">/</span>
                                <span>{stat.memory}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}

function ProvisionForm({ server }: { server: Server }) {
    const [services, setServices] = useState<string[]>(['db', 'redis', 's3']);

    const toggle = (service: string) => {
        setServices((current) =>
            current.includes(service)
                ? current.filter((s) => s !== service)
                : [...current, service],
        );
    };

    return (
        <Card label="Provision custom credentials">
            <p className="text-xs text-soft">
                For an app that isn&apos;t a recognized LaraKube project —
                credentials are shown once, never stored.
            </p>
            <Form
                action={provision(server.name).url}
                method="post"
                className="mt-3 space-y-3"
            >
                <div>
                    <label className="block text-xs font-medium text-soft">
                        Tenant identifier
                    </label>
                    <input
                        type="text"
                        name="tenant"
                        placeholder="e.g. my-side-project"
                        required
                        className="placeholder:text-muted mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium text-soft">
                        Services
                    </label>
                    <div className="mt-1.5 flex gap-3">
                        {(['db', 'redis', 's3'] as const).map((service) => (
                            <label
                                key={service}
                                className="flex items-center gap-1.5 text-xs text-ink"
                            >
                                <input
                                    type="checkbox"
                                    name="services[]"
                                    value={service}
                                    checked={services.includes(service)}
                                    onChange={() => toggle(service)}
                                    className="rounded border-line"
                                />
                                {service === 'db'
                                    ? 'Database'
                                    : service === 'redis'
                                      ? 'Redis'
                                      : 'S3'}
                            </label>
                        ))}
                    </div>
                </div>

                <Button type="submit" variant="secondary">
                    <KeyRound className="h-4 w-4" />
                    Provision credentials
                </Button>
            </Form>
        </Card>
    );
}

// Shared across the loading, error, and loaded states so the server picker
// and Refresh action are never only reachable from one of them (a prior
// version dropped these while loading or erroring, stranding anyone who
// landed there with no way to switch servers or retry).
function PlexPageHeader({
    server,
    servers,
    badge,
}: {
    server: Server;
    servers: Server[];
    badge?: ReactNode;
}) {
    return (
        <header className="mb-6 flex items-center justify-between gap-6">
            <div>
                <div className="flex items-center gap-2.5">
                    <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em]">
                        Plex Commons
                    </h1>
                    {badge}
                </div>
                <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-soft">
                    Shared infrastructure for tenant apps and Cluster Tools —
                    resource usage, connected tenants, and on-demand
                    credentials.
                </p>
            </div>
            <div className="flex items-center gap-2.5">
                <ServerSwitcher
                    servers={servers}
                    value={server.name}
                    buildHref={(name) => plexIndex(name).url}
                />
                <Link
                    href={showServer(server.name).url}
                    className={buttonClass('secondary')}
                    title={`Open ${server.name} in Servers`}
                >
                    <ExternalLink className="size-3.5" />
                    <span>Open server</span>
                </Link>
                <Link
                    href={refresh(server.name).url}
                    method="post"
                    as="button"
                    className={buttonClass('secondary')}
                >
                    <RotateCw className="size-3.5" />
                    <span>Refresh</span>
                </Link>
            </div>
        </header>
    );
}

export default function PlexIndex({
    server,
    servers,
    plex,
    plexSync,
    services,
    podMetrics,
}: {
    server: Server;
    servers: Server[];
    plex?: PlexStatus | null;
    plexSync: {
        status: SyncStatus;
        lastSyncedAt: string | null;
        error: string | null;
    };
    services?: PlexCommonsServicesReport | null;
    podMetrics?: PodMetrics | null;
}) {
    // No persisted report yet (a never-synced server, right after a reset)
    // only ever means "still checking" — plex_data is null until a sync has
    // actually completed at least once, it is never null for a genuine
    // "Commons isn't initialized" answer (that still comes back as a full
    // report with initialized: false). Keep showing the loading state while
    // that first background sync is in flight, and poll for it to land —
    // the sync_status column itself may still read "stale" for a moment
    // after dispatch, before the queue worker has actually claimed it.
    const awaitingFirstSync = plex === null && plexSync.status !== 'error';

    usePoll(
        2000,
        { only: ['plex', 'services', 'plexSync'] },
        { autoStart: plexSync.status === 'syncing' || awaitingFirstSync },
    );

    if (plex === undefined || awaitingFirstSync) {
        return (
            <AppLayout title="Plex Commons">
                <PlexPageHeader server={server} servers={servers} />
                {/* Shaped like the real page (ADR 0009) so this reads as
                    "still loading", not as an empty or broken page. */}
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                    <div className="space-y-5 lg:col-span-2">
                        <Card label="Commons Services">
                            <div className="h-32 animate-pulse rounded-xl bg-paper" />
                        </Card>
                        <Card label="Cluster Tools">
                            <div className="h-48 animate-pulse rounded-xl bg-paper" />
                        </Card>
                    </div>
                    <div className="space-y-5">
                        <Card label="Resource Usage">
                            <div className="h-40 animate-pulse rounded-xl bg-paper" />
                        </Card>
                    </div>
                </div>
            </AppLayout>
        );
    }

    if (plex === null) {
        return (
            <AppLayout title="Plex Commons">
                <PlexPageHeader server={server} servers={servers} />
                <Card label="Plex Commons">
                    <div className="flex items-center gap-3 py-2 text-warn">
                        <Shield className="size-5 shrink-0 text-warn" />
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
    const toolTenants = plex?.tenants.tool ?? [];
    const projectTenants = plex?.tenants.project ?? [];
    const customTenants = plex?.tenants.custom ?? [];

    // Several Commons resources (e.g. Forgejo's 3 separate S3 buckets) can
    // belong to the same tool — grouped under one labeled, icon-bearing
    // header instead of flat, unidentified rows.
    const toolGroups = new Map<
        string,
        { tool: PlexTenant['clusterTool']; tenants: PlexTenant[] }
    >();
    for (const tenant of toolTenants) {
        const key = tenant.clusterTool?.tool ?? tenant.name;
        const group = toolGroups.get(key);
        if (group) {
            group.tenants.push(tenant);
        } else {
            toolGroups.set(key, {
                tool: tenant.clusterTool,
                tenants: [tenant],
            });
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
            />

            {!initialized ? (
                <PlexEmptyState server={server} />
            ) : (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                    <div className="space-y-5 lg:col-span-2">
                        <Deferred
                            data="services"
                            fallback={
                                <Card label="Commons Services">
                                    <div className="h-24 animate-pulse rounded-xl bg-paper" />
                                </Card>
                            }
                        >
                            <PlexCommonsServicesCard
                                server={server.name}
                                services={services}
                            />
                        </Deferred>

                        <Card
                            label={`Project Tenants${projectTenants.length > 0 ? ` · ${projectTenants.length}` : ''}`}
                        >
                            {projectTenants.length === 0 ? (
                                <p className="py-2 text-xs text-soft">
                                    No recognized LaraKube projects have joined
                                    this server&apos;s Commons yet — they join
                                    from their own dashboard.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {projectTenants.map((tenant) => (
                                        <TenantRow
                                            key={tenant.name}
                                            server={server}
                                            tenant={tenant}
                                        />
                                    ))}
                                </div>
                            )}
                        </Card>

                        <Card
                            label={`Custom Tenants${customTenants.length > 0 ? ` · ${customTenants.length}` : ''}`}
                        >
                            {customTenants.length === 0 ? (
                                <p className="py-2 text-xs text-soft">
                                    For an app that isn&apos;t a recognized
                                    LaraKube project — provision credentials for
                                    one below.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {customTenants.map((tenant) => (
                                        <TenantRow
                                            key={tenant.name}
                                            server={server}
                                            tenant={tenant}
                                        />
                                    ))}
                                </div>
                            )}
                        </Card>

                        {toolTenants.length > 0 && (
                            <Card
                                label={`Cluster Tools on this Commons · ${toolTenants.length}`}
                            >
                                <div className="divide-y divide-line">
                                    {[...toolGroups.entries()].map(
                                        ([key, group]) => (
                                            <div
                                                key={key}
                                                className="py-3 first:pt-0 last:pb-0"
                                            >
                                                <div className="mb-2 flex items-center gap-3">
                                                    <ToolLogo
                                                        tool={
                                                            group.tool ?? {
                                                                tool: key,
                                                            }
                                                        }
                                                        size="md"
                                                    />
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <span className="truncate text-sm font-semibold text-ink">
                                                            {group.tool?.name ??
                                                                key}
                                                        </span>
                                                        {group.tool
                                                            ?.tagline && (
                                                            <span className="max-w-[220px] truncate rounded bg-paper px-1.5 py-0.5 text-[10px] font-medium text-soft">
                                                                {
                                                                    group.tool
                                                                        .tagline
                                                                }
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="space-y-2 pl-[52px]">
                                                    {group.tenants.map(
                                                        (tenant) => (
                                                            <TenantRow
                                                                key={
                                                                    tenant.name
                                                                }
                                                                server={server}
                                                                tenant={tenant}
                                                            />
                                                        ),
                                                    )}
                                                </div>
                                            </div>
                                        ),
                                    )}
                                </div>
                            </Card>
                        )}
                    </div>

                    <div className="space-y-5">
                        <Deferred
                            data="podMetrics"
                            fallback={<ResourceUsageCard metrics={undefined} />}
                        >
                            <ResourceUsageCard metrics={podMetrics} />
                        </Deferred>

                        <ProvisionForm server={server} />
                    </div>
                </div>
            )}
        </AppLayout>
    );
}
