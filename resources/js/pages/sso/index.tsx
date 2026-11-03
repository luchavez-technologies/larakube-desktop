import { Form, Head, usePoll } from '@inertiajs/react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import {
    Building2,
    ChevronDown,
    ChevronUp,
    KeyRound,
    Layers,
    Plug,
    RotateCw,
    Search,
    Trash2,
    Unlink,
    UserMinus,
    UserPlus,
    Users,
    XCircle,
} from 'lucide-react';
import AppLayout from '@/layouts/app-layout';
import Button, { buttonClass } from '@/components/button';
import Card from '@/components/card';
import ServerSwitcher from '@/components/server-switcher';
import ExperimentalBadge from '@/components/experimental-badge';
import ToolLogo from '@/components/tool-logo';
import SyncStatusBadge, {
    type SyncStatus,
} from '@/components/sync-status-badge';
import sso, { index as ssoIndex } from '@/routes/servers/sso';
import type { Server } from '@/types/larakube';

type WiredToolRow = {
    tool: string;
    slug: string;
    instance: string;
    host: string | null;
    wired: boolean;
};

type GrantRow = {
    email: string;
    tool: string;
    slug: string;
    role: string;
    project: string;
};

type OrgRow = {
    name: string;
    orgId: string;
    domainVerified: boolean;
};

type Status = {
    installed: boolean;
    org?: string | null;
    wiredTools?: WiredToolRow[];
    grants?: GrantRow[];
    orgs?: OrgRow[];
    orphanedProjects?: string[];
};

type Props = {
    server: Server;
    servers: Server[];
    isInstalled: boolean;
    status?: Status;
    grants?: GrantRow[];
    ssoSync: {
        status: SyncStatus;
        lastSyncedAt: string | null;
        error: string | null;
    };
};

type TabType = 'wired' | 'grants' | 'orgs' | 'users';

function Pulse({ className }: { className?: string }) {
    return <div className={`animate-pulse rounded-md bg-paper ${className}`} />;
}

