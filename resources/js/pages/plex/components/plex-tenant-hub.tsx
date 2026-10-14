import { Form, Link } from '@inertiajs/react';
import { useState, useMemo } from 'react';
import {
    Code2,
    Database,
    HardDrive,
    KeyRound,
    RotateCw,
    Search,
    Trash2,
    X,
    Zap,
} from 'lucide-react';
import Button, { buttonClass } from '@/components/button';
import Card from '@/components/card';
import ToolLogo from '@/components/tool-logo';
import { cn } from '@/lib/utils';
import {
    evict as evictTenant,
    rotate as rotateTenant,
} from '@/routes/servers/plex/tenants';
import type {
    PlexCommonsServicesReport,
    PlexTenant,
    Server,
} from '@/types/larakube';

const ROTATION_LABEL: Record<
    string,
    { label: string; tone: string; bg: string }
> = {
    manual: {
        label: 'Manual (.env)',
        tone: 'text-soft',
        bg: 'bg-paper text-soft',
    },
    unreachable: {
        label: 'Unreachable',
        tone: 'text-amber-500',
        bg: 'bg-amber-500/10 text-amber-500',
    },
    managed: {
        label: 'OpenBao-managed',
        tone: 'text-emerald-500',
        bg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    },
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-6 backdrop-blur-xs"
            onClick={onCancel}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-[440px] rounded-2xl bg-surface p-7 shadow-2xl ring-1 ring-line"
                onClick={(event) => event.stopPropagation()}
            >
                <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">
                    Evict {tenant.name}?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-soft">
                    Frees its database, S3 bucket, and Redis index on this
                    Commons. A safety backup is taken first. For the
                    orphaned-tenant case — if the project still exists, use{' '}
                    <code className="font-mono text-xs">plex:leave</code> from
                    it instead.
                </p>
                <div className="mt-6 flex justify-end gap-2.5">
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
                            <Trash2 className="size-4" />
                            <span>Evict Tenant</span>
                        </Button>
                    </Form>
                </div>
            </div>
        </div>
    );
}

