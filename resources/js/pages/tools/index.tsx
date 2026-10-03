import { Form, Link, router } from '@inertiajs/react';
import { useEffect, useMemo, useState } from 'react';
import {
    RotateCw,
    ExternalLink,
    Search,
    ArrowDownToLine,
    Play,
    Pause,
    Trash2,
    Plus,
    ArrowRight,
    Check,
} from 'lucide-react';
import Button, { buttonClass } from '@/components/button';
import StatusPill from '@/components/status-pill';
import FrameworkFields, { defaultAnswers } from '@/components/framework-fields';
import ToolLogo from '@/components/tool-logo';
import ViewToggle, { type ViewMode } from '@/components/view-toggle';
import AppLayout from '@/layouts/app-layout';
import { open } from '@/routes';
import { show as showRun } from '@/routes/runs';
import {
    index as toolsIndex,
    refresh,
    show as showTool,
    store,
} from '@/routes/servers/tools';
import {
    describeTool,
    toolName,
    toolTagline,
    toolCategories,
    categoryLabel,
    toolStack,
} from '@/types/larakube';
import type {
    ClusterTool,
    NewAppAnswers,
    Server,
    CompanionApp,
    ServerDomain,
} from '@/types/larakube';

type Props = {
    server: Server;
    servers: Server[];
    registered?: ClusterTool[] | null;
    lastVerified: ClusterTool[] | null;
    checkedAt: string | null;
    tools?: ClusterTool[] | null;
    installing: Record<string, number>;
    companions?: CompanionApp[] | null;
    domains?: ServerDomain[] | null;
};

const DEFAULT_COMPANIONS: CompanionApp[] = [
    {
        slug: 'adminer',
        name: 'Adminer',
        description:
            'Universal lightweight manager for MySQL, MariaDB, PostgreSQL, and SQLite.',
        icon: '🗄️',
        installed: false,
        running: false,
        paused: false,
        url: null,
    },
    {
        slug: 'phpmyadmin',
        name: 'phpMyAdmin',
        description: 'Dedicated web interface for MySQL and MariaDB servers.',
        icon: '🐬',
        installed: false,
        running: false,
        paused: false,
        url: null,
    },
    {
        slug: 'pgadmin',
        name: 'pgAdmin',
        description:
            'Full-featured web administration platform for PostgreSQL.',
        icon: '🐘',
        installed: false,
        running: false,
        paused: false,
        url: null,
    },
    {
        slug: 'redisinsight',
        name: 'RedisInsight',
        description:
            'Visual GUI for Redis keys, streams, memory, and pub/sub metrics.',
        icon: '⚡',
        installed: false,
        running: false,
        paused: false,
        url: null,
    },
    {
        slug: 'mongo-express',
        name: 'Mongo Express',
        description:
            'Web-based admin interface for MongoDB databases and documents.',
        icon: '🍃',
        installed: false,
        running: false,
        paused: false,
        url: null,
    },
];

type Filter = 'all' | 'installed' | 'available';

function matches(
    tool: ClusterTool,
    query: string,
    categoryFilter: string,
): boolean {
    const cats = toolCategories(tool);
    if (categoryFilter !== 'all') {
        if (!cats.includes(categoryFilter)) {
            return false;
        }
    }

    const needle = query.trim().toLowerCase();

    return (
        needle === '' ||
        `${toolName(tool)} ${toolTagline(tool)} ${tool.label} ${tool.host ?? ''} ${cats.join(' ')}`
            .toLowerCase()
            .includes(needle)
    );
}