function SsoSkeleton() {
    return (
        <div className="space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
                <div
                    key={i}
                    className="rounded-2xl bg-surface p-6 ring-1 ring-line"
                >
                    <Pulse className="mb-5 h-4 w-48" />
                    <div className="space-y-3">
                        {Array.from({ length: 3 }).map((_, j) => (
                            <Pulse key={j} className="h-3.5 w-full" />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

function SsoEmptyState({ server }: { server: Server }) {
    return (
        <div className="rounded-2xl border border-line bg-surface/60 p-8 backdrop-blur-xs">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 ring-1 ring-indigo-500/20">
                <KeyRound className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-ink">
                Zitadel SSO is not deployed on {server.name}
            </h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-soft">
                Zitadel SSO is LaraKube&rsquo;s identity provider — wire tools
                to it from this page once deployed via the App Store.
            </p>
        </div>
    );
}

export default function SsoIndex({
    server,
    servers,
    isInstalled,
    status,
    grants: grantsProp,
    ssoSync,
}: Props) {
    const [activeTab, setActiveTab] = useState<TabType>('wired');
    const [wiring, setWiring] = useState(false);
    const [granting, setGranting] = useState(false);
    const [grantDomainInput, setGrantDomainInput] = useState('');
    const [addingOrg, setAddingOrg] = useState(false);
    const [grantingOrg, setGrantingOrg] = useState(false);
    const [orgGrantDomainInput, setOrgGrantDomainInput] = useState('');
    const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

    const [unwiring, setUnwiring] = useState<{
        tool: string;
        domain: string;
    } | null>(null);
    const [revoking, setRevoking] = useState<GrantRow | null>(null);
    const [pruning, setPruning] = useState(false);
    const [removingOrg, setRemovingOrg] = useState<string | null>(null);
    const [removeOrgConfirm, setRemoveOrgConfirm] = useState('');
    const [removeOrgWithMail, setRemoveOrgWithMail] = useState(true);

    const [wiredSearch, setWiredSearch] = useState('');
    const [grantsSearch, setGrantsSearch] = useState('');
    const [sort, setSort] = useState<{
        key: 'email' | 'tool' | 'role';
        direction: 'asc' | 'desc';
    } | null>(null);
    const [grouped, setGrouped] = useState(false);

    const shouldPoll =
        isInstalled &&
        (ssoSync.status === 'syncing' || ssoSync.status === 'stale');

    const { start, stop } = usePoll(
        2000,
        { only: ['status', 'grants', 'ssoSync'] },
        { autoStart: shouldPoll },
    );

    useEffect(() => {
        if (shouldPoll) {
            start();
        } else {
            stop();
        }
    }, [shouldPoll, start, stop]);

    const loading =
        isInstalled && (status === undefined || grantsProp === undefined);
    const resolved: Status = status ?? { installed: isInstalled };
    const wiredTools = resolved.wiredTools ?? [];
    const grants = grantsProp ?? [];
    const orgs = resolved.orgs ?? [];
    const orphanedProjects = resolved.orphanedProjects ?? [];

    const filteredWiredTools = useMemo(() => {
        if (!wiredSearch.trim()) return wiredTools;
        const q = wiredSearch.toLowerCase();
        return wiredTools.filter(
            (w) =>
                w.tool.toLowerCase().includes(q) ||
                w.slug.toLowerCase().includes(q) ||
                w.instance.toLowerCase().includes(q) ||
                (w.host?.toLowerCase().includes(q) ?? false),
        );
    }, [wiredTools, wiredSearch]);

    const filteredGrants = useMemo(() => {
        if (!grantsSearch.trim()) return grants;
        const q = grantsSearch.toLowerCase();
        return grants.filter(
            (g) =>
                g.email.toLowerCase().includes(q) ||
                g.tool.toLowerCase().includes(q) ||
                g.role.toLowerCase().includes(q) ||
                g.project.toLowerCase().includes(q),
        );
    }, [grants, grantsSearch]);

    const sortedGrants = useMemo(() => {
        if (!sort) return filteredGrants;
        return [...filteredGrants].sort((a, b) => {
            const aVal = a[sort.key].toLowerCase();
            const bVal = b[sort.key].toLowerCase();
            const cmp = aVal.localeCompare(bVal);
            return sort.direction === 'asc' ? cmp : -cmp;
        });
    }, [filteredGrants, sort]);

    function handleSort(key: 'email' | 'tool' | 'role') {
        setSort((current) => {
            if (current?.key === key) {
                return {
                    key,
                    direction: current.direction === 'asc' ? 'desc' : 'asc',
                };
            }
            return { key, direction: 'asc' };
        });
    }

    const groupedGrants = useMemo(() => {
        if (!grouped) return [];
        const groups = new Map<
            string,
            { tool: string; slug: string; rows: GrantRow[] }
        >();
        for (const row of sortedGrants) {
            const existing = groups.get(row.tool);
            if (existing) {
                existing.rows.push(row);
            } else {
                groups.set(row.tool, {
                    tool: row.tool,
                    slug: row.slug,
                    rows: [row],
                });
            }
        }
        return Array.from(groups.values());
    }, [grouped, sortedGrants]);

    const tabs: Array<{
        id: TabType;
        label: string;
        icon: typeof Plug;
        badge?: number;
    }> = [
        {
            id: 'wired',
            label: 'Wired Tools',
            icon: Plug,
            badge: wiredTools.length,
        },
        {
            id: 'grants',
            label: 'Access Grants',
            icon: KeyRound,
            badge: grants.length,
        },
        {
            id: 'orgs',
            label: 'Partner Orgs',
            icon: Building2,
            badge: orgs.length,
        },
        {
            id: 'users',
            label: 'Users & Cleanup',
            icon: Users,
            badge:
                orphanedProjects.length > 0
                    ? orphanedProjects.length
                    : undefined,
        },
    ];

    return (
        <AppLayout title={`Zitadel SSO · ${server.name}`}>
            <Head title={`Zitadel SSO · ${server.name}`} />

            <div className="mx-auto max-w-7xl space-y-6">
                {/* Header with Server Switcher */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <ToolLogo slug="zitadel" size="sm" />
                            <h1 className="text-xl font-bold tracking-tight text-ink">
                                Identity Management
                            </h1>
                            <ExperimentalBadge side="bottom" />
                            {isInstalled && (
                                <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                                    Zitadel Active
                                </span>
                            )}
                            {isInstalled && (
                                <SyncStatusBadge
                                    status={ssoSync.status}
                                    lastSyncedAt={ssoSync.lastSyncedAt}
                                    error={ssoSync.error}
                                    subject="Zitadel SSO"
                                />
                            )}
                        </div>
                        <p className="mt-1 text-xs text-soft">
                            Identity provider: user accounts, authentication
                            wiring, and scoped access grants.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        {isInstalled && (
                            <Form
                                action={sso.refresh(server.name).url}
                                method="post"
                            >
                                <button
                                    type="submit"
                                    className={buttonClass('secondary', 'sm')}
                                    title="Force an immediate re-sync, bypassing the cached data's freshness window"
                                >
                                    <RotateCw
                                        className={`h-3.5 w-3.5 ${shouldPoll ? 'animate-spin' : ''}`}
                                    />
                                    <span>Refresh</span>
                                </button>
                            </Form>
                        )}

                        <ServerSwitcher
                            servers={servers}
                            value={server.name}
                            buildHref={(name) => ssoIndex(name).url}
                        />
                    </div>
                </div>

                {unwiring && (
                    <div className="space-y-3 rounded-xl bg-accent-tint p-4 ring-1 ring-accent-line">
                        <p className="text-xs text-accent">
                            Unwiring {unwiring.tool} from Zitadel SSO
                            immediately breaks login for every user of that tool
                            — they won&rsquo;t be able to sign in via SSO until
                            it&rsquo;s wired again. This does not delete any
                            accounts or data.
                        </p>
                        <div className="flex items-center justify-end gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setUnwiring(null)}
                            >
                                <XCircle className="h-3.5 w-3.5" />
                                <span>Cancel</span>
                            </Button>
                            <Form
                                action={sso.unwire(server.name).url}
                                method="post"
                                onSuccess={() => setUnwiring(null)}
                            >
                                <input
                                    type="hidden"
                                    name="tool"
                                    value={unwiring.tool}
                                />
                                <input
                                    type="hidden"
                                    name="domain"
                                    value={unwiring.domain}
                                />
                                <button
                                    type="submit"
                                    className={buttonClass('dangerFill', 'sm')}
                                >
                                    <Unlink className="h-4 w-4" />
                                    <span>Unwire {unwiring.tool}</span>
                                </button>
                            </Form>
                        </div>
                    </div>
                )}

                {revoking && (
                    <div className="space-y-3 rounded-xl bg-accent-tint p-4 ring-1 ring-accent-line">
                        <p className="text-xs text-accent">
                            {revoking.email} will immediately lose{' '}
                            {revoking.role} access to {revoking.tool}.
                        </p>
                        <div className="flex items-center justify-end gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setRevoking(null)}
                            >
                                <XCircle className="h-3.5 w-3.5" />
                                <span>Cancel</span>
                            </Button>
                            <Form
                                action={sso.revoke(server.name).url}
                                method="post"
                                onSuccess={() => setRevoking(null)}
                            >
                                <input
                                    type="hidden"
                                    name="email"
                                    value={revoking.email}
                                />
                                <input
                                    type="hidden"
                                    name="role"
                                    value={revoking.role}
                                />
                                {(() => {
                                    const match = wiredTools.find(
                                        (w) =>
                                            (w.slug &&
                                                w.slug === revoking.slug) ||
                                            (w.tool &&
                                                w.tool === revoking.tool),
                                    );
                                    return match?.host ? (
                                        <input
                                            type="hidden"
                                            name="domain"
                                            value={match.host}
                                        />
                                    ) : null;
                                })()}
                                <button
                                    type="submit"
                                    className={buttonClass('dangerFill', 'sm')}
                                >
                                    <UserMinus className="h-4 w-4" />
                                    <span>Revoke Access</span>
                                </button>
                            </Form>
                        </div>
                    </div>
                )}

                {pruning && (
                    <div className="space-y-3 rounded-xl bg-accent-tint p-4 ring-1 ring-accent-line">
                        <p className="text-xs text-accent">
                            This permanently deletes {selectedProjects.length}{' '}
                            Zitadel project(s) — their OIDC app configurations
                            and role definitions. This cannot be undone.
                        </p>
                        <div className="flex items-center justify-end gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setPruning(false)}
                            >
                                <XCircle className="h-3.5 w-3.5" />
                                <span>Cancel</span>
                            </Button>
                            <Form
                                action={sso.prune(server.name).url}
                                method="post"
                                onSuccess={() => {
                                    setPruning(false);
                                    setSelectedProjects([]);
                                }}
                            >
                                {selectedProjects.map((p) => (
                                    <input
                                        key={p}
                                        type="hidden"
                                        name="project[]"
                                        value={p}
                                    />
                                ))}
                                <button
                                    type="submit"
                                    className={buttonClass('dangerFill', 'sm')}
                                >
                                    <Trash2 className="h-4 w-4" />
                                    <span>
                                        Delete {selectedProjects.length}{' '}
                                        Project(s)
                                    </span>
                                </button>
                            </Form>
                        </div>
                    </div>
                )}

                {!isInstalled ? (
                    <SsoEmptyState server={server} />
                ) : loading ? (
                    <SsoSkeleton />
                ) : (
                    <div className="space-y-6">
                        {/* Tab Navigation */}
                        <div className="flex items-center gap-6 border-b border-line">
                            {tabs.map((tab) => {
                                const Icon = tab.icon;
                                const isActive = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`relative flex items-center gap-2 pb-3 text-xs font-medium transition ${
                                            isActive
                                                ? 'text-brand'
                                                : 'text-soft hover:text-ink'
                                        }`}
                                    >
                                        <Icon className="h-4 w-4" />
                                        <span>{tab.label}</span>
                                        {tab.badge !== undefined && (
                                            <span
                                                className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                                                    isActive
                                                        ? 'bg-brand/10 text-brand'
                                                        : 'bg-paper text-soft'
                                                }`}
                                            >
                                                {tab.badge}
                                            </span>
                                        )}
                                        {isActive && (
                                            <div className="absolute right-0 bottom-0 left-0 h-0.5 bg-brand" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* TAB 1: WIRED TOOLS */}
                        {activeTab === 'wired' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="relative w-64">
                                        <Search className="text-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                        <input
                                            type="text"
                                            value={wiredSearch}
                                            onChange={(e) =>
                                                setWiredSearch(e.target.value)
                                            }
                                            placeholder="Search wired tools..."
                                            className="placeholder:text-muted w-full rounded-lg border border-line bg-surface py-1.5 pr-3 pl-9 text-xs text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                                        />
                                    </div>
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() => setWiring((v) => !v)}
                                    >
                                        <Plug className="h-3.5 w-3.5" />
                                        <span>Wire a Tool</span>
                                    </Button>
                                </div>

                                {wiring && (
                                    <Card label="Wire Tool to Zitadel SSO">
                                        <Form
                                            action={sso.wire(server.name).url}
                                            method="post"
                                            onSuccess={() => setWiring(false)}
                                            className="grid gap-3 sm:grid-cols-3"
                                        >
                                            <input
                                                type="text"
                                                name="tool"
                                                required
                                                placeholder="Tool name (e.g. forgejo)"
                                                className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                            />
                                            <input
                                                type="text"
                                                name="domain"
                                                required
                                                placeholder="Domain (e.g. git.example.com)"
                                                className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                            />
                                            <input
                                                type="email"
                                                name="admin_email"
                                                placeholder="Admin email (optional)"
                                                className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                            />
                                            <div className="col-span-full flex justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() =>
                                                        setWiring(false)
                                                    }
                                                >
                                                    <XCircle className="h-3.5 w-3.5" />
                                                    <span>Cancel</span>
                                                </Button>
                                                <Button
                                                    type="submit"
                                                    variant="primary"
                                                    size="sm"
                                                >
                                                    <Plug className="h-4 w-4" />
                                                    <span>Wire Tool</span>
                                                </Button>
                                            </div>
                                        </Form>
                                    </Card>
                                )}

                                <Card className="overflow-hidden p-0">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs">
                                            <thead>
                                                <tr className="border-b border-line bg-paper/50 text-soft">
                                                    <th className="px-5 py-3 font-medium">
                                                        Tool
                                                    </th>
                                                    <th className="px-5 py-3 font-medium">
                                                        Instance
                                                    </th>
                                                    <th className="px-5 py-3 font-medium">
                                                        Host
                                                    </th>
                                                    <th className="px-5 py-3 font-medium">
                                                        Wired
                                                    </th>
                                                    <th className="px-5 py-3 text-right">
                                                        Actions
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-line text-ink">
                                                {filteredWiredTools.length ===
                                                0 ? (
                                                    <tr>
                                                        <td
                                                            colSpan={5}
                                                            className="px-5 py-8 text-center text-soft"
                                                        >
                                                            No wired tools
                                                            found.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    filteredWiredTools.map(
                                                        (row) => (
                                                            <tr
                                                                key={`${row.tool}-${row.instance}`}
                                                                className="transition hover:bg-paper/30"
                                                            >
                                                                <td className="px-5 py-3.5">
                                                                    <div className="flex items-center gap-2.5">
                                                                        <ToolLogo
                                                                            slug={
                                                                                row.slug
                                                                            }
                                                                            size="sm"
                                                                        />
                                                                        <span className="font-medium text-ink">
                                                                            {
                                                                                row.tool
                                                                            }
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-5 py-3.5 text-soft">
                                                                    {row.instance ||
                                                                        '—'}
                                                                </td>
                                                                <td className="px-5 py-3.5 text-soft">
                                                                    {row.host ??
                                                                        '—'}
                                                                </td>
                                                                <td className="px-5 py-3.5">
                                                                    {row.wired ? (
                                                                        <span className="text-emerald-600 dark:text-emerald-400">
                                                                            yes
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-soft">
                                                                            no
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="px-5 py-3.5 text-right">
                                                                    {row.wired ? (
                                                                        <button
                                                                            type="button"
                                                                            className={buttonClass(
                                                                                'ghost',
                                                                                'xs',
                                                                            )}
                                                                            onClick={() =>
                                                                                setUnwiring(
                                                                                    {
                                                                                        tool:
                                                                                            row.slug ||
                                                                                            row.tool,
                                                                                        domain:
                                                                                            row.host ??
                                                                                            '',
                                                                                    },
                                                                                )
                                                                            }
                                                                            title={`Unwire ${row.tool}`}
                                                                        >
                                                                            <Unlink className="size-3.5" />
                                                                            <span>
                                                                                Unwire
                                                                            </span>
                                                                        </button>
                                                                    ) : (
                                                                        <Form
                                                                            action={
                                                                                sso.wire(
                                                                                    server.name,
                                                                                )
                                                                                    .url
                                                                            }
                                                                            method="post"
                                                                            className="inline-block"
                                                                        >
                                                                            <input
                                                                                type="hidden"
                                                                                name="tool"
                                                                                value={
                                                                                    row.slug ||
                                                                                    row.tool
                                                                                }
                                                                            />
                                                                            <input
                                                                                type="hidden"
                                                                                name="domain"
                                                                                value={
                                                                                    row.host ??
                                                                                    ''
                                                                                }
                                                                            />
                                                                            <button
                                                                                type="submit"
                                                                                className={buttonClass(
                                                                                    'secondary',
                                                                                    'xs',
                                                                                )}
                                                                                title={`Wire ${row.tool} SSO`}
                                                                            >
                                                                                <Plug className="size-3.5" />
                                                                                <span>
                                                                                    Wire
                                                                                </span>
                                                                            </button>
                                                                        </Form>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ),
                                                    )
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </Card>
                            </div>
                        )}

                        {/* TAB 2: ACCESS GRANTS */}
                        {activeTab === 'grants' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="relative w-64">
                                        <Search className="text-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                        <input
                                            type="text"
                                            value={grantsSearch}
                                            onChange={(e) =>
                                                setGrantsSearch(e.target.value)
                                            }
                                            placeholder="Search access grants..."
                                            className="placeholder:text-muted w-full rounded-lg border border-line bg-surface py-1.5 pr-3 pl-9 text-xs text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() =>
                                                setGrouped((v) => !v)
                                            }
                                        >
                                            <Layers className="h-3.5 w-3.5" />
                                            <span>
                                                {grouped
                                                    ? 'Ungroup'
                                                    : 'Group by Tool'}
                                            </span>
                                        </Button>
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            onClick={() =>
                                                setGranting((v) => !v)
                                            }
                                        >
                                            <UserPlus className="h-3.5 w-3.5" />
                                            <span>Grant Access</span>
                                        </Button>
                                    </div>
                                </div>

                                {granting && (
                                    <Card label="Grant Tool Access">
                                        <Form
                                            action={sso.grant(server.name).url}
                                            method="post"
                                            onSuccess={() => {
                                                setGranting(false);
                                                setGrantDomainInput('');
                                            }}
                                            className="grid gap-3 sm:grid-cols-4"
                                        >
                                            <input
                                                type="email"
                                                name="email"
                                                required
                                                placeholder="user@example.com"
                                                className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                            />
                                            <select
                                                name="tool"
                                                required
                                                defaultValue=""
                                                onChange={(e) => {
                                                    const match =
                                                        wiredTools.find(
                                                            (w) =>
                                                                (w.slug ||
                                                                    w.tool) ===
                                                                e.target.value,
                                                        );
                                                    if (match?.host) {
                                                        setGrantDomainInput(
                                                            match.host,
                                                        );
                                                    }
                                                }}
                                                className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                            >
                                                <option value="" disabled>
                                                    Select tool
                                                </option>
                                                {wiredTools.map((w) => (
                                                    <option
                                                        key={`${w.slug}-${w.instance}`}
                                                        value={w.slug || w.tool}
                                                    >
                                                        {w.tool}{' '}
                                                        {w.instance
                                                            ? `(${w.instance})`
                                                            : ''}
                                                    </option>
                                                ))}
                                            </select>
                                            <input
                                                type="text"
                                                name="domain"
                                                required
                                                value={grantDomainInput}
                                                onChange={(e) =>
                                                    setGrantDomainInput(
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="Domain (e.g. git.example.com)"
                                                className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                            />
                                            <select
                                                name="role"
                                                defaultValue="developer"
                                                className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                            >
                                                <option value="developer">
                                                    developer (read-write)
                                                </option>
                                                <option value="viewer">
                                                    viewer (read-only)
                                                </option>
                                            </select>
                                            <div className="col-span-full flex justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() =>
                                                        setGranting(false)
                                                    }
                                                >
                                                    <XCircle className="h-3.5 w-3.5" />
                                                    <span>Cancel</span>
                                                </Button>
                                                <Button
                                                    type="submit"
                                                    variant="primary"
                                                    size="sm"
                                                >
                                                    <UserPlus className="h-4 w-4" />
                                                    <span>Grant</span>
                                                </Button>
                                            </div>
                                        </Form>
                                    </Card>
                                )}

                                <Card className="overflow-hidden p-0">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs">
                                            <thead>
                                                <tr className="border-b border-line bg-paper/50 text-soft">
                                                    <th
                                                        className="cursor-pointer px-5 py-3 font-medium transition select-none hover:text-ink"
                                                        onClick={() =>
                                                            handleSort('email')
                                                        }
                                                    >
                                                        <div className="flex items-center gap-1.5">
                                                            <span>Email</span>
                                                            {sort?.key ===
                                                                'email' &&
                                                                (sort.direction ===
                                                                'asc' ? (
                                                                    <ChevronUp className="h-3.5 w-3.5" />
                                                                ) : (
                                                                    <ChevronDown className="h-3.5 w-3.5" />
                                                                ))}
                                                        </div>
                                                    </th>
                                                    <th
                                                        className="cursor-pointer px-5 py-3 font-medium transition select-none hover:text-ink"
                                                        onClick={() =>
                                                            handleSort('tool')
                                                        }
                                                    >
                                                        <div className="flex items-center gap-1.5">
                                                            <span>Tool</span>
                                                            {sort?.key ===
                                                                'tool' &&
                                                                (sort.direction ===
                                                                'asc' ? (
                                                                    <ChevronUp className="h-3.5 w-3.5" />
                                                                ) : (
                                                                    <ChevronDown className="h-3.5 w-3.5" />
                                                                ))}
                                                        </div>
                                                    </th>
                                                    <th
                                                        className="cursor-pointer px-5 py-3 font-medium transition select-none hover:text-ink"
                                                        onClick={() =>
                                                            handleSort('role')
                                                        }
                                                    >
                                                        <div className="flex items-center gap-1.5">
                                                            <span>Role</span>
                                                            {sort?.key ===
                                                                'role' &&
                                                                (sort.direction ===
                                                                'asc' ? (
                                                                    <ChevronUp className="h-3.5 w-3.5" />
                                                                ) : (
                                                                    <ChevronDown className="h-3.5 w-3.5" />
                                                                ))}
                                                        </div>
                                                    </th>
                                                    <th className="px-5 py-3 font-medium">
                                                        Project
                                                    </th>
                                                    <th className="px-5 py-3 text-right">
                                                        Actions
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-line text-ink">
                                                {sortedGrants.length === 0 ? (
                                                    <tr>
                                                        <td
                                                            colSpan={5}
                                                            className="px-5 py-8 text-center text-soft"
                                                        >
                                                            No access grants
                                                            found.
                                                        </td>
                                                    </tr>
                                                ) : grouped ? (
                                                    groupedGrants.map(
                                                        (group) => (
                                                            <Fragment
                                                                key={group.tool}
                                                            >
                                                                <tr className="bg-paper/40 font-medium text-ink">
                                                                    <td
                                                                        colSpan={
                                                                            5
                                                                        }
                                                                        className="px-5 py-2.5"
                                                                    >
                                                                        <div className="flex items-center gap-2.5">
                                                                            <ToolLogo
                                                                                slug={
                                                                                    group.slug
                                                                                }
                                                                                size="sm"
                                                                            />
                                                                            <span className="font-semibold text-ink">
                                                                                {
                                                                                    group.tool
                                                                                }
                                                                            </span>
                                                                            <span className="inline-flex items-center rounded-md bg-paper px-2 py-0.5 text-[11px] font-medium text-soft ring-1 ring-line">
                                                                                {
                                                                                    group
                                                                                        .rows
                                                                                        .length
                                                                                }{' '}
                                                                                {group
                                                                                    .rows
                                                                                    .length ===
                                                                                1
                                                                                    ? 'grant'
                                                                                    : 'grants'}
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                {group.rows.map(
                                                                    (row) => (
                                                                        <tr
                                                                            key={`${row.email}-${row.tool}-${row.role}-${row.project}`}
                                                                            className="transition hover:bg-paper/30"
                                                                        >
                                                                            <td className="px-5 py-3.5 font-medium text-ink">
                                                                                {
                                                                                    row.email
                                                                                }
                                                                            </td>
                                                                            <td className="px-5 py-3.5">
                                                                                <div className="flex items-center gap-2.5">
                                                                                    <ToolLogo
                                                                                        slug={
                                                                                            row.slug
                                                                                        }
                                                                                        size="sm"
                                                                                    />
                                                                                    <span className="text-soft">
                                                                                        {
                                                                                            row.tool
                                                                                        }
                                                                                    </span>
                                                                                </div>
                                                                            </td>
                                                                            <td className="px-5 py-3.5 text-soft">
                                                                                {
                                                                                    row.role
                                                                                }
                                                                            </td>
                                                                            <td className="px-5 py-3.5 text-soft">
                                                                                {row.project ||
                                                                                    '—'}
                                                                            </td>
                                                                            <td className="px-5 py-3.5 text-right">
                                                                                <button
                                                                                    type="button"
                                                                                    className={buttonClass(
                                                                                        'ghost',
                                                                                        'xs',
                                                                                    )}
                                                                                    onClick={() =>
                                                                                        setRevoking(
                                                                                            row,
                                                                                        )
                                                                                    }
                                                                                    title={`Revoke ${row.email}`}
                                                                                >
                                                                                    <UserMinus className="size-3.5" />
                                                                                    <span>
                                                                                        Revoke
                                                                                    </span>
                                                                                </button>
                                                                            </td>
                                                                        </tr>
                                                                    ),
                                                                )}
                                                            </Fragment>
                                                        ),
                                                    )
                                                ) : (
                                                    sortedGrants.map((row) => (
                                                        <tr
                                                            key={`${row.email}-${row.tool}-${row.role}-${row.project}`}
                                                            className="transition hover:bg-paper/30"
                                                        >
                                                            <td className="px-5 py-3.5 font-medium text-ink">
                                                                {row.email}
                                                            </td>
                                                            <td className="px-5 py-3.5">
                                                                <div className="flex items-center gap-2.5">
                                                                    <ToolLogo
                                                                        slug={
                                                                            row.slug
                                                                        }
                                                                        size="sm"
                                                                    />
                                                                    <span className="text-soft">
                                                                        {
                                                                            row.tool
                                                                        }
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-5 py-3.5 text-soft">
                                                                {row.role}
                                                            </td>
                                                            <td className="px-5 py-3.5 text-soft">
                                                                {row.project ||
                                                                    '—'}
                                                            </td>
                                                            <td className="px-5 py-3.5 text-right">
                                                                <button
                                                                    type="button"
                                                                    className={buttonClass(
                                                                        'ghost',
                                                                        'xs',
                                                                    )}
                                                                    onClick={() =>
                                                                        setRevoking(
                                                                            row,
                                                                        )
                                                                    }
                                                                    title={`Revoke ${row.email}`}
                                                                >
                                                                    <UserMinus className="size-3.5" />
                                                                    <span>
                                                                        Revoke
                                                                    </span>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </Card>
                            </div>
                        )}

                        {/* TAB 3: PARTNER ORGS */}
                        {activeTab === 'orgs' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-end gap-2">
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => {
                                            setGrantingOrg((v) => !v);
                                            setAddingOrg(false);
                                        }}
                                    >
                                        <KeyRound className="h-3.5 w-3.5" />
                                        <span>Grant Org Access</span>
                                    </Button>
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() => {
                                            setAddingOrg((v) => !v);
                                            setGrantingOrg(false);
                                        }}
                                    >
                                        <Building2 className="h-3.5 w-3.5" />
                                        <span>New Partner Org</span>
                                    </Button>
                                </div>

                                {addingOrg && (
                                    <Card label="Configure Partner Organization">
                                        <Form
                                            action={sso.org(server.name).url}
                                            method="post"
                                            onSuccess={() =>
                                                setAddingOrg(false)
                                            }
                                            className="grid gap-3 sm:grid-cols-2"
                                        >
                                            <input
                                                type="text"
                                                name="zone"
                                                required
                                                placeholder="Zone / Domain (e.g. example.com)"
                                                className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                            />
                                            <input
                                                type="text"
                                                name="cloudflare_token"
                                                placeholder="Cloudflare token (optional)"
                                                className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                            />
                                            <input
                                                type="text"
                                                name="org_name"
                                                placeholder="Organization name (optional)"
                                                className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                            />
                                            <input
                                                type="email"
                                                name="admin_email"
                                                placeholder="Admin email (optional)"
                                                className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                            />
                                            <div className="col-span-full flex justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() =>
                                                        setAddingOrg(false)
                                                    }
                                                >
                                                    <XCircle className="h-3.5 w-3.5" />
                                                    <span>Cancel</span>
                                                </Button>
                                                <Button
                                                    type="submit"
                                                    variant="primary"
                                                    size="sm"
                                                >
                                                    <Building2 className="h-4 w-4" />
                                                    <span>Configure Org</span>
                                                </Button>
                                            </div>
                                        </Form>
                                    </Card>
                                )}

                                {grantingOrg && (
                                    <Card label="Grant Organization Tool Access">
                                        <Form
                                            action={
                                                sso.orgGrant(server.name).url
                                            }
                                            method="post"
                                            onSuccess={() => {
                                                setGrantingOrg(false);
                                                setOrgGrantDomainInput('');
                                            }}
                                            className="grid gap-3 sm:grid-cols-4"
                                        >
                                            <input
                                                type="text"
                                                name="org"
                                                required
                                                placeholder="Organization name or ID"
                                                className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                            />
                                            <select
                                                name="tool"
                                                required
                                                defaultValue=""
                                                onChange={(e) => {
                                                    const match =
                                                        wiredTools.find(
                                                            (w) =>
                                                                (w.slug ||
                                                                    w.tool) ===
                                                                e.target.value,
                                                        );
                                                    if (match?.host) {
                                                        setOrgGrantDomainInput(
                                                            match.host,
                                                        );
                                                    }
                                                }}
                                                className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                            >
                                                <option value="" disabled>
                                                    Select tool
                                                </option>
                                                {wiredTools.map((w) => (
                                                    <option
                                                        key={`${w.slug}-${w.instance}`}
                                                        value={w.slug || w.tool}
                                                    >
                                                        {w.tool}{' '}
                                                        {w.instance
                                                            ? `(${w.instance})`
                                                            : ''}
                                                    </option>
                                                ))}
                                            </select>
                                            <input
                                                type="text"
                                                name="domain"
                                                required
                                                value={orgGrantDomainInput}
                                                onChange={(e) =>
                                                    setOrgGrantDomainInput(
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="Domain (e.g. git.example.com)"
                                                className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                            />
                                            <select
                                                name="role[]"
                                                defaultValue="developer"
                                                className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                            >
                                                <option value="developer">
                                                    developer (read-write)
                                                </option>
                                                <option value="viewer">
                                                    viewer (read-only)
                                                </option>
                                            </select>
                                            <div className="col-span-full flex justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() =>
                                                        setGrantingOrg(false)
                                                    }
                                                >
                                                    <XCircle className="h-3.5 w-3.5" />
                                                    <span>Cancel</span>
                                                </Button>
                                                <Button
                                                    type="submit"
                                                    variant="primary"
                                                    size="sm"
                                                >
                                                    <KeyRound className="h-4 w-4" />
                                                    <span>
                                                        Grant Org Access
                                                    </span>
                                                </Button>
                                            </div>
                                        </Form>
                                    </Card>
                                )}

                                <Card className="overflow-hidden p-0">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs">
                                            <thead>
                                                <tr className="border-b border-line bg-paper/50 text-soft">
                                                    <th className="px-5 py-3 font-medium">
                                                        Organization
                                                    </th>
                                                    <th className="px-5 py-3 font-medium">
                                                        Org ID
                                                    </th>
                                                    <th className="px-5 py-3 font-medium">
                                                        Domain Verified
                                                    </th>
                                                    <th className="px-5 py-3 text-right font-medium">
                                                        Actions
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-line text-ink">
                                                {orgs.length === 0 ? (
                                                    <tr>
                                                        <td
                                                            colSpan={4}
                                                            className="px-5 py-8 text-center text-soft"
                                                        >
                                                            No partner
                                                            organizations
                                                            configured.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    orgs.map((row, idx) => {
                                                        const isPrimary =
                                                            idx === 0 ||
                                                            (resolved.org !==
                                                                undefined &&
                                                                row.name ===
                                                                    resolved.org);
                                                        return (
                                                            <tr
                                                                key={
                                                                    row.orgId ||
                                                                    row.name
                                                                }
                                                                className="transition hover:bg-paper/30"
                                                            >
                                                                <td className="px-5 py-3.5 font-medium text-ink">
                                                                    <div className="flex items-center gap-2">
                                                                        <span>
                                                                            {
                                                                                row.name
                                                                            }
                                                                        </span>
                                                                        {isPrimary && (
                                                                            <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                                                                                Primary
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="px-5 py-3.5 font-mono text-soft">
                                                                    {row.orgId}
                                                                </td>
                                                                <td className="px-5 py-3.5">
                                                                    {row.domainVerified ? (
                                                                        <span className="text-emerald-600 dark:text-emerald-400">
                                                                            yes
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-soft">
                                                                            no
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="px-5 py-3.5 text-right">
                                                                    {isPrimary ? (
                                                                        <span className="text-soft">
                                                                            —
                                                                        </span>
                                                                    ) : (
                                                                        <Button
                                                                            type="button"
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            onClick={() => {
                                                                                setRemovingOrg(
                                                                                    row.name,
                                                                                );
                                                                                setRemoveOrgConfirm(
                                                                                    '',
                                                                                );
                                                                                setRemoveOrgWithMail(
                                                                                    row.name.includes(
                                                                                        '.',
                                                                                    ),
                                                                                );
                                                                            }}
                                                                            title={`Offboard ${row.name}`}
                                                                        >
                                                                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                                                            <span className="text-red-500">
                                                                                Offboard
                                                                            </span>
                                                                        </Button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </Card>

                                {removingOrg && (
                                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
                                        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
                                            <div className="mb-4 flex items-center justify-between">
                                                <h3 className="text-base font-semibold text-ink">
                                                    Offboard Partner
                                                    Organization
                                                </h3>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setRemovingOrg(null)
                                                    }
                                                    className="text-soft transition hover:text-ink"
                                                >
                                                    <XCircle className="h-5 w-5" />
                                                </button>
                                            </div>

                                            <div className="rounded-lg bg-red-500/10 p-3 text-xs text-red-600 ring-1 ring-red-500/20 dark:text-red-400">
                                                <p className="font-semibold">
                                                    This permanently deletes{' '}
                                                    <strong>
                                                        {removingOrg}
                                                    </strong>{' '}
                                                    from Zitadel SSO:
                                                </p>
                                                <ul className="mt-1.5 list-inside list-disc space-y-0.5">
                                                    <li>
                                                        all human and machine
                                                        users under this
                                                        organization
                                                    </li>
                                                    <li>
                                                        verified custom domain
                                                        claims &amp; RBAC
                                                        actions
                                                    </li>
                                                    <li>
                                                        all cross-organization
                                                        project grants and role
                                                        assignments
                                                    </li>
                                                </ul>
                                            </div>

                                            <Form
                                                action={`/servers/${encodeURIComponent(server.name)}/sso/org-delete`}
                                                method="post"
                                                disableWhileProcessing
                                                onSuccess={() => {
                                                    setRemovingOrg(null);
                                                    setRemoveOrgConfirm('');
                                                }}
                                                className="mt-4 space-y-4"
                                            >
                                                <input
                                                    type="hidden"
                                                    name="org"
                                                    value={removingOrg}
                                                />
                                                {removeOrgWithMail && (
                                                    <input
                                                        type="hidden"
                                                        name="with_mail"
                                                        value="1"
                                                    />
                                                )}

                                                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-paper/60 p-3 text-xs text-ink">
                                                    <input
                                                        type="checkbox"
                                                        checked={
                                                            removeOrgWithMail
                                                        }
                                                        onChange={(e) =>
                                                            setRemoveOrgWithMail(
                                                                e.target
                                                                    .checked,
                                                            )
                                                        }
                                                        className="mt-0.5 rounded border-line text-brand focus:ring-brand"
                                                    />
                                                    <div>
                                                        <div className="font-medium text-ink">
                                                            Also remove domain
                                                            &amp; mailboxes from
                                                            Stalwart Mail
                                                        </div>
                                                        <div className="mt-0.5 text-[11px] text-soft">
                                                            If{' '}
                                                            <span className="font-mono">
                                                                {removingOrg}
                                                            </span>{' '}
                                                            is configured in
                                                            Mail, permanently
                                                            delete its mailboxes
                                                            and DKIM keys too.
                                                        </div>
                                                    </div>
                                                </label>

                                                <div>
                                                    <label className="block text-xs font-medium text-soft">
                                                        Type{' '}
                                                        <strong className="text-ink">
                                                            {removingOrg}
                                                        </strong>{' '}
                                                        to confirm
                                                    </label>
                                                    <input
                                                        type="text"
                                                        name="confirm"
                                                        required
                                                        autoComplete="off"
                                                        value={removeOrgConfirm}
                                                        onChange={(e) =>
                                                            setRemoveOrgConfirm(
                                                                e.target.value,
                                                            )
                                                        }
                                                        placeholder={
                                                            removingOrg
                                                        }
                                                        className="placeholder:text-muted mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                                    />
                                                </div>

                                                <div className="flex items-center justify-end gap-2">
                                                    <Button
                                                        type="button"
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() =>
                                                            setRemovingOrg(null)
                                                        }
                                                    >
                                                        <XCircle className="h-4 w-4" />
                                                        <span>Cancel</span>
                                                    </Button>
                                                    <Button
                                                        type="submit"
                                                        variant="dangerFill"
                                                        size="sm"
                                                        disabled={
                                                            removeOrgConfirm
                                                                .trim()
                                                                .toLowerCase() !==
                                                            removingOrg.toLowerCase()
                                                        }
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                        <span>
                                                            Offboard
                                                            Organization
                                                        </span>
                                                    </Button>
                                                </div>
                                            </Form>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* TAB 4: USERS & CLEANUP */}
                        {activeTab === 'users' && (
                            <div className="grid gap-6 lg:grid-cols-2">
                                <Card label="Create Zitadel User">
                                    <p className="mb-4 text-xs text-soft">
                                        Provision a new human identity in
                                        Zitadel on{' '}
                                        <span className="font-medium text-ink">
                                            {server.name}
                                        </span>
                                        . You can then grant the user access to
                                        wired tools from the Access Grants tab.
                                    </p>
                                    <Form
                                        action={sso.create(server.name).url}
                                        method="post"
                                        resetOnSuccess
                                        className="space-y-3"
                                    >
                                        <input
                                            type="email"
                                            name="email"
                                            required
                                            placeholder="Email address (e.g. alice@example.com)"
                                            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                        />
                                        <input
                                            type="text"
                                            name="name"
                                            placeholder="Display name (optional)"
                                            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                        />
                                        <input
                                            type="password"
                                            name="password"
                                            placeholder="Initial password (optional — generated if blank)"
                                            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                        />
                                        <div className="flex justify-end">
                                            <Button
                                                type="submit"
                                                variant="primary"
                                                size="sm"
                                            >
                                                <UserPlus className="h-4 w-4" />
                                                <span>Create User</span>
                                            </Button>
                                        </div>
                                    </Form>
                                </Card>

                                <Card
                                    label="Orphaned Zitadel Projects"
                                    action={
                                        orphanedProjects.length > 0 ? (
                                            <Button
                                                variant="danger"
                                                size="sm"
                                                disabled={
                                                    selectedProjects.length ===
                                                    0
                                                }
                                                onClick={() => setPruning(true)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                                <span>Prune Selected</span>
                                            </Button>
                                        ) : undefined
                                    }
                                >
                                    {orphanedProjects.length === 0 ? (
                                        <p className="text-xs text-soft">
                                            No orphaned Zitadel projects found
                                            on {server.name}.
                                        </p>
                                    ) : (
                                        <div className="space-y-2">
                                            {orphanedProjects.map((project) => {
                                                const checked =
                                                    selectedProjects.includes(
                                                        project,
                                                    );
                                                return (
                                                    <label
                                                        key={project}
                                                        className="flex cursor-pointer items-center gap-2.5 text-xs text-ink"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => {
                                                                setSelectedProjects(
                                                                    (prev) =>
                                                                        checked
                                                                            ? prev.filter(
                                                                                  (
                                                                                      p,
                                                                                  ) =>
                                                                                      p !==
                                                                                      project,
                                                                              )
                                                                            : [
                                                                                  ...prev,
                                                                                  project,
                                                                              ],
                                                                );
                                                            }}
                                                            className="rounded border-line bg-paper text-accent focus:ring-accent"
                                                        />
                                                        <span className="font-mono">
                                                            {project}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </Card>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
