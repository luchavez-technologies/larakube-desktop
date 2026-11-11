import { Form, Head, usePoll } from '@inertiajs/react';
import { useEffect, useMemo, useState } from 'react';
import {
    ChevronDown,
    ChevronUp,
    Download,
    FileCode2,
    Lock,
    Plug,
    RefreshCw,
    RotateCw,
    Search,
    ShieldCheck,
    ShieldOff,
    Unlink,
    Upload,
    UserMinus,
    UserPlus,
    XCircle,
} from 'lucide-react';
import Button, { buttonClass } from '@/components/button';
import Card from '@/components/card';
import ServerSwitcher from '@/components/server-switcher';
import StickyTabs, { type StickyTabItem } from '@/components/sticky-tabs';
import ExperimentalBadge from '@/components/experimental-badge';
import ToolLogo from '@/components/tool-logo';
import SyncStatusBadge, {
    type SyncStatus,
} from '@/components/sync-status-badge';
import openbao, { index as openBaoIndex } from '@/routes/servers/openbao';
import type { Server } from '@/types/larakube';

type StaticRoleRow = {
    tool: string;
    slug: string;
    instance: string;
    role: string;
    rotationPeriod: string | null;
    lastRotatedAt: string | null;
    wired: boolean;
};

type CustomEnvRow = {
    tool: string;
    slug: string;
    instance: string;
    plainCount: number;
    secretCount: number;
    vaulted: boolean;
};

type Status = {
    installed: boolean;
    bootstrapped?: boolean;
    sealed?: boolean | null;
    staticRoles?: StaticRoleRow[];
    customEnv?: CustomEnvRow[];
};

type Props = {
    server: Server;
    servers: Server[];
    isInstalled: boolean;
    status?: Status;
    openBaoSync: {
        status: SyncStatus;
        lastSyncedAt: string | null;
        error: string | null;
    };
};

type TabType = 'rotation' | 'grants' | 'env' | 'backup';

function timeAgo(iso: string | null): string {
    if (!iso) {
        return '—';
    }

    const seconds = Math.max(
        0,
        Math.floor((Date.now() - new Date(iso).getTime()) / 1000),
    );

    if (seconds < 60) {
        return 'just now';
    }
    if (seconds < 3600) {
        return `${Math.floor(seconds / 60)}m ago`;
    }
    if (seconds < 86400) {
        return `${Math.floor(seconds / 3600)}h ago`;
    }

    return `${Math.floor(seconds / 86400)}d ago`;
}

function Pulse({ className }: { className?: string }) {
    return <div className={`animate-pulse rounded-md bg-paper ${className}`} />;
}

