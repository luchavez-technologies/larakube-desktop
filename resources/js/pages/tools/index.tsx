import { Deferred, Form, Link, router } from '@inertiajs/react';
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
import { describeTool } from '@/types/larakube';
import type { ClusterTool, Server } from '@/types/larakube';

type Props = {
    server: Server;
    servers: Server[];
    tools?: ClusterTool[] | null;
    installing: Record<string, number>;
};

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

export default function ToolsIndex({
    server,
    servers,
    tools,
    installing,
}: Props) {
    const [installingTool, setInstallingTool] = useState<ClusterTool | null>(
        null,
    );

    return (
        <AppLayout title="Tools">
            <header className="mb-5 flex items-center justify-between gap-6">
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

            <Deferred data="tools" fallback={<Loading server={server.name} />}>
                {tools ? (
                    <div className="grid grid-cols-3 gap-3.5">
                        {tools.map((tool) => (
                            <ToolCard
                                key={`${tool.tool}-${tool.instance}`}
                                server={server}
                                tool={tool}
                                runId={installing[tool.tool]}
                                onInstall={() => setInstallingTool(tool)}
                            />
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-soft">
                        Couldn't read Cluster Tools from {server.name}. Check
                        that the server is reachable, then Refresh.
                    </p>
                )}
            </Deferred>

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

function ToolCard({
    server,
    tool,
    runId,
    onInstall,
}: {
    server: Server;
    tool: ClusterTool;
    runId?: number;
    onInstall: () => void;
}) {
    const { summary, engine } = describeTool(tool.label);

    return (
        <article className="flex flex-col gap-2.5 rounded-2xl bg-surface p-4.5 ring-1 ring-line ring-inset">
            <div className="flex items-center justify-between">
                <span className="flex size-8 items-center justify-center rounded-lg bg-tools-tint text-base">
                    {tool.icon}
                </span>
                {tool.installed ? (
                    <StatusPill tone="ok">Installed</StatusPill>
                ) : (
                    runId !== undefined && (
                        <StatusPill tone="busy">Installing…</StatusPill>
                    )
                )}
            </div>
            <div className="flex items-baseline gap-2">
                <Link
                    href={
                        showTool({ server: server.name, tool: tool.tool }).url
                    }
                    className="text-[15px] font-semibold hover:underline"
                >
                    {tool.brand}
                </Link>
                {engine && (
                    <span className="truncate text-[13px] text-soft">
                        {engine}
                    </span>
                )}
            </div>
            <p className="text-[13px] leading-relaxed text-soft">{summary}</p>
            <div className="mt-auto flex items-center justify-between pt-1">
                <span className="font-mono text-[11px] text-faint">
                    {tool.tool}:init
                </span>
                {tool.installed && tool.url ? (
                    <Link
                        href={open().url}
                        method="post"
                        data={{ url: tool.url.split(' ')[0] }}
                        as="button"
                        className={buttonClass('secondary', 'sm')}
                    >
                        Open
                    </Link>
                ) : runId !== undefined ? (
                    <Link
                        href={showRun(runId).url}
                        className={buttonClass('ghost', 'sm')}
                    >
                        View run
                    </Link>
                ) : tool.installed ? (
                    <Link
                        href={
                            showTool({ server: server.name, tool: tool.tool })
                                .url
                        }
                        className={buttonClass('secondary', 'sm')}
                    >
                        Details
                    </Link>
                ) : (
                    <Button variant="dark" size="sm" onClick={onInstall}>
                        Install
                    </Button>
                )}
            </div>
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
                        Install {tool.brand}
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
                                        : `Install ${tool.brand}`}
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
            <div className="grid grid-cols-3 gap-3.5">
                {Array.from({ length: 9 }, (_, index) => (
                    <div
                        key={index}
                        className="h-40 animate-pulse rounded-2xl bg-surface ring-1 ring-line"
                    />
                ))}
            </div>
        </div>
    );
}