function TenantRow({
    server,
    tenant,
    onQuickConnect,
}: {
    server: Server;
    tenant: PlexTenant;
    onQuickConnect: (tenant: PlexTenant) => void;
}) {
    const [confirmingEvict, setConfirmingEvict] = useState(false);
    const rotation = tenant.rotation
        ? (ROTATION_LABEL[tenant.rotation.state] ?? {
              label: tenant.rotation.state,
              tone: 'text-soft',
              bg: 'bg-paper text-soft',
          })
        : null;

    return (
        <>
            <div className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-paper/60 p-3.5 text-xs transition hover:border-line/80 hover:bg-paper sm:flex-row sm:items-center">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-[13px] font-semibold text-ink">
                            {tenant.name}
                        </span>
                        {rotation && (
                            <span
                                className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${rotation.bg}`}
                            >
                                {rotation.label}
                            </span>
                        )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        {tenant.database && (
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-line/80 bg-surface px-2 py-0.5 font-mono text-[11px] text-ink">
                                <Database className="size-3 text-soft" />
                                <span>{tenant.database}</span>
                                {tenant.databaseService && (
                                    <span className="text-[10px] text-soft">
                                        ({tenant.databaseService})
                                    </span>
                                )}
                            </span>
                        )}

                        {tenant.redisIndex !== null &&
                            tenant.redisIndex !== undefined && (
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-line/80 bg-surface px-2 py-0.5 font-mono text-[11px] text-ink">
                                    <Zap className="size-3 text-amber-500" />
                                    <span>Redis DB {tenant.redisIndex}</span>
                                </span>
                            )}

                        {tenant.s3Bucket && (
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-line/80 bg-surface px-2 py-0.5 font-mono text-[11px] text-ink">
                                <HardDrive className="size-3 text-soft" />
                                <span>S3 {tenant.s3Bucket}</span>
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-center">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onQuickConnect(tenant)}
                        className="text-soft hover:text-ink"
                        title="View .env connection snippets"
                    >
                        <Code2 className="size-3.5" />
                        <span className="hidden sm:inline">Connect</span>
                    </Button>

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
                            className={buttonClass(
                                'ghost',
                                'sm',
                                'text-soft hover:text-ink',
                            )}
                            title="Rotate this tenant's database credential"
                        >
                            <RotateCw className="size-3.5" />
                            <span className="hidden sm:inline">Rotate</span>
                        </Link>
                    )}

                    <button
                        type="button"
                        onClick={() => setConfirmingEvict(true)}
                        className={buttonClass(
                            'ghost',
                            'sm',
                            'text-accent hover:bg-accent-tint',
                        )}
                        title="Evict this tenant from the Commons"
                    >
                        <Trash2 className="size-3.5" />
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

export default function PlexTenantHub({
    server,
    toolTenants,
    projectTenants,
    customTenants,
    services,
    activeEngineFilter,
    onSelectEngineFilter,
    onOpenProvisionModal,
    onQuickConnect,
}: {
    server: Server;
    toolTenants: PlexTenant[];
    projectTenants: PlexTenant[];
    customTenants: PlexTenant[];
    services?: PlexCommonsServicesReport | null;
    activeEngineFilter: string | null;
    onSelectEngineFilter: (driver: string | null) => void;
    onOpenProvisionModal: () => void;
    onQuickConnect: (tenant: PlexTenant) => void;
}) {
    const [search, setSearch] = useState('');
    const [scopeTab, setScopeTab] = useState<
        'all' | 'tools' | 'projects' | 'custom'
    >('all');

    // Group tool tenants by tool brand name
    const allTenants = useMemo(() => {
        return [...toolTenants, ...projectTenants, ...customTenants];
    }, [toolTenants, projectTenants, customTenants]);

    // Available engines from services report for filter chips
    const activeEngines = useMemo(() => {
        const options = services?.categories.flatMap((c) => c.options) ?? [];
        return options.filter((o) => o.enabled);
    }, [services]);

    // Filter tenants based on tab, engine filter, and search
    const filteredTenants = useMemo(() => {
        let list: PlexTenant[] = [];
        if (scopeTab === 'all') {
            list = allTenants;
        } else if (scopeTab === 'tools') {
            list = toolTenants;
        } else if (scopeTab === 'projects') {
            list = projectTenants;
        } else if (scopeTab === 'custom') {
            list = customTenants;
        }

        if (activeEngineFilter) {
            const filter = activeEngineFilter.toLowerCase();
            list = list.filter((t) => {
                if (
                    filter.includes('postgres') ||
                    filter.includes('mysql') ||
                    filter.includes('mariadb') ||
                    filter.includes('mongo')
                ) {
                    return (
                        Boolean(t.database) &&
                        (!t.databaseService ||
                            t.databaseService.toLowerCase() === filter)
                    );
                }
                if (filter.includes('redis')) {
                    return t.redisIndex !== null && t.redisIndex !== undefined;
                }
                if (
                    filter.includes('seaweed') ||
                    filter.includes('minio') ||
                    filter.includes('garage') ||
                    filter.includes('s3')
                ) {
                    return Boolean(t.s3Bucket);
                }
                return true;
            });
        }

        if (search.trim()) {
            const q = search.toLowerCase().trim();
            list = list.filter((t) => {
                return (
                    t.name.toLowerCase().includes(q) ||
                    (t.database && t.database.toLowerCase().includes(q)) ||
                    (t.s3Bucket && t.s3Bucket.toLowerCase().includes(q)) ||
                    (t.clusterTool?.name &&
                        t.clusterTool.name.toLowerCase().includes(q)) ||
                    (t.clusterTool?.tool &&
                        t.clusterTool.tool.toLowerCase().includes(q))
                );
            });
        }

        return list;
    }, [
        allTenants,
        toolTenants,
        projectTenants,
        customTenants,
        scopeTab,
        activeEngineFilter,
        search,
    ]);

    // Group filtered tool tenants by tool brand
    const toolGroups = useMemo(() => {
        const groups = new Map<
            string,
            { tool: PlexTenant['clusterTool']; tenants: PlexTenant[] }
        >();
        const filteredToolList = filteredTenants.filter((t) =>
            toolTenants.some((tt) => tt.name === t.name),
        );

        for (const tenant of filteredToolList) {
            const key = tenant.clusterTool?.tool ?? tenant.name;
            const group = groups.get(key);
            if (group) {
                group.tenants.push(tenant);
            } else {
                groups.set(key, {
                    tool: tenant.clusterTool,
                    tenants: [tenant],
                });
            }
        }
        return groups;
    }, [filteredTenants, toolTenants]);

    const nonToolFiltered = useMemo(() => {
        return filteredTenants.filter(
            (t) => !toolTenants.some((tt) => tt.name === t.name),
        );
    }, [filteredTenants, toolTenants]);

    return (
        <Card className="p-6">
            {/* Header: Title, Total Count, and Actions */}
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <div className="flex items-center gap-2.5">
                        <h2 className="text-lg font-semibold tracking-tight text-ink">
                            Connected Tenants & Ecosystem
                        </h2>
                        <span className="rounded-full bg-paper px-2.5 py-0.5 font-mono text-xs font-semibold text-soft ring-1 ring-line">
                            {filteredTenants.length}
                            {filteredTenants.length !== allTenants.length &&
                                ` of ${allTenants.length}`}
                        </span>
                    </div>
                    <p className="mt-1 text-xs text-soft">
                        Applications, cluster tools, and custom pods sharing
                        this Commons infrastructure.
                    </p>
                </div>

                <Button
                    variant="secondary"
                    size="sm"
                    onClick={onOpenProvisionModal}
                >
                    <KeyRound className="size-3.5" />
                    <span>Provision Custom Tenant</span>
                </Button>
            </div>

            {/* Control Bar: Search Input, Scope Tabs, and Service Filter Chips */}
            <div className="mt-5 space-y-3.5">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                    {/* Live Search */}
                    <div className="relative max-w-md flex-1">
                        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by tenant name, tool, database, or bucket..."
                            className="placeholder:text-muted w-full rounded-lg border border-line bg-paper/60 py-2 pr-8 pl-9 text-xs text-ink transition outline-none focus:border-brand focus:bg-surface focus:ring-1 focus:ring-brand"
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch('')}
                                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-faint hover:text-ink"
                            >
                                <X className="size-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Scope Tabs */}
                    <div className="flex items-center rounded-lg border border-line bg-paper/70 p-1 text-xs">
                        <button
                            type="button"
                            onClick={() => setScopeTab('all')}
                            className={cn(
                                'rounded-md px-3 py-1 font-medium transition',
                                scopeTab === 'all'
                                    ? 'bg-surface font-semibold text-ink shadow-xs'
                                    : 'text-soft hover:text-ink',
                            )}
                        >
                            All ({allTenants.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setScopeTab('tools')}
                            className={cn(
                                'rounded-md px-3 py-1 font-medium transition',
                                scopeTab === 'tools'
                                    ? 'bg-surface font-semibold text-ink shadow-xs'
                                    : 'text-soft hover:text-ink',
                            )}
                        >
                            Cluster Tools ({toolTenants.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setScopeTab('projects')}
                            className={cn(
                                'rounded-md px-3 py-1 font-medium transition',
                                scopeTab === 'projects'
                                    ? 'bg-surface font-semibold text-ink shadow-xs'
                                    : 'text-soft hover:text-ink',
                            )}
                        >
                            Project Apps ({projectTenants.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setScopeTab('custom')}
                            className={cn(
                                'rounded-md px-3 py-1 font-medium transition',
                                scopeTab === 'custom'
                                    ? 'bg-surface font-semibold text-ink shadow-xs'
                                    : 'text-soft hover:text-ink',
                            )}
                        >
                            Custom ({customTenants.length})
                        </button>
                    </div>
                </div>

                {/* Service Filter Chips */}
                {activeEngines.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-line/60 pt-1">
                        <span className="mr-1 text-[11px] font-medium tracking-wider text-soft uppercase">
                            Filter by Engine:
                        </span>
                        <button
                            type="button"
                            onClick={() => onSelectEngineFilter(null)}
                            className={cn(
                                'rounded-md px-2.5 py-1 text-xs font-medium transition',
                                activeEngineFilter === null
                                    ? 'bg-ink font-semibold text-surface shadow-xs'
                                    : 'bg-paper text-soft hover:bg-badge hover:text-ink',
                            )}
                        >
                            All Engines
                        </button>
                        {activeEngines.map((opt) => (
                            <button
                                key={opt.driver}
                                type="button"
                                onClick={() =>
                                    onSelectEngineFilter(
                                        activeEngineFilter === opt.driver
                                            ? null
                                            : opt.driver,
                                    )
                                }
                                className={cn(
                                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition',
                                    activeEngineFilter === opt.driver
                                        ? 'bg-brand font-semibold text-white shadow-xs'
                                        : 'bg-paper text-soft hover:bg-badge hover:text-ink',
                                )}
                            >
                                <span>{opt.label}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Tenant Rows / Groups */}
            <div className="mt-6">
                {filteredTenants.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-line p-8 text-center">
                        <p className="text-sm font-medium text-ink">
                            No tenants match your filters
                        </p>
                        <p className="mt-1 text-xs text-soft">
                            Try adjusting your search terms or clearing the
                            selected engine filter.
                        </p>
                        {(search ||
                            activeEngineFilter ||
                            scopeTab !== 'all') && (
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                    setSearch('');
                                    onSelectEngineFilter(null);
                                    setScopeTab('all');
                                }}
                                className="mt-4"
                            >
                                <RotateCw className="size-3.5" />
                                <span>Reset All Filters</span>
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* 1. Grouped Cluster Tools */}
                        {toolGroups.size > 0 && (
                            <div className="space-y-4">
                                {[...toolGroups.entries()].map(
                                    ([key, group]) => (
                                        <div
                                            key={key}
                                            className="rounded-xl border border-line bg-surface p-4 shadow-xs"
                                        >
                                            <div className="mb-3 flex items-center gap-3">
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
                                                    {group.tool?.tagline && (
                                                        <span className="rounded bg-paper px-2 py-0.5 text-[10px] font-medium text-soft">
                                                            {group.tool.tagline}
                                                        </span>
                                                    )}
                                                    <span className="font-mono text-[11px] text-soft">
                                                        ({group.tenants.length}{' '}
                                                        {group.tenants
                                                            .length === 1
                                                            ? 'tenant'
                                                            : 'tenants'}
                                                        )
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                {group.tenants.map((tenant) => (
                                                    <TenantRow
                                                        key={tenant.name}
                                                        server={server}
                                                        tenant={tenant}
                                                        onQuickConnect={
                                                            onQuickConnect
                                                        }
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    ),
                                )}
                            </div>
                        )}

                        {/* 2. Standalone Project & Custom Tenants */}
                        {nonToolFiltered.length > 0 && (
                            <div className="space-y-3">
                                {toolGroups.size > 0 && (
                                    <h3 className="pt-2 text-xs font-semibold tracking-wider text-soft uppercase">
                                        Project & Custom Tenants (
                                        {nonToolFiltered.length})
                                    </h3>
                                )}
                                <div className="space-y-2">
                                    {nonToolFiltered.map((tenant) => (
                                        <TenantRow
                                            key={tenant.name}
                                            server={server}
                                            tenant={tenant}
                                            onQuickConnect={onQuickConnect}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </Card>
    );
}