/** The base domain most installed tools already share, e.g. sso.example.com → example.com. */
function suggestedDomain(tools: ClusterTool[]): string {
    const counts = new Map<string, number>();
    for (const tool of tools) {
        const host = tool.installed ? tool.host : null;
        if (!host || host.split('.').length < 3) continue;
        const base = host.split('.').slice(1).join('.');
        counts.set(base, (counts.get(base) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

function detailUrl(server: Server, tool: ClusterTool): string {
    return showTool(
        { server: server.name, tool: tool.tool },
        tool.host ? { query: { domain: tool.host } } : undefined,
    ).url;
}

const CATEGORY_FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'database', label: 'Database' },
    { value: 'backend', label: 'Backend' },
    { value: 'auth', label: 'Auth' },
    { value: 'security', label: 'Security' },
    { value: 'communication', label: 'Communication' },
    { value: 'observability', label: 'Observability' },
    { value: 'productivity', label: 'Productivity' },
    { value: 'devops', label: 'DevOps' },
    { value: 'analytics', label: 'Analytics' },
    { value: 'storage', label: 'Storage' },
] as const;

/** Whether the CLI says this tool can run as more than one instance. */
const isMultiInstance = (tool: ClusterTool): boolean =>
    tool.multiInstance === true;

export default function ToolsIndex({
    server,
    servers,
    registered,
    lastVerified,
    checkedAt,
    tools: verifiedTools,
    installing,
    companions,
    domains,
}: Props) {
    // The live check can take half a minute, so draw the last verified list
    // (or, the first time, the registry) and swap in the new one when it lands.
    const verifying = verifiedTools === undefined;
    const tools = verifiedTools ?? lastVerified ?? registered;
    // A check that lands during this visit is newer than the checkedAt prop.
    const [seenTools, setSeenTools] = useState(verifiedTools);
    const [landedAt, setLandedAt] = useState<string | null>(null);

    if (seenTools !== verifiedTools) {
        setSeenTools(verifiedTools);

        if (seenTools === undefined && verifiedTools) {
            setLandedAt(new Date().toISOString());
        }
    }
    const [installingTool, setInstallingTool] = useState<ClusterTool | null>(
        null,
    );
    const [isNewInstance, setIsNewInstance] = useState(false);

    const handleAddInstance = (tool: ClusterTool) => {
        setInstallingTool(tool);
        setIsNewInstance(true);
    };
    const [viewMode, setViewMode] = useState<ViewMode>('cards');
    const [category, setCategory] = useState<'cluster' | 'companions'>(
        'cluster',
    );
    const companionList = companions ?? DEFAULT_COMPANIONS;

    useEffect(() => {
        const saved = localStorage.getItem('larakube_view_mode_tools');
        if (saved === 'cards' || saved === 'table') {
            setViewMode(saved);
        }
    }, []);

    const handleViewModeChange = (mode: ViewMode) => {
        setViewMode(mode);
        localStorage.setItem('larakube_view_mode_tools', mode);
    };

    const [filter, setFilter] = useState<Filter>('all');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [query, setQuery] = useState('');
    const rawInstalledAll = useMemo(
        () => tools?.filter((tool) => tool.installed) ?? [],
        [tools],
    );

    // Filter out leaked subcomponent instances, ghost duplicate unshipped tools,
    // and deduplicate single-instance tools.
    const installedAll = useMemo(() => {
        const toolInstances = new Map<string, string[]>();
        for (const t of rawInstalledAll) {
            const list = toolInstances.get(t.tool) ?? [];
            if (t.instance) list.push(t.instance);
            toolInstances.set(t.tool, list);
        }

        const filtered: ClusterTool[] = [];
        const seenSingleTools = new Set<string>();
        const subcomponentKeys = [
            'client-',
            'dashboard-',
            'relay-',
            'signal-',
            'runner-',
            'worker-',
        ];

        for (const t of rawInstalledAll) {
            // 1. Ghost unshipped duplicate check: if forgejo is present, skip gitea
            if (
                t.tool === 'gitea' &&
                rawInstalledAll.some((x) => x.tool === 'forgejo')
            ) {
                continue;
            }

            // 2. Subcomponent instance leak check:
            // e.g. 'client-vpn-luchtech-dev' when 'vpn-luchtech-dev' is also an instance of this tool
            if (t.instance) {
                const instancesForTool = toolInstances.get(t.tool) ?? [];
                let isLeak = false;
                for (const pfx of subcomponentKeys) {
                    if (t.instance.startsWith(pfx)) {
                        const base = t.instance.slice(pfx.length);
                        if (instancesForTool.includes(base)) {
                            isLeak = true;
                            break;
                        }
                    }
                }
                if (isLeak) continue;
            }

            // 3. Single-instance tools: only allow one entry per tool (preferring entries with host/url)
            if (!isMultiInstance(t)) {
                if (seenSingleTools.has(t.tool)) {
                    continue;
                }
                const candidates = rawInstalledAll.filter(
                    (x) => x.tool === t.tool,
                );
                if (candidates.length > 1) {
                    const best =
                        candidates.find((x) => Boolean(x.host && x.url)) ??
                        candidates[0];
                    if (t !== best) {
                        continue;
                    }
                }
                seenSingleTools.add(t.tool);
            } else {
                // 4. Multi-instance tools: filter out ghost rows that lack both instance and host
                // when other named/hosted instances of this tool exist
                if (!t.instance && !t.host) {
                    const hasValidSibling = rawInstalledAll.some(
                        (x) =>
                            x.tool === t.tool && Boolean(x.instance || x.host),
                    );
                    if (hasValidSibling) {
                        continue;
                    }
                }
            }

            filtered.push(t);
        }

        return filtered;
    }, [rawInstalledAll]);

    const installedSlugs = new Set(installedAll.map((tool) => tool.tool));
    const availableAll =
        tools?.filter(
            (tool) => !tool.installed && !installedSlugs.has(tool.tool),
        ) ?? [];
    const installed = installedAll.filter((tool) =>
        matches(tool, query, selectedCategory),
    );
    const available = availableAll.filter((tool) =>
        matches(tool, query, selectedCategory),
    );

    return (
        <AppLayout title="Tools">
            <header className="mb-6 flex items-center justify-between gap-6">
                <div>
                    <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em]">
                        Tools
                    </h1>
                    <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-soft">
                        Cluster Tools install straight onto one of your servers.
                        Each one gets its own address and sign-in.
                    </p>
                </div>
                <div className="flex items-center gap-2.5">
                    <ViewToggle
                        mode={viewMode}
                        onChange={handleViewModeChange}
                    />
                    <label className="flex h-9 items-center gap-2.5 rounded-lg bg-surface px-3 ring-1 ring-line">
                        <span className="text-xs text-soft">Server</span>
                        <select
                            value={server.name}
                            onChange={(event) =>
                                router.visit(toolsIndex(event.target.value).url)
                            }
                            className="bg-transparent text-[13px] font-medium outline-none"
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

            <div className="mb-6 flex items-center gap-2 border-b border-line">
                <button
                    type="button"
                    onClick={() => setCategory('cluster')}
                    className={`flex items-center gap-2 border-b-2 px-3 pb-3 text-[13px] font-medium transition ${
                        category === 'cluster'
                            ? 'border-tools text-ink'
                            : 'border-transparent text-soft hover:text-ink'
                    }`}
                >
                    <span>Cluster Tools</span>
                    <span className="rounded-full bg-badge px-2 py-0.5 text-xs text-soft">
                        {tools ? tools.length : '…'}
                    </span>
                </button>
                <button
                    type="button"
                    onClick={() => setCategory('companions')}
                    className={`flex items-center gap-2 border-b-2 px-3 pb-3 text-[13px] font-medium transition ${
                        category === 'companions'
                            ? 'border-tools text-ink'
                            : 'border-transparent text-soft hover:text-ink'
                    }`}
                >
                    <span>Local Dev Companions</span>
                    <span className="rounded-full bg-badge px-2 py-0.5 text-xs text-soft">
                        {companionList.length}
                    </span>
                </button>
            </div>

            {category === 'companions' ? (
                <div className="space-y-6">
                    <div className="rounded-xl bg-surface p-4 ring-1 ring-line">
                        <h2 className="text-sm font-semibold text-ink">
                            Local Dev Companions
                        </h2>
                        <p className="mt-1 text-xs leading-relaxed text-soft">
                            Zero-configuration database & cache GUIs running
                            directly in{' '}
                            <code className="font-mono text-ink">
                                larakube-companions
                            </code>{' '}
                            on your local cluster. Available over secure local
                            domains (e.g.{' '}
                            <code className="font-mono text-ink">
                                https://adminer.test
                            </code>
                            ).
                        </p>
                    </div>
                    {viewMode === 'cards' ? (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {companionList.map((companion) => (
                                <CompanionCard
                                    key={companion.slug}
                                    companion={companion}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line ring-inset">
                            <table className="w-full text-left text-sm">
                                <thead className="border-b border-line text-xs text-soft">
                                    <tr>
                                        <th className="py-3 pr-3 pl-4 font-medium">
                                            Companion
                                        </th>
                                        <th className="px-3 py-3 font-medium">
                                            Description
                                        </th>
                                        <th className="px-3 py-3 font-medium">
                                            Status
                                        </th>
                                        <th className="px-3 py-3 font-medium">
                                            Local Address
                                        </th>
                                        <th className="py-3 pr-4 pl-3 text-right font-medium">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-line">
                                    {companionList.map((companion) => (
                                        <CompanionTableRow
                                            key={companion.slug}
                                            companion={companion}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ) : tools === undefined ? (
                <Loading server={server.name} />
            ) : tools ? (
                <>
                    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
                                <input
                                    type="search"
                                    value={query}
                                    onChange={(event) =>
                                        setQuery(event.target.value)
                                    }
                                    placeholder="Search tools or services…"
                                    className="h-9.5 w-72 rounded-xl border-0 bg-surface pr-3 pl-9 text-[13px] ring-1 ring-line transition outline-none placeholder:text-faint focus:ring-2 focus:ring-tools"
                                />
                            </div>
                            <div
                                className="flex h-9.5 items-center rounded-xl bg-badge/70 p-1 ring-1 ring-line/50"
                                role="tablist"
                            >
                                {(
                                    [
                                        [
                                            'all',
                                            'All',
                                            installedAll.length +
                                                availableAll.length,
                                        ],
                                        [
                                            'installed',
                                            'Installed',
                                            installedAll.length,
                                        ],
                                        [
                                            'available',
                                            'Available',
                                            availableAll.length,
                                        ],
                                    ] as const
                                ).map(([value, label, count]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        role="tab"
                                        aria-selected={filter === value}
                                        onClick={() => setFilter(value)}
                                        className={
                                            filter === value
                                                ? 'flex h-7.5 items-center gap-1.5 rounded-lg bg-surface px-3 text-[13px] font-medium text-ink shadow-xs ring-1 ring-line/50 transition'
                                                : 'flex h-7.5 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-soft transition hover:text-ink'
                                        }
                                    >
                                        <span>{label}</span>{' '}
                                        <span
                                            className={`text-xs ${filter === value ? 'font-semibold text-tools' : 'text-faint'}`}
                                        >
                                            {count}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <VerifyStatus
                                server={server.name}
                                verifying={verifying}
                                failed={verifiedTools === null}
                                hasLastCheck={lastVerified !== null}
                                checkedAt={landedAt ?? checkedAt}
                            />
                        </div>
                    </div>

                    <div className="mb-6 flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1">
                        {CATEGORY_FILTERS.map((cat) => {
                            const count =
                                cat.value === 'all'
                                    ? (tools?.length ?? 0)
                                    : (tools?.filter((t) =>
                                          toolCategories(t).includes(cat.value),
                                      ).length ?? 0);
                            const isActive = selectedCategory === cat.value;

                            return (
                                <button
                                    key={cat.value}
                                    type="button"
                                    onClick={() =>
                                        setSelectedCategory(cat.value)
                                    }
                                    className={`flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition ${
                                        isActive
                                            ? 'bg-tools text-white shadow-xs'
                                            : 'bg-badge/60 text-soft ring-1 ring-line/50 hover:bg-badge hover:text-ink'
                                    }`}
                                >
                                    <span>{cat.label}</span>
                                    <span
                                        className={`text-[10px] ${
                                            isActive
                                                ? 'text-white/80'
                                                : 'text-faint'
                                        }`}
                                    >
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    {viewMode === 'cards' ? (
                        <>
                            {filter !== 'available' && (
                                <Section
                                    title={`Installed on ${server.name}`}
                                    count={installed.length}
                                >
                                    {installed.map((tool) => (
                                        <InstalledCard
                                            key={`${tool.tool}-${tool.host || 'default'}`}
                                            server={server}
                                            tool={tool}
                                            onAddInstance={handleAddInstance}
                                            onCategoryClick={
                                                setSelectedCategory
                                            }
                                        />
                                    ))}
                                </Section>
                            )}
                            {filter !== 'installed' && (
                                <Section
                                    title="Available"
                                    count={available.length}
                                >
                                    {available.map((tool) => (
                                        <AvailableCard
                                            key={tool.tool}
                                            tool={tool}
                                            runId={installing[tool.tool]}
                                            disabled={verifying}
                                            onInstall={() => {
                                                setIsNewInstance(false);
                                                setInstallingTool(tool);
                                            }}
                                            onCategoryClick={
                                                setSelectedCategory
                                            }
                                        />
                                    ))}
                                </Section>
                            )}
                        </>
                    ) : (
                        <div className="space-y-7">
                            {filter !== 'available' && (
                                <section>
                                    <h2 className="mb-3 text-[11px] font-semibold tracking-[0.06em] text-soft uppercase">
                                        Installed on {server.name}{' '}
                                        <span className="font-normal text-faint">
                                            · {installed.length}
                                        </span>
                                    </h2>
                                    {installed.length === 0 ? (
                                        <p className="rounded-2xl bg-surface px-5 py-5 text-sm text-soft ring-1 ring-line ring-inset">
                                            Nothing here.
                                        </p>
                                    ) : (
                                        <div className="overflow-hidden rounded-2xl bg-surface px-5.5 ring-1 ring-line ring-inset">
                                            <table className="w-full text-left text-sm">
                                                <thead>
                                                    <tr className="text-[11px] tracking-[0.06em] text-soft uppercase">
                                                        <th className="py-3 font-medium">
                                                            Tool
                                                        </th>
                                                        <th className="py-3 font-medium">
                                                            Components & Stack
                                                        </th>
                                                        <th className="py-3 font-medium">
                                                            Categories
                                                        </th>
                                                        <th className="py-3 font-medium">
                                                            Address
                                                        </th>
                                                        <th className="py-3 font-medium">
                                                            Status
                                                        </th>
                                                        <th className="py-3 text-right font-medium"></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {installed.map((tool) => {
                                                        const tagline =
                                                            toolTagline(tool);
                                                        const name =
                                                            toolName(tool);
                                                        const cats =
                                                            toolCategories(
                                                                tool,
                                                            );
                                                        const stack =
                                                            toolStack(tool);
                                                        const url =
                                                            tool.url?.split(
                                                                ' ',
                                                            )[0] ?? null;
                                                        const href = detailUrl(
                                                            server,
                                                            tool,
                                                        );

                                                        return (
                                                            <tr
                                                                key={`${tool.tool}-${tool.host || 'default'}`}
                                                                className="border-t border-line transition-colors hover:bg-paper/30"
                                                            >
                                                                <td className="py-3.5 font-medium">
                                                                    <div className="flex items-center gap-3">
                                                                        <ToolLogo
                                                                            tool={
                                                                                tool
                                                                            }
                                                                            size="md"
                                                                        />
                                                                        <div className="flex min-w-0 flex-col">
                                                                            <div className="flex items-center gap-1.5">
                                                                                <Link
                                                                                    href={
                                                                                        href
                                                                                    }
                                                                                    className="font-semibold text-ink hover:underline"
                                                                                >
                                                                                    {
                                                                                        name
                                                                                    }
                                                                                </Link>
                                                                            </div>
                                                                            <span className="max-w-[220px] truncate text-xs text-soft">
                                                                                {
                                                                                    tagline
                                                                                }
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="py-3.5 text-xs text-soft">
                                                                    {stack.length >
                                                                    0 ? (
                                                                        <div className="flex flex-wrap items-center gap-1 font-mono text-[11px] text-ink/80">
                                                                            {stack.map(
                                                                                (
                                                                                    item,
                                                                                    idx,
                                                                                ) => (
                                                                                    <span
                                                                                        key={
                                                                                            item
                                                                                        }
                                                                                        className="inline-flex items-center"
                                                                                    >
                                                                                        <span>
                                                                                            {
                                                                                                item
                                                                                            }
                                                                                        </span>
                                                                                        {idx <
                                                                                            stack.length -
                                                                                                1 && (
                                                                                            <span className="mx-1 text-faint/60">
                                                                                                ·
                                                                                            </span>
                                                                                        )}
                                                                                    </span>
                                                                                ),
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-faint">
                                                                            —
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="py-3.5">
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {cats
                                                                            .slice(
                                                                                0,
                                                                                2,
                                                                            )
                                                                            .map(
                                                                                (
                                                                                    cat,
                                                                                ) => (
                                                                                    <button
                                                                                        key={
                                                                                            cat
                                                                                        }
                                                                                        type="button"
                                                                                        onClick={() =>
                                                                                            setSelectedCategory(
                                                                                                cat,
                                                                                            )
                                                                                        }
                                                                                        className="rounded-md bg-badge px-1.5 py-0.5 text-[10px] font-medium text-soft capitalize transition hover:bg-tools/15 hover:text-tools"
                                                                                    >
                                                                                        {categoryLabel(
                                                                                            cat,
                                                                                        )}
                                                                                    </button>
                                                                                ),
                                                                            )}
                                                                        {cats.length >
                                                                            2 && (
                                                                            <span className="self-center text-[10px] text-faint">
                                                                                +
                                                                                {cats.length -
                                                                                    2}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="py-3.5 font-mono text-[12px] text-soft">
                                                                    {tool.host ? (
                                                                        url ? (
                                                                            <Link
                                                                                href={
                                                                                    open()
                                                                                        .url
                                                                                }
                                                                                method="post"
                                                                                data={{
                                                                                    url,
                                                                                }}
                                                                                as="button"
                                                                                className="inline-flex items-center gap-1 text-left hover:text-ink hover:underline"
                                                                                title="Open in browser"
                                                                            >
                                                                                <span className="max-w-[180px] truncate">
                                                                                    {
                                                                                        tool.host
                                                                                    }
                                                                                </span>
                                                                                <ExternalLink className="size-3 shrink-0 text-faint" />
                                                                            </Link>
                                                                        ) : (
                                                                            <span className="max-w-[180px] truncate">
                                                                                {
                                                                                    tool.host
                                                                                }
                                                                            </span>
                                                                        )
                                                                    ) : (
                                                                        <span className="text-faint">
                                                                            No
                                                                            public
                                                                            address
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="py-3.5">
                                                                    <StatusPill tone="ok">
                                                                        Installed
                                                                    </StatusPill>
                                                                </td>
                                                                <td className="py-3.5 text-right">
                                                                    <div className="flex items-center justify-end gap-3">
                                                                        {isMultiInstance(
                                                                            tool,
                                                                        ) && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    handleAddInstance(
                                                                                        tool,
                                                                                    )
                                                                                }
                                                                                className="inline-flex items-center gap-1 text-xs text-soft transition hover:text-ink"
                                                                                title="Deploy an additional instance"
                                                                            >
                                                                                <Plus className="size-3" />
                                                                                <span>
                                                                                    Deploy
                                                                                    Another
                                                                                </span>
                                                                            </button>
                                                                        )}
                                                                        <Link
                                                                            href={
                                                                                href
                                                                            }
                                                                            className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
                                                                            aria-label={`Manage ${name}`}
                                                                        >
                                                                            <span>
                                                                                Manage
                                                                            </span>
                                                                            <ArrowRight className="size-3.5" />
                                                                        </Link>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </section>
                            )}

                            {filter !== 'installed' && (
                                <section>
                                    <h2 className="mb-3 text-[11px] font-semibold tracking-[0.06em] text-soft uppercase">
                                        Available{' '}
                                        <span className="font-normal text-faint">
                                            · {available.length}
                                        </span>
                                    </h2>
                                    {available.length === 0 ? (
                                        <p className="rounded-2xl bg-surface px-5 py-5 text-sm text-soft ring-1 ring-line ring-inset">
                                            Nothing here.
                                        </p>
                                    ) : (
                                        <div className="overflow-hidden rounded-2xl bg-surface px-5.5 ring-1 ring-line ring-inset">
                                            <table className="w-full text-left text-sm">
                                                <thead>
                                                    <tr className="text-[11px] tracking-[0.06em] text-soft uppercase">
                                                        <th className="py-3 font-medium">
                                                            Tool
                                                        </th>
                                                        <th className="py-3 font-medium">
                                                            What it is & Stack
                                                        </th>
                                                        <th className="py-3 font-medium">
                                                            Categories
                                                        </th>
                                                        <th className="py-3 text-right font-medium">
                                                            Action
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {available.map((tool) => {
                                                        const { summary } =
                                                            describeTool(
                                                                tool.label,
                                                            );
                                                        const tagline =
                                                            toolTagline(tool);
                                                        const name =
                                                            toolName(tool);
                                                        const cats =
                                                            toolCategories(
                                                                tool,
                                                            );
                                                        const stack =
                                                            toolStack(tool);
                                                        const runId =
                                                            installing[
                                                                tool.tool
                                                            ];

                                                        return (
                                                            <tr
                                                                key={tool.tool}
                                                                className="border-t border-line transition-colors hover:bg-paper/30"
                                                            >
                                                                <td className="py-3.5 font-medium">
                                                                    <div className="flex items-center gap-3">
                                                                        <ToolLogo
                                                                            tool={
                                                                                tool
                                                                            }
                                                                            size="md"
                                                                        />
                                                                        <span className="font-semibold text-ink">
                                                                            {
                                                                                name
                                                                            }
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className="max-w-sm py-3.5 text-xs text-soft">
                                                                    <div>
                                                                        {tagline ||
                                                                            summary ||
                                                                            '—'}
                                                                    </div>
                                                                    {stack.length >
                                                                        0 && (
                                                                        <div className="mt-1 flex flex-wrap items-center gap-1 font-mono text-[11px] text-ink/70">
                                                                            <span className="font-sans text-[10px] tracking-wider text-faint uppercase">
                                                                                Stack:
                                                                            </span>
                                                                            {stack.map(
                                                                                (
                                                                                    item,
                                                                                    idx,
                                                                                ) => (
                                                                                    <span
                                                                                        key={
                                                                                            item
                                                                                        }
                                                                                        className="inline-flex items-center"
                                                                                    >
                                                                                        <span>
                                                                                            {
                                                                                                item
                                                                                            }
                                                                                        </span>
                                                                                        {idx <
                                                                                            stack.length -
                                                                                                1 && (
                                                                                            <span className="mx-1 text-faint/60">
                                                                                                ·
                                                                                            </span>
                                                                                        )}
                                                                                    </span>
                                                                                ),
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td className="py-3.5">
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {cats
                                                                            .slice(
                                                                                0,
                                                                                2,
                                                                            )
                                                                            .map(
                                                                                (
                                                                                    cat,
                                                                                ) => (
                                                                                    <button
                                                                                        key={
                                                                                            cat
                                                                                        }
                                                                                        type="button"
                                                                                        onClick={() =>
                                                                                            setSelectedCategory(
                                                                                                cat,
                                                                                            )
                                                                                        }
                                                                                        className="rounded-md bg-badge px-1.5 py-0.5 text-[10px] font-medium text-soft capitalize transition hover:bg-tools/15 hover:text-tools"
                                                                                    >
                                                                                        {categoryLabel(
                                                                                            cat,
                                                                                        )}
                                                                                    </button>
                                                                                ),
                                                                            )}
                                                                        {cats.length >
                                                                            2 && (
                                                                            <span className="self-center text-[10px] text-faint">
                                                                                +
                                                                                {cats.length -
                                                                                    2}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="py-3.5 text-right">
                                                                    {runId !==
                                                                    undefined ? (
                                                                        <Link
                                                                            href={
                                                                                showRun(
                                                                                    runId,
                                                                                )
                                                                                    .url
                                                                            }
                                                                            className="inline-flex"
                                                                        >
                                                                            <StatusPill tone="busy">
                                                                                Installing…
                                                                            </StatusPill>
                                                                        </Link>
                                                                    ) : (
                                                                        <button
                                                                            type="button"
                                                                            disabled={
                                                                                verifying
                                                                            }
                                                                            title={
                                                                                verifying
                                                                                    ? 'Available after verifying the server'
                                                                                    : undefined
                                                                            }
                                                                            onClick={() => {
                                                                                setIsNewInstance(
                                                                                    false,
                                                                                );
                                                                                setInstallingTool(
                                                                                    tool,
                                                                                );
                                                                            }}
                                                                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-tools/25 bg-tools/10 px-3 text-xs font-semibold text-tools shadow-2xs transition-all duration-150 hover:border-tools hover:bg-tools hover:text-white hover:shadow-xs disabled:pointer-events-none disabled:opacity-50"
                                                                        >
                                                                            <ArrowDownToLine className="size-3.5" />
                                                                            <span>
                                                                                Install
                                                                            </span>
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </section>
                            )}
                        </div>
                    )}
                </>
            ) : (
                <p className="text-sm text-soft">
                    Couldn't read Cluster Tools from {server.name}. Check that
                    the server is reachable, then Refresh.
                </p>
            )}

            {installingTool && tools && (
                <InstallDialog
                    server={server}
                    tool={installingTool}
                    tools={tools}
                    domains={domains}
                    isNewInstance={isNewInstance}
                    onClose={() => {
                        setInstallingTool(null);
                        setIsNewInstance(false);
                    }}
                />
            )}
        </AppLayout>
    );
}

function Section({
    title,
    count,
    children,
}: {
    title: string;
    count: number;
    children: React.ReactNode;
}) {
    return (
        <section className="mb-9">
            <h2 className="mb-3.5 text-[11px] font-semibold tracking-[0.06em] text-soft uppercase">
                {title}{' '}
                <span className="font-normal text-faint">· {count}</span>
            </h2>
            {count === 0 ? (
                <p className="rounded-2xl bg-surface px-5 py-6 text-sm text-soft ring-1 ring-line">
                    Nothing here.
                </p>
            ) : (
                <div className="grid grid-cols-1 gap-4.5 md:grid-cols-2 lg:grid-cols-3">
                    {children}
                </div>
            )}
        </section>
    );
}

/** Until the live check lands, the list comes from the registry and may be incomplete. */
function VerifyStatus({
    server,
    verifying,
    failed,
    hasLastCheck,
    checkedAt,
}: {
    server: string;
    verifying: boolean;
    failed: boolean;
    hasLastCheck: boolean;
    checkedAt: string | null;
}) {
    // Re-checking a list we already have is quiet; only a first check, with
    // nothing verified yet, gets the pill.
    if (verifying && hasLastCheck) {
        return <span className="text-xs text-soft">Checking for changes…</span>;
    }

    if (verifying) {
        return (
            <StatusPill tone="busy">{`Verifying with ${server}…`}</StatusPill>
        );
    }

    if (failed) {
        return (
            <StatusPill tone="warn">
                {hasLastCheck
                    ? "Couldn't check, showing the last check"
                    : "Couldn't verify, showing the registry"}
            </StatusPill>
        );
    }

    return <CheckedAgo checkedAt={checkedAt} />;
}

/** "Checked 12 min ago", ticking while the page is open. */
function CheckedAgo({ checkedAt }: { checkedAt: string | null }) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 30_000);

        return () => window.clearInterval(timer);
    }, []);

    if (checkedAt === null) {
        return <span className="text-xs text-soft">Checked just now</span>;
    }

    const minutes = Math.floor((now - new Date(checkedAt).getTime()) / 60_000);

    return (
        <span className="text-xs text-soft">
            {minutes < 1 ? 'Checked just now' : `Checked ${minutes} min ago`}
        </span>
    );
}

function InstalledCard({
    server,
    tool,
    onAddInstance,
    onCategoryClick,
}: {
    server: Server;
    tool: ClusterTool;
    onAddInstance?: (tool: ClusterTool) => void;
    onCategoryClick?: (category: string) => void;
}) {
    const url = tool.url?.split(' ')[0] ?? null;
    const href = detailUrl(server, tool);
    const canMulti = isMultiInstance(tool);
    const name = toolName(tool);
    const tagline = toolTagline(tool);
    const cats = toolCategories(tool);
    const stack = toolStack(tool);

    return (
        <article className="group relative flex flex-col justify-between rounded-2xl bg-surface p-5 shadow-2xs ring-1 ring-line transition-all duration-150 hover:shadow-md hover:ring-line/80">
            <div className="space-y-3.5">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3.5">
                        <ToolLogo tool={tool} size="lg" />
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <Link
                                    href={href}
                                    className="truncate text-[15px] font-semibold text-ink hover:underline"
                                >
                                    {name}
                                </Link>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-soft">
                                {tagline}
                            </p>
                            {cats.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {cats.map((cat) => (
                                        <button
                                            key={cat}
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onCategoryClick?.(cat);
                                            }}
                                            className="inline-flex items-center rounded-md bg-badge/80 px-1.5 py-0.5 text-[10px] font-medium text-soft capitalize ring-1 ring-line/40 transition hover:bg-tools/15 hover:text-tools hover:ring-tools/30"
                                        >
                                            {categoryLabel(cat)}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <StatusPill tone="ok">Installed</StatusPill>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-badge/50 px-3.5 py-2.5 text-xs ring-1 ring-line/60">
                    <span className="truncate font-mono text-[11px] text-soft select-all">
                        {tool.host
                            ? `https://${tool.host}`
                            : 'No public ingress address'}
                    </span>
                    {url && (
                        <Link
                            href={open().url}
                            method="post"
                            data={{ url }}
                            as="button"
                            className="ml-2 inline-flex shrink-0 items-center gap-1 font-medium text-brand hover:underline"
                            title="Open in default browser"
                        >
                            <span>Visit</span>
                            <ExternalLink className="size-3" />
                        </Link>
                    )}
                </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3.5 text-xs">
                <div className="min-w-0 pr-2">
                    {canMulti && onAddInstance ? (
                        <button
                            type="button"
                            onClick={() => onAddInstance(tool)}
                            className="inline-flex items-center gap-1.5 font-medium text-brand transition hover:text-brand/80"
                            title="Deploy another isolated instance"
                        >
                            <Plus className="size-3.5" />
                            <span>Deploy Another</span>
                        </button>
                    ) : stack.length > 0 ? (
                        <div
                            className="flex items-center gap-1.5 truncate font-mono text-[11px] text-soft"
                            title={`Stack: ${stack.join(' · ')}`}
                        >
                            <span className="font-sans text-[10px] font-medium tracking-wider text-faint uppercase">
                                Stack:
                            </span>
                            <span className="truncate">
                                {stack.join(' · ')}
                            </span>
                        </div>
                    ) : (
                        <span className="text-[11px] text-faint">
                            Cluster Service
                        </span>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <Link
                        href={href}
                        className={buttonClass('secondary', 'sm', 'h-8 px-3')}
                    >
                        <span>Manage</span>
                    </Link>
                </div>
            </div>
        </article>
    );
}

function AvailableCard({
    tool,
    runId,
    disabled,
    onInstall,
    onCategoryClick,
}: {
    tool: ClusterTool;
    runId?: number;
    disabled: boolean;
    onInstall: () => void;
    onCategoryClick?: (category: string) => void;
}) {
    const { summary } = describeTool(tool.label);
    const name = toolName(tool);
    const tagline = toolTagline(tool);
    const cats = toolCategories(tool);
    const stack = toolStack(tool);
    const canMulti = isMultiInstance(tool);

    return (
        <article className="group relative flex flex-col justify-between rounded-2xl bg-surface p-5 shadow-2xs ring-1 ring-line transition-all duration-150 hover:shadow-md hover:ring-line/80">
            <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3.5">
                        <ToolLogo tool={tool} size="lg" />
                        <div className="min-w-0">
                            <h3 className="truncate text-[15px] font-semibold text-ink">
                                {name}
                            </h3>
                            <p className="mt-0.5 truncate text-xs text-soft">
                                {tagline}
                            </p>
                        </div>
                    </div>
                    {canMulti && (
                        <span className="shrink-0 rounded-md bg-badge px-2 py-0.5 text-[10px] font-medium text-faint">
                            Multi-instance
                        </span>
                    )}
                </div>

                <p className="line-clamp-2 min-h-[32px] text-xs leading-relaxed text-soft">
                    {summary || tagline}
                </p>

                {cats.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                        {cats.map((cat) => (
                            <button
                                key={cat}
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onCategoryClick?.(cat);
                                }}
                                className="inline-flex items-center rounded-md bg-badge/80 px-1.5 py-0.5 text-[10px] font-medium text-soft capitalize ring-1 ring-line/40 transition hover:bg-tools/15 hover:text-tools hover:ring-tools/30"
                            >
                                {categoryLabel(cat)}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3.5 text-xs">
                <div className="min-w-0 pr-2">
                    {stack.length > 0 ? (
                        <div
                            className="flex items-center gap-1.5 truncate font-mono text-[11px] text-soft"
                            title={`Stack: ${stack.join(' · ')}`}
                        >
                            <span className="font-sans text-[10px] font-medium tracking-wider text-faint uppercase">
                                Stack:
                            </span>
                            <span className="truncate">
                                {stack.join(' · ')}
                            </span>
                        </div>
                    ) : (
                        <span className="text-[11px] text-faint">
                            Cluster Tool
                        </span>
                    )}
                </div>
                <div className="shrink-0">
                    {runId !== undefined ? (
                        <Link href={showRun(runId).url} className="inline-flex">
                            <StatusPill tone="busy">Installing…</StatusPill>
                        </Link>
                    ) : (
                        <button
                            type="button"
                            disabled={disabled}
                            title={
                                disabled
                                    ? 'Available after verifying the server'
                                    : undefined
                            }
                            onClick={onInstall}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-tools/25 bg-tools/10 px-3.5 text-xs font-semibold text-tools shadow-2xs transition-all duration-150 hover:border-tools hover:bg-tools hover:text-white hover:shadow-xs disabled:pointer-events-none disabled:opacity-50"
                        >
                            <ArrowDownToLine className="size-3.5" />
                            <span>Install</span>
                        </button>
                    )}
                </div>
            </div>
        </article>
    );
}

function CompanionCard({ companion }: { companion: CompanionApp }) {
    return (
        <article className="group relative flex flex-col justify-between gap-3.5 rounded-2xl bg-surface p-5 shadow-2xs ring-1 ring-line transition-all duration-150 hover:shadow-md hover:ring-line/80">
            <div>
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3.5">
                        <ToolLogo slug={companion.slug} size="lg" />
                        <div>
                            <h3 className="text-[15px] font-semibold text-ink">
                                {companion.name}
                            </h3>
                            <div className="mt-0.5">
                                {companion.installed ? (
                                    companion.running ? (
                                        <StatusPill tone="ok">
                                            ● Running
                                        </StatusPill>
                                    ) : (
                                        <StatusPill tone="warn">
                                            ⏸ Paused
                                        </StatusPill>
                                    )
                                ) : (
                                    <StatusPill tone="muted">
                                        Available
                                    </StatusPill>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                <p className="mt-2.5 text-xs leading-relaxed text-soft">
                    {companion.description}
                </p>
            </div>
            <div className="flex items-center justify-between border-t border-line/60 pt-3">
                <span className="font-mono text-[11px] text-faint">
                    {companion.url ?? `*.${companion.slug}`}
                </span>
                <div className="flex items-center gap-2">
                    {companion.installed ? (
                        <>
                            {companion.url && companion.running && (
                                <Link
                                    href={open().url}
                                    method="post"
                                    data={{ url: companion.url }}
                                    as="button"
                                    className={buttonClass(
                                        'secondary',
                                        'sm',
                                        'gap-1',
                                    )}
                                >
                                    <span>Open</span>
                                    <ExternalLink className="size-3" />
                                </Link>
                            )}
                            {companion.running ? (
                                <Link
                                    href="/companions/stop"
                                    method="post"
                                    data={{ companion: companion.slug }}
                                    as="button"
                                    className={buttonClass(
                                        'ghost',
                                        'sm',
                                        'gap-1 text-soft',
                                    )}
                                    title="Pause companion to free RAM"
                                >
                                    <Pause className="size-3" />
                                    <span>Pause</span>
                                </Link>
                            ) : (
                                <Link
                                    href="/companions/start"
                                    method="post"
                                    data={{ companion: companion.slug }}
                                    as="button"
                                    className={buttonClass(
                                        'secondary',
                                        'sm',
                                        'gap-1',
                                    )}
                                    title="Resume companion"
                                >
                                    <Play className="size-3" />
                                    <span>Resume</span>
                                </Link>
                            )}
                            <Link
                                href="/companions/remove"
                                method="post"
                                data={{ companion: companion.slug }}
                                as="button"
                                className={buttonClass('danger', 'sm', 'p-1.5')}
                                title="Remove companion"
                            >
                                <Trash2 className="size-3.5" />
                            </Link>
                        </>
                    ) : (
                        <Link
                            href="/companions/add"
                            method="post"
                            data={{ companion: companion.slug }}
                            as="button"
                            className={buttonClass('tools', 'sm', 'gap-1.5')}
                        >
                            <ArrowDownToLine className="size-3.5" />
                            <span>Install</span>
                        </Link>
                    )}
                </div>
            </div>
        </article>
    );
}

function CompanionTableRow({ companion }: { companion: CompanionApp }) {
    return (
        <tr className="transition-colors hover:bg-paper/50">
            <td className="py-3 pr-3 pl-4 font-medium">
                <div className="flex items-center gap-3">
                    <ToolLogo slug={companion.slug} size="sm" />
                    <span className="font-semibold text-ink">
                        {companion.name}
                    </span>
                </div>
            </td>
            <td className="max-w-sm px-3 py-3 text-xs text-soft">
                {companion.description}
            </td>
            <td className="px-3 py-3">
                {companion.installed ? (
                    companion.running ? (
                        <StatusPill tone="ok">● Running</StatusPill>
                    ) : (
                        <StatusPill tone="warn">⏸ Paused</StatusPill>
                    )
                ) : (
                    <StatusPill tone="muted">Available</StatusPill>
                )}
            </td>
            <td className="px-3 py-3 font-mono text-[12px] text-soft">
                {companion.url ?? '—'}
            </td>
            <td className="py-3 pr-4 pl-3 text-right">
                <div className="flex items-center justify-end gap-2">
                    {companion.installed ? (
                        <>
                            {companion.url && companion.running && (
                                <Link
                                    href={open().url}
                                    method="post"
                                    data={{ url: companion.url }}
                                    as="button"
                                    className={buttonClass(
                                        'secondary',
                                        'sm',
                                        'gap-1',
                                    )}
                                >
                                    <span>Open</span>
                                    <ExternalLink className="size-3" />
                                </Link>
                            )}
                            {companion.running ? (
                                <Link
                                    href="/companions/stop"
                                    method="post"
                                    data={{ companion: companion.slug }}
                                    as="button"
                                    className={buttonClass(
                                        'ghost',
                                        'sm',
                                        'gap-1 text-soft',
                                    )}
                                    title="Pause companion"
                                >
                                    <Pause className="size-3" />
                                    <span>Pause</span>
                                </Link>
                            ) : (
                                <Link
                                    href="/companions/start"
                                    method="post"
                                    data={{ companion: companion.slug }}
                                    as="button"
                                    className={buttonClass(
                                        'secondary',
                                        'sm',
                                        'gap-1',
                                    )}
                                    title="Resume companion"
                                >
                                    <Play className="size-3" />
                                    <span>Resume</span>
                                </Link>
                            )}
                            <Link
                                href="/companions/remove"
                                method="post"
                                data={{ companion: companion.slug }}
                                as="button"
                                className={buttonClass('danger', 'sm', 'p-1.5')}
                                title="Remove companion"
                            >
                                <Trash2 className="size-3.5" />
                            </Link>
                        </>
                    ) : (
                        <Link
                            href="/companions/add"
                            method="post"
                            data={{ companion: companion.slug }}
                            as="button"
                            className={buttonClass('tools', 'sm', 'gap-1.5')}
                        >
                            <ArrowDownToLine className="size-3.5" />
                            <span>Install</span>
                        </Link>
                    )}
                </div>
            </td>
        </tr>
    );
}

function defaultSubdomainForTool(
    tool: ClusterTool,
    isMulti: boolean,
    existingTools: ClusterTool[],
): string {
    const servicePrefixes: Record<string, string> = {
        pocketbase: 'pocket',
        directus: 'directus',
        data: 'data',
        sso: 'sso',
        zitadel: 'sso',
        mail: 'mail',
        stalwart: 'mail',
        passwords: 'vault',
        vaultwarden: 'vault',
        notes: 'notes',
        outline: 'notes',
        support: 'support',
        chatwoot: 'support',
        chat: 'chat',
        matrix: 'chat',
        meet: 'meet',
        livekit: 'meet',
        crm: 'crm',
        twenty: 'crm',
        sheets: 'sheet',
        teable: 'sheet',
        flow: 'flow',
        n8n: 'flow',
        windmill: 'flow',
        git: 'git',
        forgejo: 'git',
        design: 'design',
        penpot: 'design',
        analytics: 'analytics',
        umami: 'analytics',
        plausible: 'analytics',
        uptime: 'status',
        kuma: 'status',
        errors: 'errors',
        glitchtip: 'errors',
        drive: 'drive',
        ocis: 'drive',
    };

    const basePrefix = servicePrefixes[tool.tool] ?? tool.tool;

    if (!isMulti) {
        return basePrefix;
    }

    const existingHosts = new Set(
        existingTools
            .filter((t) => t.tool === tool.tool && t.host)
            .map((t) => t.host!.toLowerCase()),
    );

    let candidate = `${basePrefix}2`;
    let counter = 2;
    while ([...existingHosts].some((h) => h.startsWith(candidate + '.'))) {
        counter++;
        candidate = `${basePrefix}${counter}`;
    }

    return candidate;
}

function InstallDialog({
    server,
    tool,
    tools,
    domains,
    isNewInstance,
    onClose,
}: {
    server: Server;
    tool: ClusterTool;
    tools: ClusterTool[];
    domains?: ServerDomain[] | null;
    isNewInstance?: boolean;
    onClose: () => void;
}) {
    const knownDomains = useMemo(() => {
        const map = new Map<string, ServerDomain>();
        if (domains) {
            for (const d of domains) {
                map.set(d.domain, d);
            }
        }
        const suggested = suggestedDomain(tools);
        if (suggested && !map.has(suggested)) {
            map.set(suggested, {
                domain: suggested,
                externalDns: false,
                tls: false,
                inUse: true,
            });
        }
        return Array.from(map.values());
    }, [domains, tools]);

    const initialBaseDomain = useMemo(() => {
        const suggested = suggestedDomain(tools);
        if (suggested && knownDomains.some((d) => d.domain === suggested)) {
            return suggested;
        }
        return knownDomains[0]?.domain ?? suggested ?? '';
    }, [knownDomains, tools]);

    const isMulti = isNewInstance || tool.installed;
    const [isCustomDomain, setIsCustomDomain] = useState(
        () => knownDomains.length === 0,
    );
    const [selectedBaseDomain, setSelectedBaseDomain] =
        useState(initialBaseDomain);
    const [subdomain, setSubdomain] = useState(() =>
        defaultSubdomainForTool(tool, Boolean(isMulti), tools),
    );
    const [customDomain, setCustomDomain] = useState('');

    const domain = useMemo(() => {
        if (isCustomDomain || knownDomains.length === 0) {
            return customDomain.trim().toLowerCase();
        }
        const sub = subdomain.trim().toLowerCase();
        return sub ? `${sub}.${selectedBaseDomain}` : selectedBaseDomain;
    }, [
        isCustomDomain,
        knownDomains.length,
        customDomain,
        subdomain,
        selectedBaseDomain,
    ]);

    const tagline = toolTagline(tool);
    const name = toolName(tool);

    // The CLI names the fields a tool's install asks; an older CLI only sends the flag.
    const needsAdminEmail = tool.initFields
        ? tool.initFields.some((field) => field.key === 'adminEmail')
        : Boolean(tool.requiresAdminEmail);

    const defaultAdminEmail = useMemo(() => {
        if (server.account && server.account.includes('@')) {
            return server.account;
        }
        const cleanDomain = domain
            ? domain.replace(/^https?:\/\//, '').split('/')[0]
            : selectedBaseDomain || 'example.com';
        return `admin@${cleanDomain}`;
    }, [server.account, domain, selectedBaseDomain]);

    // The tool's own choices, as the CLI describes them (an app name, whether to share the Commons...).
    const optionFields = useMemo(
        () =>
            (tool.initFields ?? []).filter((field) => field.role === 'option'),
        [tool.initFields],
    );
    const [options, setOptions] = useState<NewAppAnswers>(() =>
        defaultAnswers(optionFields),
    );

    const [adminEmail, setAdminEmail] = useState(defaultAdminEmail);
    const [touchedAdminEmail, setTouchedAdminEmail] = useState(false);

    useEffect(() => {
        if (!touchedAdminEmail) {
            setAdminEmail(defaultAdminEmail);
        }
    }, [defaultAdminEmail, touchedAdminEmail]);

    const ssoInstalled =
        tools.some(
            (candidate) =>
                (candidate.tool === 'sso' || candidate.tool === 'zitadel') &&
                candidate.installed,
        ) && tool.sso !== 'N/A';
    const mailInstalled =
        tools.some(
            (candidate) =>
                (candidate.tool === 'mail' || candidate.tool === 'stalwart') &&
                candidate.installed,
        ) && tool.mail !== 'N/A';

    const selectedDomainMeta = knownDomains.find(
        (d) => d.domain === (isCustomDomain ? domain : selectedBaseDomain),
    );

    const [dnsStatus, setDnsStatus] = useState<{
        checking: boolean;
        checked: boolean;
        matches: boolean;
        resolvedIp: string | null;
        isWildcard: boolean;
    }>({
        checking: false,
        checked: false,
        matches: false,
        resolvedIp: null,
        isWildcard: false,
    });

    useEffect(() => {
        if (!domain || !server.ip || selectedDomainMeta?.externalDns) {
            setDnsStatus({
                checking: false,
                checked: false,
                matches: false,
                resolvedIp: null,
                isWildcard: false,
            });
            return;
        }

        let cancelled = false;
        setDnsStatus((prev) => ({ ...prev, checking: true }));

        const timer = setTimeout(() => {
            fetch(
                `/servers/${server.name}/check-dns?domain=${encodeURIComponent(domain)}`,
            )
                .then((res) => res.json())
                .then((data) => {
                    if (!cancelled) {
                        setDnsStatus({
                            checking: false,
                            checked: true,
                            matches: !!data.matches,
                            resolvedIp: data.resolvedIp ?? null,
                            isWildcard: !!data.isWildcard,
                        });
                    }
                })
                .catch(() => {
                    if (!cancelled) {
                        setDnsStatus((prev) => ({
                            ...prev,
                            checking: false,
                            checked: false,
                        }));
                    }
                });
        }, 400);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [domain, server.name, server.ip, selectedDomainMeta?.externalDns]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-6"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-[480px] rounded-2xl bg-surface p-7 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-baseline gap-2">
                    <h2 className="text-xl font-semibold tracking-[-0.02em]">
                        {isMulti ? `Deploy ${name}` : `Install ${name}`}
                    </h2>
                    {tagline && (
                        <span className="text-sm text-soft">· {tagline}</span>
                    )}
                </div>
                <p className="mt-1.5 text-sm text-soft">
                    {isMulti
                        ? `Deploy an additional, isolated ${name} deployment on ${server.name}.`
                        : `On ${server.name}. It gets its own address under your domain.`}
                </p>
                <Form
                    action={store({ server: server.name, tool: tool.tool })}
                    className="mt-5 space-y-4"
                >
                    {({ errors, processing }) => (
                        <>
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="block text-xs font-medium text-soft">
                                        {isCustomDomain
                                            ? 'Domain / Host'
                                            : 'Host Address'}
                                    </span>
                                    {knownDomains.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (isCustomDomain) {
                                                    setIsCustomDomain(false);
                                                } else {
                                                    setIsCustomDomain(true);
                                                    setCustomDomain(domain);
                                                }
                                            }}
                                            className="text-xs text-tools hover:underline"
                                        >
                                            {isCustomDomain
                                                ? 'Pick connected base domain'
                                                : '+ Custom domain'}
                                        </button>
                                    )}
                                </div>

                                {!isCustomDomain && knownDomains.length > 0 ? (
                                    <div className="space-y-2">
                                        {knownDomains.length > 1 && (
                                            <div>
                                                <select
                                                    value={selectedBaseDomain}
                                                    onChange={(event) => {
                                                        if (
                                                            event.target
                                                                .value ===
                                                            '__custom__'
                                                        ) {
                                                            setIsCustomDomain(
                                                                true,
                                                            );
                                                            setCustomDomain(
                                                                domain,
                                                            );
                                                        } else {
                                                            setSelectedBaseDomain(
                                                                event.target
                                                                    .value,
                                                            );
                                                        }
                                                    }}
                                                    className="w-full rounded-lg border-0 bg-surface px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-tools"
                                                >
                                                    {knownDomains.map((d) => (
                                                        <option
                                                            key={d.domain}
                                                            value={d.domain}
                                                        >
                                                            {d.domain}{' '}
                                                            {d.externalDns
                                                                ? '(ExternalDNS · Cloudflare)'
                                                                : d.tls
                                                                  ? '(Cloudflare TLS)'
                                                                  : '(Active Ingress)'}
                                                        </option>
                                                    ))}
                                                    <option value="__custom__">
                                                        + Enter custom domain…
                                                    </option>
                                                </select>
                                            </div>
                                        )}
                                        <div className="flex rounded-lg ring-1 ring-line focus-within:ring-2 focus-within:ring-tools">
                                            <input
                                                type="text"
                                                value={subdomain}
                                                onChange={(event) =>
                                                    setSubdomain(
                                                        event.target.value
                                                            .trim()
                                                            .toLowerCase()
                                                            .replace(
                                                                /[^a-z0-9-]/g,
                                                                '',
                                                            ),
                                                    )
                                                }
                                                placeholder={defaultSubdomainForTool(
                                                    tool,
                                                    Boolean(isMulti),
                                                    tools,
                                                )}
                                                autoFocus
                                                spellCheck={false}
                                                className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 font-mono text-[13px] outline-none"
                                            />
                                            <div className="flex items-center border-l border-line bg-badge/40 px-3 font-mono text-[13px] text-soft">
                                                .{selectedBaseDomain}
                                            </div>
                                        </div>
                                        <input
                                            type="hidden"
                                            name="domain"
                                            value={domain}
                                        />
                                    </div>
                                ) : (
                                    <div>
                                        <input
                                            name="domain"
                                            value={customDomain}
                                            onChange={(event) =>
                                                setCustomDomain(
                                                    event.target.value
                                                        .trim()
                                                        .toLowerCase(),
                                                )
                                            }
                                            placeholder="e.g. pocket.example.com"
                                            autoFocus
                                            spellCheck={false}
                                            className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-tools"
                                        />
                                    </div>
                                )}

                                {errors.domain && (
                                    <span className="mt-1 block text-xs text-accent">
                                        {errors.domain}
                                    </span>
                                )}

                                <div className="mt-2 space-y-1.5 rounded-lg bg-paper p-3 text-xs text-soft">
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono text-[12px] text-ink">
                                            https://{domain || 'example.com'}
                                        </span>
                                        {selectedDomainMeta?.externalDns ? (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ok">
                                                <Check className="size-3" />{' '}
                                                ExternalDNS auto-sync
                                            </span>
                                        ) : dnsStatus.checking ? (
                                            <span className="text-[11px] text-soft">
                                                Checking DNS…
                                            </span>
                                        ) : dnsStatus.checked &&
                                          dnsStatus.matches ? (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ok">
                                                <Check className="size-3" /> A
                                                record points to {server.ip}
                                            </span>
                                        ) : null}
                                    </div>

                                    {selectedDomainMeta?.externalDns ? (
                                        <p className="text-[11px] leading-relaxed text-soft">
                                            DNS records are managed
                                            automatically through ExternalDNS on
                                            Cloudflare.
                                        </p>
                                    ) : (
                                        <p className="text-[11px] leading-relaxed text-soft">
                                            {dnsStatus.checked &&
                                            dnsStatus.matches ? (
                                                <>
                                                    Traffic resolves to{' '}
                                                    <span className="font-mono text-ink">
                                                        {server.ip}
                                                    </span>
                                                    . Traefik will route
                                                    requests and issue Let's
                                                    Encrypt certificates
                                                    automatically.
                                                </>
                                            ) : (
                                                <>
                                                    ExternalDNS is not syncing
                                                    this domain. If you already
                                                    set up an A record (or
                                                    wildcard{' '}
                                                    <span className="font-mono text-ink">
                                                        *.{domain || 'domain'}
                                                    </span>
                                                    ) pointing to{' '}
                                                    <span className="font-mono text-ink">
                                                        {server.ip ??
                                                            'the server'}
                                                    </span>
                                                    , Traefik will route traffic
                                                    and issue Let's Encrypt
                                                    certificates automatically.
                                                </>
                                            )}
                                        </p>
                                    )}
                                </div>
                            </div>
                            {needsAdminEmail && (
                                <label className="block">
                                    <span className="mb-1.5 block text-xs font-medium text-soft">
                                        Admin Email
                                    </span>
                                    <input
                                        type="email"
                                        name="admin_email"
                                        value={adminEmail}
                                        onChange={(event) => {
                                            setTouchedAdminEmail(true);
                                            setAdminEmail(
                                                event.target.value.trim(),
                                            );
                                        }}
                                        placeholder={`e.g. admin@${domain || 'example.com'}`}
                                        spellCheck={false}
                                        required
                                        className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-tools"
                                    />
                                    {errors.admin_email ? (
                                        <span className="mt-1 block text-xs text-accent">
                                            {errors.admin_email}
                                        </span>
                                    ) : (
                                        <span className="mt-1 block text-xs text-soft">
                                            Primary administrator account for{' '}
                                            {name}.
                                        </span>
                                    )}
                                </label>
                            )}
                            {optionFields.length > 0 && (
                                <div className="space-y-4">
                                    <FrameworkFields
                                        fields={optionFields}
                                        answers={options}
                                        errors={
                                            errors as Record<string, string>
                                        }
                                        errorPrefix="options"
                                        onChange={setOptions}
                                    />
                                    {Object.entries(options).flatMap(
                                        ([key, value]) =>
                                            (Array.isArray(value)
                                                ? value
                                                : [value]
                                            )
                                                .filter(
                                                    (item) =>
                                                        item !== null &&
                                                        item !== '' &&
                                                        item !== false,
                                                )
                                                .map((item, index) => (
                                                    <input
                                                        key={`${key}-${index}`}
                                                        type="hidden"
                                                        name={
                                                            Array.isArray(value)
                                                                ? `options[${key}][]`
                                                                : `options[${key}]`
                                                        }
                                                        value={
                                                            item === true
                                                                ? '1'
                                                                : String(item)
                                                        }
                                                    />
                                                )),
                                    )}
                                </div>
                            )}
                            {ssoInstalled && (
                                <Checkbox
                                    name="wire_sso"
                                    label="Sign in with SSO (it's installed on this server)"
                                />
                            )}
                            {mailInstalled && (
                                <Checkbox
                                    name="wire_mail"
                                    label="Send email through Mail (it's installed on this server)"
                                />
                            )}
                            <div className="flex items-center justify-end gap-2.5 pt-1">
                                <Button variant="secondary" onClick={onClose}>
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={processing || domain === ''}
                                >
                                    {processing
                                        ? 'Starting…'
                                        : isMulti
                                          ? `Deploy ${name}`
                                          : `Install ${name}`}
                                </Button>
                            </div>
                        </>
                    )}
                </Form>
            </div>
        </div>
    );
}

function Checkbox({ name, label }: { name: string; label: string }) {
    return (
        <label className="flex items-center gap-2.5 text-[13px]">
            <input
                type="checkbox"
                name={name}
                value="1"
                defaultChecked
                className="size-4 accent-tools"
            />
            {label}
        </label>
    );
}

function Loading({ server }: { server: string }) {
    return (
        <div>
            <p className="mb-3 text-[13px] text-soft">
                Checking what's installed on {server}. This can take up to a
                minute the first time.
            </p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
                {Array.from({ length: 9 }, (_, index) => (
                    <div
                        key={index}
                        className="h-20 animate-pulse rounded-xl bg-surface ring-1 ring-line"
                    />
                ))}
            </div>
        </div>
    );
}
