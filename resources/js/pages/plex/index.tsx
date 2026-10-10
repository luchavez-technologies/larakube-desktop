import { Deferred, Form, Link } from '@inertiajs/react';
import { useState } from 'react';
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
import BackingServicesCard from '@/components/backing-services-card';
import AppLayout from '@/layouts/app-layout';
import { show as showServer } from '@/routes/servers';
import { index as plexIndex, refresh, provision } from '@/routes/servers/plex';
import {
    evict as evictTenant,
    rotate as rotateTenant,
} from '@/routes/servers/plex/tenants';
import type {
    BackingServices,
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
                                <span className="size-1.5 rounded-full bg-tools" />
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

export default function PlexIndex({
    server,
    servers,
    plex,
    services,
    podMetrics,
}: {
    server: Server;
    servers: Server[];
    plex?: PlexStatus | null;
    services?: BackingServices | null;
    podMetrics?: PodMetrics | null;
}) {
    if (plex === undefined) {
        return (
            <AppLayout title="Plex Commons">
                <header className="mb-6">
                    <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em]">
                        Plex Commons
                    </h1>
                </header>
                <Card label="Plex Commons">
                    <div className="flex items-center gap-3 py-2 text-soft">
                        <Shield className="size-5 shrink-0 animate-pulse text-faint" />
                        <p className="text-xs">Checking the server…</p>
                    </div>
                </Card>
            </AppLayout>
        );
    }

    const initialized = Boolean(plex?.initialized);
    const toolTenants = plex?.tenants.tool ?? [];
    const appTenants = [
        ...(plex?.tenants.project ?? []),
        ...(plex?.tenants.custom ?? []),
    ];

    return (
        <AppLayout title="Plex Commons">
            <header className="mb-6 flex items-center justify-between gap-6">
                <div>
                    <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em]">
                        Plex Commons
                    </h1>
                    <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-soft">
                        Shared infrastructure for tenant apps and Cluster Tools
                        — resource usage, connected tenants, and on-demand
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
                            <BackingServicesCard
                                label="Commons Services"
                                services={services}
                                hasCommons
                            />
                        </Deferred>

                        <Card
                            label={`Application Tenants${appTenants.length > 0 ? ` · ${appTenants.length}` : ''}`}
                        >
                            {appTenants.length === 0 ? (
                                <p className="py-2 text-xs text-soft">
                                    No apps have joined this server&apos;s
                                    Commons yet. Projects join from their own
                                    dashboard; custom apps can be provisioned
                                    below.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {appTenants.map((tenant) => (
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
                                <div className="space-y-2">
                                    {toolTenants.map((tenant) => (
                                        <TenantRow
                                            key={tenant.name}
                                            server={server}
                                            tenant={tenant}
                                        />
                                    ))}
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
