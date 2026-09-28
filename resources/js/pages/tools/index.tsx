import { Form, Link, router } from '@inertiajs/react';
import { useState } from 'react';
import Button, { buttonClass } from '@/components/button';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { open } from '@/routes';
import { show as showRun } from '@/routes/runs';
import {
    index as toolsIndex,
    refresh,
    show as showTool,
    store,
} from '@/routes/servers/tools';
import { describeTool, toolName } from '@/types/larakube';
import type { ClusterTool, Server } from '@/types/larakube';

type Props = {
    server: Server;
    servers: Server[];
    registered?: ClusterTool[] | null;
    tools?: ClusterTool[] | null;
    installing: Record<string, number>;
};

type Filter = 'all' | 'installed' | 'available';

function matches(tool: ClusterTool, query: string): boolean {
    const needle = query.trim().toLowerCase();

    return (
        needle === '' ||
        `${toolName(tool)} ${tool.label} ${tool.host ?? ''}`
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
        tool.instance ? { query: { instance: tool.instance } } : undefined,
    ).url;
}

export default function ToolsIndex({
    server,
    servers,
    registered,
    tools: verifiedTools,
    installing,
}: Props) {
    // The registry answers in about a second; the live check can take half a
    // minute. Draw from the registry, then swap in the verified list.
    const verifying = verifiedTools === undefined;
    const tools = verifiedTools ?? registered;
    const [installingTool, setInstallingTool] = useState<ClusterTool | null>(
        null,
    );
    const [filter, setFilter] = useState<Filter>('all');
    const [query, setQuery] = useState('');
    const installedAll = tools?.filter((tool) => tool.installed) ?? [];
    const installedSlugs = new Set(installedAll.map((tool) => tool.tool));
    const availableAll =
        tools?.filter(
            (tool) => !tool.installed && !installedSlugs.has(tool.tool),
        ) ?? [];
    const installed = installedAll.filter((tool) => matches(tool, query));
    const available = availableAll.filter((tool) => matches(tool, query));

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
                    <label className="flex items-center gap-2.5 rounded-lg bg-surface px-3 py-2 ring-1 ring-line">
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
                        Refresh
                    </Link>
                </div>
            </header>

            {tools === undefined ? (
                <Loading server={server.name} />
            ) : tools ? (
                <>
                    <div className="mb-5 flex items-center justify-between gap-4">
                        <div
                            className="flex rounded-lg bg-badge p-0.5"
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
                                            ? 'rounded-md bg-surface px-3 py-1.5 text-[13px] font-medium shadow-sm'
                                            : 'rounded-md px-3 py-1.5 text-[13px] text-soft hover:text-ink'
                                    }
                                >
                                    {label}{' '}
                                    <span className="text-faint">{count}</span>
                                </button>
                            ))}
                        </div>
                        <VerifyStatus
                            server={server.name}
                            verifying={verifying}
                            failed={verifiedTools === null}
                        />
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search tools"
                            className="w-64 rounded-lg border-0 bg-surface px-3 py-2 text-[13px] ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-tools"
                        />
                    </div>
                    {filter !== 'available' && (
                        <Section
                            title={`Installed on ${server.name}`}
                            count={installed.length}
                        >
                            {installed.map((tool) => (
                                <InstalledCard
                                    key={`${tool.tool}-${tool.instance}`}
                                    server={server}
                                    tool={tool}
                                />
                            ))}
                        </Section>
                    )}
                    {filter !== 'installed' && (
                        <Section title="Available" count={available.length}>
                            {available.map((tool) => (
                                <AvailableCard
                                    key={tool.tool}
                                    tool={tool}
                                    runId={installing[tool.tool]}
                                    disabled={verifying}
                                    onInstall={() => setInstallingTool(tool)}
                                />
                            ))}
                        </Section>
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
                    onClose={() => setInstallingTool(null)}
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
        <section className="mb-7">
            <h2 className="mb-3 text-[11px] font-medium tracking-[0.06em] text-soft uppercase">
                {title} <span className="text-faint">· {count}</span>
            </h2>
            {count === 0 ? (
                <p className="rounded-2xl bg-surface px-5 py-5 text-sm text-soft ring-1 ring-line ring-inset">
                    Nothing here.
                </p>
            ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
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
}: {
    server: string;
    verifying: boolean;
    failed: boolean;
}) {
    if (verifying) {
        return (
            <StatusPill tone="busy">{`Verifying with ${server}…`}</StatusPill>
        );
    }

    if (failed) {
        return (
            <StatusPill tone="warn">
                Couldn't verify, showing the registry
            </StatusPill>
        );
    }

    return null;
}

function ToolIcon({ tool }: { tool: ClusterTool }) {
    return (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-tools-tint text-lg">
            {tool.icon}
        </span>
    );
}

function CardHeader({
    tool,
    name,
    href,
    action,
}: {
    tool: ClusterTool;
    name: string;
    href?: string;
    action: React.ReactNode;
}) {
    const { engine } = describeTool(tool.label);

    return (
        <div className="flex items-center gap-3">
            <ToolIcon tool={tool} />
            <div className="min-w-0 flex-1">
                {href ? (
                    <Link
                        href={href}
                        className="block truncate text-sm font-semibold hover:underline"
                    >
                        {name}
                    </Link>
                ) : (
                    <p className="truncate text-sm font-semibold">{name}</p>
                )}
                {engine && (
                    <p className="truncate text-xs text-soft">{engine}</p>
                )}
            </div>
            <div className="shrink-0">{action}</div>
        </div>
    );
}

function InstalledCard({
    server,
    tool,
}: {
    server: Server;
    tool: ClusterTool;
}) {
    const url = tool.url?.split(' ')[0] ?? null;
    const href = detailUrl(server, tool);

    return (
        <article className="flex flex-col gap-2 rounded-xl bg-surface p-3.5 ring-1 ring-line ring-inset">
            <CardHeader
                tool={tool}
                name={toolName(tool)}
                href={href}
                action={
                    url ? (
                        <Link
                            href={open().url}
                            method="post"
                            data={{ url }}
                            as="button"
                            className={buttonClass('secondary', 'sm')}
                        >
                            Open
                        </Link>
                    ) : (
                        <Link
                            href={href}
                            className={buttonClass('ghost', 'sm')}
                        >
                            Details
                        </Link>
                    )
                }
            />
            <Link
                href={href}
                className="truncate pl-12 font-mono text-[11px] text-soft hover:text-ink"
            >
                {tool.host ?? 'No public address'}
            </Link>
        </article>
    );
}

function AvailableCard({
    tool,
    runId,
    disabled,
    onInstall,
}: {
    tool: ClusterTool;
    runId?: number;
    disabled: boolean;
    onInstall: () => void;
}) {
    const { summary } = describeTool(tool.label);
    const name = toolName(tool);
    const blurb = summary.toLowerCase() === name.toLowerCase() ? null : summary;

    return (
        <article className="flex flex-col gap-2 rounded-xl bg-surface p-3.5 ring-1 ring-line ring-inset">
            <CardHeader
                tool={tool}
                name={name}
                action={
                    runId !== undefined ? (
                        <Link href={showRun(runId).url} className="inline-flex">
                            <StatusPill tone="busy">Installing…</StatusPill>
                        </Link>
                    ) : (
                        <Button
                            variant="dark"
                            size="sm"
                            disabled={disabled}
                            title={
                                disabled
                                    ? 'Available after verifying the server'
                                    : undefined
                            }
                            onClick={onInstall}
                        >
                            Install
                        </Button>
                    )
                }
            />
            {blurb && (
                <p className="truncate pl-12 text-xs text-soft">{blurb}</p>
            )}
        </article>
    );
}

function InstallDialog({
    server,
    tool,
    tools,
    onClose,
}: {
    server: Server;
    tool: ClusterTool;
    tools: ClusterTool[];
    onClose: () => void;
}) {
    const [domain, setDomain] = useState(suggestedDomain(tools));
    const { engine } = describeTool(tool.label);
    const name = toolName(tool);
    const ssoInstalled =
        tools.some(
            (candidate) => candidate.tool === 'sso' && candidate.installed,
        ) && tool.sso !== 'N/A';
    const mailInstalled =
        tools.some(
            (candidate) => candidate.tool === 'mail' && candidate.installed,
        ) && tool.mail !== 'N/A';

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
                        Install {name}
                    </h2>
                    {engine && (
                        <span className="text-sm text-soft">{engine}</span>
                    )}
                </div>
                <p className="mt-1.5 text-sm text-soft">
                    On {server.name}. It gets its own address under your domain.
                </p>
                <Form
                    action={store({ server: server.name, tool: tool.tool })}
                    className="mt-5 space-y-4"
                >
                    {({ errors, processing }) => (
                        <>
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-medium text-soft">
                                    Domain
                                </span>
                                <input
                                    name="domain"
                                    value={domain}
                                    onChange={(event) =>
                                        setDomain(
                                            event.target.value
                                                .trim()
                                                .toLowerCase(),
                                        )
                                    }
                                    placeholder="example.com"
                                    autoFocus
                                    spellCheck={false}
                                    className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-tools"
                                />
                                {errors.domain ? (
                                    <span className="mt-1 block text-xs text-accent">
                                        {errors.domain}
                                    </span>
                                ) : (
                                    <span className="mt-1 block text-xs text-soft">
                                        The tool's address is a subdomain of
                                        this, and it needs DNS pointing at{' '}
                                        {server.ip ?? 'the server'}.
                                    </span>
                                )}
                            </label>
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