function OpenBaoSkeleton() {
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

function OpenBaoEmptyState({ server }: { server: Server }) {
    return (
        <div className="rounded-2xl border border-line bg-surface/60 p-8 backdrop-blur-xs">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20">
                <ShieldCheck className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-ink">
                OpenBao is not deployed on {server.name}
            </h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-soft">
                OpenBao is LaraKube&rsquo;s secrets backend: automatic database
                credential rotation, a backup copy of every generated secret,
                and scoped access grants. Deploy it from the App Store (search
                &ldquo;OpenBao&rdquo;) to manage it here.
            </p>
        </div>
    );
}

export default function OpenBaoIndex({
    server,
    servers,
    isInstalled,
    status,
    openBaoSync,
}: Props) {
    const [activeTab, setActiveTab] = useState<TabType>('rotation');
    const [importing, setImporting] = useState(false);
    const [importPath, setImportPath] = useState('');
    const [importConfirm, setImportConfirm] = useState('');
    const [granting, setGranting] = useState(false);
    const [revokingAccess, setRevokingAccess] = useState(false);
    const [sealing, setSealing] = useState(false);

    const [rotationSearch, setRotationSearch] = useState('');
    const [customEnvSearch, setCustomEnvSearch] = useState('');
    const [sort, setSort] = useState<{
        key: 'tool' | 'rotationPeriod' | 'lastRotatedAt';
        direction: 'asc' | 'desc';
    } | null>(null);

    const shouldPoll =
        isInstalled &&
        (openBaoSync.status === 'syncing' || openBaoSync.status === 'stale');

    const { start, stop } = usePoll(
        2000,
        { only: ['status', 'openBaoSync'] },
        { autoStart: shouldPoll },
    );

    useEffect(() => {
        if (shouldPoll) {
            start();
        } else {
            stop();
        }
    }, [shouldPoll, start, stop]);

    const loading = isInstalled && status === undefined;
    const resolved: Status = status ?? { installed: isInstalled };
    const staticRoles = resolved.staticRoles ?? [];
    const customEnv = resolved.customEnv ?? [];
    const sealed = resolved.sealed ?? null;

    const filteredStaticRoles = useMemo(() => {
        if (!rotationSearch.trim()) return staticRoles;
        const q = rotationSearch.toLowerCase();
        return staticRoles.filter(
            (r) =>
                r.tool.toLowerCase().includes(q) ||
                r.slug.toLowerCase().includes(q) ||
                r.instance.toLowerCase().includes(q) ||
                (r.rotationPeriod?.toLowerCase().includes(q) ?? false),
        );
    }, [staticRoles, rotationSearch]);

    const sortedStaticRoles = useMemo(() => {
        if (!sort) return filteredStaticRoles;
        return [...filteredStaticRoles].sort((a, b) => {
            const aVal = (a[sort.key] ?? '').toLowerCase();
            const bVal = (b[sort.key] ?? '').toLowerCase();
            const cmp = aVal.localeCompare(bVal);
            return sort.direction === 'asc' ? cmp : -cmp;
        });
    }, [filteredStaticRoles, sort]);

    function handleSort(key: 'tool' | 'rotationPeriod' | 'lastRotatedAt') {
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

    const filteredCustomEnv = useMemo(() => {
        if (!customEnvSearch.trim()) return customEnv;
        const q = customEnvSearch.toLowerCase();
        return customEnv.filter(
            (c) =>
                c.tool.toLowerCase().includes(q) ||
                c.slug.toLowerCase().includes(q) ||
                c.instance.toLowerCase().includes(q),
        );
    }, [customEnv, customEnvSearch]);

    const tabs: Array<StickyTabItem<TabType>> = [
        {
            id: 'rotation',
            label: 'Rotation',
            icon: RefreshCw,
            badge: staticRoles.length,
        },
        {
            id: 'grants',
            label: 'Access Grants',
            icon: UserPlus,
        },
        {
            id: 'env',
            label: 'Custom Env',
            icon: FileCode2,
            badge: customEnv.length,
        },
        {
            id: 'backup',
            label: 'Backup & Seal',
            icon: ShieldCheck,
            badge:
                resolved.bootstrapped && sealed !== null
                    ? sealed
                        ? 'Sealed'
                        : 'Unsealed'
                    : undefined,
        },
    ];

    return (
        <>
            <Head title={`OpenBao · ${server.name}`} />

            <div className="mx-auto max-w-7xl space-y-6">
                {/* Header with Server Switcher */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <ToolLogo slug="openbao" size="sm" />
                            <h1 className="text-xl font-bold tracking-tight text-ink">
                                Secrets Management
                            </h1>
                            <ExperimentalBadge side="bottom" />
                            {isInstalled && resolved.bootstrapped && (
                                <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                                    OpenBao Active
                                </span>
                            )}
                            {isInstalled && resolved.bootstrapped && (
                                <span
                                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${
                                        sealed
                                            ? 'bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400'
                                            : 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400'
                                    }`}
                                >
                                    {sealed ? (
                                        <ShieldOff className="size-3" />
                                    ) : (
                                        <ShieldCheck className="size-3" />
                                    )}
                                    {sealed ? 'Sealed' : 'Unsealed'}
                                </span>
                            )}
                            {isInstalled && (
                                <SyncStatusBadge
                                    status={openBaoSync.status}
                                    lastSyncedAt={openBaoSync.lastSyncedAt}
                                    error={openBaoSync.error}
                                    subject="OpenBao"
                                />
                            )}
                        </div>
                        <p className="mt-1 text-xs text-soft">
                            Secrets backend: database credential rotation,
                            backup copies, and scoped access grants.
                        </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2.5 sm:justify-end">
                        {isInstalled && (
                            <Form
                                action={openbao.refresh(server.name).url}
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

                        {isInstalled && resolved.bootstrapped && sealed && (
                            <Form
                                action={openbao.unseal(server.name).url}
                                method="post"
                            >
                                <button
                                    type="submit"
                                    className={buttonClass('primary', 'sm')}
                                    title="Unseal OpenBao using its stored unseal key"
                                >
                                    <Lock className="h-3.5 w-3.5" />
                                    <span>Unseal</span>
                                </button>
                            </Form>
                        )}

                        {isInstalled && resolved.bootstrapped && !sealed && (
                            <Button
                                variant="danger"
                                size="sm"
                                onClick={() => setSealing(true)}
                                title="Seal OpenBao — blocks all secret access cluster-wide until unsealed"
                            >
                                <ShieldOff className="h-3.5 w-3.5" />
                                <span>Seal</span>
                            </Button>
                        )}

                        <ServerSwitcher
                            servers={servers}
                            value={server.name}
                            buildHref={(name) => openBaoIndex(name).url}
                        />
                    </div>
                </div>

                {sealing && (
                    <div className="space-y-3 rounded-xl bg-accent-tint p-4 ring-1 ring-accent-line">
                        <p className="text-xs text-accent">
                            Sealing OpenBao immediately blocks{' '}
                            <strong>all</strong> secret access cluster-wide —
                            every pod reading a secret through it (database
                            password rotation, custom env var reveals, access
                            grants) stops working until it&rsquo;s unsealed
                            again. It does not delete anything and does not
                            restart any pod; already-running pods keep the
                            values they already loaded, but anything that asks
                            OpenBao for a secret while sealed fails until you
                            click Unseal.
                        </p>
                        <div className="flex items-center justify-end gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setSealing(false)}
                            >
                                <XCircle className="h-3.5 w-3.5" />
                                <span>Cancel</span>
                            </Button>
                            <Form
                                action={openbao.seal(server.name).url}
                                method="post"
                                onSuccess={() => setSealing(false)}
                            >
                                <button
                                    type="submit"
                                    className={buttonClass('dangerFill', 'sm')}
                                >
                                    <ShieldOff className="h-4 w-4" />
                                    <span>Seal OpenBao</span>
                                </button>
                            </Form>
                        </div>
                    </div>
                )}

                {!isInstalled ? (
                    <OpenBaoEmptyState server={server} />
                ) : loading ? (
                    <OpenBaoSkeleton />
                ) : (
                    <div className="space-y-6">
                        <StickyTabs
                            tabs={tabs}
                            activeTab={activeTab}
                            onChange={setActiveTab}
                        />

                        {/* TAB 1: ROTATION */}
                        {activeTab === 'rotation' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="relative w-64">
                                        <Search className="text-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                        <input
                                            type="text"
                                            value={rotationSearch}
                                            onChange={(e) =>
                                                setRotationSearch(
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="Search credential rotation..."
                                            className="placeholder:text-muted w-full rounded-lg border border-line bg-surface py-1.5 pr-3 pl-9 text-xs text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                                        />
                                    </div>
                                </div>

                                {staticRoles.length === 0 ? (
                                    <Card label="Credential Rotation">
                                        <p className="text-xs text-soft">
                                            No tools are wired to OpenBao
                                            database rotation yet. Run{' '}
                                            <code className="rounded bg-paper px-1 py-0.5 text-[11px]">
                                                larakube secrets:wire
                                                --tool=&lt;tool&gt;
                                            </code>{' '}
                                            on a Commons-backed tool to wire
                                            one.
                                        </p>
                                    </Card>
                                ) : (
                                    <Card className="overflow-hidden p-0">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left text-xs">
                                                <thead>
                                                    <tr className="border-b border-line bg-paper/50 text-soft">
                                                        <th
                                                            className="cursor-pointer px-5 py-3 font-medium transition select-none hover:text-ink"
                                                            onClick={() =>
                                                                handleSort(
                                                                    'tool',
                                                                )
                                                            }
                                                        >
                                                            <div className="flex items-center gap-1.5">
                                                                <span>
                                                                    Tool
                                                                </span>
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
                                                        <th className="px-5 py-3 font-medium">
                                                            Instance
                                                        </th>
                                                        <th
                                                            className="cursor-pointer px-5 py-3 font-medium transition select-none hover:text-ink"
                                                            onClick={() =>
                                                                handleSort(
                                                                    'rotationPeriod',
                                                                )
                                                            }
                                                        >
                                                            <div className="flex items-center gap-1.5">
                                                                <span>
                                                                    Rotation
                                                                    Period
                                                                </span>
                                                                {sort?.key ===
                                                                    'rotationPeriod' &&
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
                                                                handleSort(
                                                                    'lastRotatedAt',
                                                                )
                                                            }
                                                        >
                                                            <div className="flex items-center gap-1.5">
                                                                <span>
                                                                    Last Rotated
                                                                </span>
                                                                {sort?.key ===
                                                                    'lastRotatedAt' &&
                                                                    (sort.direction ===
                                                                    'asc' ? (
                                                                        <ChevronUp className="h-3.5 w-3.5" />
                                                                    ) : (
                                                                        <ChevronDown className="h-3.5 w-3.5" />
                                                                    ))}
                                                            </div>
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
                                                    {sortedStaticRoles.length ===
                                                    0 ? (
                                                        <tr>
                                                            <td
                                                                colSpan={6}
                                                                className="px-5 py-8 text-center text-soft"
                                                            >
                                                                No credential
                                                                rotation found.
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        sortedStaticRoles.map(
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
                                                                        {row.rotationPeriod ??
                                                                            '—'}
                                                                    </td>
                                                                    <td className="px-5 py-3.5 text-soft">
                                                                        {timeAgo(
                                                                            row.lastRotatedAt,
                                                                        )}
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
                                                                        <div className="flex items-center justify-end gap-2">
                                                                            {row.wired &&
                                                                                !sealed && (
                                                                                    <Form
                                                                                        action={
                                                                                            openbao.rotate(
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
                                                                                                row.tool
                                                                                            }
                                                                                        />
                                                                                        <button
                                                                                            type="submit"
                                                                                            className={buttonClass(
                                                                                                'ghost',
                                                                                                'xs',
                                                                                            )}
                                                                                            title="Rotate now"
                                                                                        >
                                                                                            <RotateCw className="size-3.5" />
                                                                                            <span>
                                                                                                Rotate
                                                                                            </span>
                                                                                        </button>
                                                                                    </Form>
                                                                                )}
                                                                            {row.wired ? (
                                                                                <Form
                                                                                    action={`/servers/${server.name}/apps/${row.slug || row.tool}/unwire`}
                                                                                    method="post"
                                                                                    className="inline-block"
                                                                                >
                                                                                    <input
                                                                                        type="hidden"
                                                                                        name="capability"
                                                                                        value="rotation"
                                                                                    />
                                                                                    <input
                                                                                        type="hidden"
                                                                                        name="domain"
                                                                                        value={
                                                                                            row.instance ||
                                                                                            ''
                                                                                        }
                                                                                    />
                                                                                    <button
                                                                                        type="submit"
                                                                                        className={buttonClass(
                                                                                            'ghost',
                                                                                            'xs',
                                                                                        )}
                                                                                        title={`Unwire ${row.tool} rotation`}
                                                                                    >
                                                                                        <Unlink className="size-3.5" />
                                                                                        <span>
                                                                                            Unwire
                                                                                        </span>
                                                                                    </button>
                                                                                </Form>
                                                                            ) : (
                                                                                !sealed && (
                                                                                    <Form
                                                                                        action={`/servers/${server.name}/apps/${row.slug || row.tool}/wire`}
                                                                                        method="post"
                                                                                        className="inline-block"
                                                                                    >
                                                                                        <input
                                                                                            type="hidden"
                                                                                            name="capability"
                                                                                            value="rotation"
                                                                                        />
                                                                                        <input
                                                                                            type="hidden"
                                                                                            name="domain"
                                                                                            value={
                                                                                                row.instance ||
                                                                                                ''
                                                                                            }
                                                                                        />
                                                                                        <button
                                                                                            type="submit"
                                                                                            className={buttonClass(
                                                                                                'secondary',
                                                                                                'xs',
                                                                                            )}
                                                                                            title={`Wire ${row.tool} rotation`}
                                                                                        >
                                                                                            <Plug className="size-3.5" />
                                                                                            <span>
                                                                                                Wire
                                                                                            </span>
                                                                                        </button>
                                                                                    </Form>
                                                                                )
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ),
                                                        )
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </Card>
                                )}
                            </div>
                        )}

                        {/* TAB 2: ACCESS GRANTS */}
                        {activeTab === 'grants' && (
                            <div className="space-y-6">
                                <Card
                                    label="Scoped Secret Access Grants"
                                    action={
                                        !sealed && (
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => {
                                                        setRevokingAccess(
                                                            (v) => !v,
                                                        );
                                                        setGranting(false);
                                                    }}
                                                >
                                                    <UserMinus className="h-4 w-4" />
                                                    <span>Revoke Access</span>
                                                </Button>
                                                <Button
                                                    variant="primary"
                                                    size="sm"
                                                    onClick={() => {
                                                        setGranting((v) => !v);
                                                        setRevokingAccess(
                                                            false,
                                                        );
                                                    }}
                                                >
                                                    <UserPlus className="h-4 w-4" />
                                                    <span>Grant Access</span>
                                                </Button>
                                            </div>
                                        )
                                    }
                                >
                                    <p className="text-xs text-soft">
                                        Grants and revocations are app-scoped
                                        and audited through Zitadel. Use the
                                        actions above to grant or revoke
                                        developer/viewer access to an
                                        application&rsquo;s secret path in
                                        OpenBao.
                                    </p>

                                    {granting && (
                                        <Form
                                            action={
                                                openbao.grant(server.name).url
                                            }
                                            method="post"
                                            onSuccess={() => setGranting(false)}
                                            className="mt-4 grid gap-3 rounded-xl border border-line bg-paper/40 p-4 sm:grid-cols-3"
                                        >
                                            <input
                                                type="text"
                                                name="app"
                                                required
                                                placeholder="App name"
                                                className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                            />
                                            <input
                                                type="email"
                                                name="email"
                                                required
                                                placeholder="user@example.com"
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
                                    )}

                                    {revokingAccess && (
                                        <Form
                                            action={
                                                openbao.revoke(server.name).url
                                            }
                                            method="post"
                                            onSuccess={() =>
                                                setRevokingAccess(false)
                                            }
                                            className="mt-4 grid gap-3 rounded-xl border border-line bg-paper/40 p-4 sm:grid-cols-2"
                                        >
                                            <input
                                                type="text"
                                                name="app"
                                                required
                                                placeholder="App name"
                                                className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                            />
                                            <input
                                                type="email"
                                                name="email"
                                                required
                                                placeholder="user@example.com"
                                                className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                            />
                                            <div className="col-span-full flex justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() =>
                                                        setRevokingAccess(false)
                                                    }
                                                >
                                                    <XCircle className="h-3.5 w-3.5" />
                                                    <span>Cancel</span>
                                                </Button>
                                                <Button
                                                    type="submit"
                                                    variant="dangerFill"
                                                    size="sm"
                                                >
                                                    <UserMinus className="h-4 w-4" />
                                                    <span>Revoke</span>
                                                </Button>
                                            </div>
                                        </Form>
                                    )}
                                </Card>
                            </div>
                        )}

                        {/* TAB 3: CUSTOM ENV */}
                        {activeTab === 'env' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="relative w-64">
                                        <Search className="text-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                        <input
                                            type="text"
                                            value={customEnvSearch}
                                            onChange={(e) =>
                                                setCustomEnvSearch(
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="Search custom environment variables..."
                                            className="placeholder:text-muted w-full rounded-lg border border-line bg-surface py-1.5 pr-3 pl-9 text-xs text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                                        />
                                    </div>
                                </div>

                                {customEnv.length === 0 ? (
                                    <Card label="Custom Environment Variables">
                                        <p className="text-xs text-soft">
                                            No registered tool instance has
                                            custom environment variables yet.
                                        </p>
                                    </Card>
                                ) : (
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
                                                            Plain
                                                        </th>
                                                        <th className="px-5 py-3 font-medium">
                                                            Secret
                                                        </th>
                                                        <th className="px-5 py-3 font-medium">
                                                            Vaulted
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-line text-ink">
                                                    {filteredCustomEnv.length ===
                                                    0 ? (
                                                        <tr>
                                                            <td
                                                                colSpan={5}
                                                                className="px-5 py-8 text-center text-soft"
                                                            >
                                                                No custom
                                                                environment
                                                                variables found.
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        filteredCustomEnv.map(
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
                                                                        {
                                                                            row.plainCount
                                                                        }
                                                                    </td>
                                                                    <td className="px-5 py-3.5 text-soft">
                                                                        {
                                                                            row.secretCount
                                                                        }
                                                                    </td>
                                                                    <td className="px-5 py-3.5">
                                                                        {row.vaulted ? (
                                                                            <span className="text-emerald-600 dark:text-emerald-400">
                                                                                yes
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-soft">
                                                                                no
                                                                            </span>
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
                                )}
                            </div>
                        )}

                        {/* TAB 4: BACKUP & SEAL */}
                        {activeTab === 'backup' && (
                            <div className="grid gap-6 lg:grid-cols-2">
                                <Card label="Backup & Restore">
                                    <p className="mb-4 text-xs text-soft">
                                        Export every OpenBao secret on{' '}
                                        <span className="font-medium text-ink">
                                            {server.name}
                                        </span>{' '}
                                        to a local JSON archive, or restore from
                                        a previous export.
                                    </p>
                                    <div className="flex flex-wrap items-center gap-2.5">
                                        <Form
                                            action={
                                                openbao.export(server.name).url
                                            }
                                            method="post"
                                        >
                                            <button
                                                type="submit"
                                                className={buttonClass(
                                                    'secondary',
                                                    'md',
                                                )}
                                                title="Export every secret to a local JSON file"
                                            >
                                                <Download className="h-4 w-4" />
                                                <span>Export Secrets</span>
                                            </button>
                                        </Form>

                                        <Button
                                            variant="secondary"
                                            size="md"
                                            onClick={() => setImporting(true)}
                                        >
                                            <Upload className="h-4 w-4" />
                                            <span>Import Secrets</span>
                                        </Button>
                                    </div>

                                    {importing && (
                                        <Form
                                            action={
                                                openbao.import(server.name).url
                                            }
                                            method="post"
                                            onSuccess={() => {
                                                setImporting(false);
                                                setImportPath('');
                                                setImportConfirm('');
                                            }}
                                            className="mt-4 space-y-3 rounded-xl bg-accent-tint p-4 ring-1 ring-accent-line"
                                        >
                                            <p className="text-xs text-accent">
                                                This overwrites live secrets on{' '}
                                                {server.name} from the file
                                                below.
                                            </p>
                                            <input
                                                type="text"
                                                name="path"
                                                required
                                                value={importPath}
                                                onChange={(e) =>
                                                    setImportPath(
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="/path/to/secrets-export.json"
                                                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                            />
                                            <div>
                                                <label className="block text-xs font-medium text-soft">
                                                    Type{' '}
                                                    <strong className="text-ink">
                                                        {server.name}
                                                    </strong>{' '}
                                                    to confirm
                                                </label>
                                                <input
                                                    type="text"
                                                    name="confirm"
                                                    required
                                                    autoComplete="off"
                                                    value={importConfirm}
                                                    onChange={(e) =>
                                                        setImportConfirm(
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder={server.name}
                                                    className="mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                                />
                                            </div>
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() =>
                                                        setImporting(false)
                                                    }
                                                >
                                                    <XCircle className="h-3.5 w-3.5" />
                                                    <span>Cancel</span>
                                                </Button>
                                                <Button
                                                    type="submit"
                                                    variant="dangerFill"
                                                    size="sm"
                                                    disabled={
                                                        importConfirm !==
                                                        server.name
                                                    }
                                                >
                                                    <Upload className="h-4 w-4" />
                                                    <span>
                                                        Import & Overwrite
                                                    </span>
                                                </Button>
                                            </div>
                                        </Form>
                                    )}
                                </Card>

                                <Card label="Vault Seal State">
                                    <p className="mb-4 text-xs text-soft">
                                        When sealed, OpenBao locks its master
                                        encryption key in memory and refuses all
                                        secret reads and rotations until
                                        unsealed.
                                    </p>
                                    <div className="flex items-center justify-between rounded-xl border border-line bg-paper/40 p-4">
                                        <div className="flex items-center gap-3">
                                            {sealed ? (
                                                <ShieldOff className="h-5 w-5 text-amber-500" />
                                            ) : (
                                                <ShieldCheck className="h-5 w-5 text-emerald-500" />
                                            )}
                                            <div>
                                                <p className="text-xs font-semibold text-ink">
                                                    {sealed
                                                        ? 'Vault is Sealed'
                                                        : 'Vault is Unsealed'}
                                                </p>
                                                <p className="text-[11px] text-soft">
                                                    {sealed
                                                        ? 'Secret reads and rotations are currently blocked.'
                                                        : 'Automatic rotations and secret reads are active.'}
                                                </p>
                                            </div>
                                        </div>

                                        {resolved.bootstrapped &&
                                            (sealed ? (
                                                <Form
                                                    action={
                                                        openbao.unseal(
                                                            server.name,
                                                        ).url
                                                    }
                                                    method="post"
                                                >
                                                    <button
                                                        type="submit"
                                                        className={buttonClass(
                                                            'primary',
                                                            'sm',
                                                        )}
                                                    >
                                                        <Lock className="h-3.5 w-3.5" />
                                                        <span>Unseal</span>
                                                    </button>
                                                </Form>
                                            ) : (
                                                <Button
                                                    variant="danger"
                                                    size="sm"
                                                    onClick={() =>
                                                        setSealing(true)
                                                    }
                                                >
                                                    <ShieldOff className="h-3.5 w-3.5" />
                                                    <span>Seal Vault</span>
                                                </Button>
                                            ))}
                                    </div>
                                </Card>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
