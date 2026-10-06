import { Head, Link, router, usePoll } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { buttonClass } from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import { sendJson } from '@/lib/http';
import LogPanel from '@/components/log-panel';
import RunSteps from '@/components/run-steps';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { runStatus } from '@/lib/servers';
import { open, readiness } from '@/routes';
import { show as showProject } from '@/routes/projects';
import { cancel, index as runsIndex } from '@/routes/runs';
import { index as devBoxesIndex, show as showDevBox } from '@/routes/devboxes';
import { show as showBoxProject } from '@/routes/devboxes/projects';
import { index as serversIndex, show as showServer } from '@/routes/servers';
import { index as toolsIndex } from '@/routes/servers/tools';
import {
    ArrowLeft,
    ArrowRight,
    Check,
    Copy,
    ExternalLink,
    FileCode,
    Folder,
    Globe,
    KeyRound,
    ShieldCheck,
    Wrench,
    XCircle,
} from 'lucide-react';
import type { Run } from '@/types/larakube';

/** Where this run came from, so its page always has a way back. */
function backLink(run: Run): { href: string; label: string } {
    const server = run.meta?.server ?? run.serverName ?? null;

    if (run.meta?.project) {
        return {
            href: showProject(Number(run.meta.project)).url,
            label: 'Project',
        };
    }

    // What was done to an app on a dev box goes back to that app's page.
    if (
        run.meta?.role === 'dev' &&
        server &&
        run.meta.app &&
        [
            'operate-dev-box-project',
            'share-domain-dev-box-project',
            'remove-domain-dev-box-project',
        ].includes(run.kind ?? '')
    ) {
        return {
            href: showBoxProject({ box: server, project: run.meta.app }).url,
            label: run.meta.app,
        };
    }

    if (run.kind === 'create-dev-box') {
        return run.status === 'succeeded' && run.subject
            ? { href: showDevBox(run.subject).url, label: run.subject }
            : { href: devBoxesIndex().url, label: 'Dev boxes' };
    }

    if (run.meta?.role === 'dev' && server) {
        return { href: showDevBox(server).url, label: server };
    }

    if (run.meta?.role === 'dev') {
        return { href: devBoxesIndex().url, label: 'Dev boxes' };
    }

    switch (run.kind) {
        case 'create-server':
            return run.status === 'succeeded' && run.subject
                ? { href: showServer(run.subject).url, label: run.subject }
                : { href: serversIndex().url, label: 'Servers' };
        case 'destroy-server':
            return { href: serversIndex().url, label: 'Servers' };
        case 'restart-server':
        case 'connect-domain':
        case 'enable-ssl':
        case 'cluster-grant':
        case 'cluster-revoke':
            return server
                ? { href: showServer(server).url, label: server }
                : { href: serversIndex().url, label: 'Servers' };
        case 'install-cluster-tool':
        case 'remove-cluster-tool':
            return server
                ? { href: toolsIndex(server).url, label: `Tools on ${server}` }
                : { href: serversIndex().url, label: 'Servers' };
        case 'install-tool':
            return { href: readiness().url, label: 'Setup' };
        default:
            return { href: runsIndex().url, label: 'Activity' };
    }
}

function elapsed(run: Run): string {
    if (!run.startedAt) return '';
    const end = run.finishedAt ? new Date(run.finishedAt) : new Date();
    const seconds = Math.max(
        0,
        Math.round((end.getTime() - new Date(run.startedAt).getTime()) / 1000),
    );
    const text =
        seconds >= 60
            ? `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
            : `${seconds}s`;
    return run.finishedAt ? `finished in ${text}` : text;
}

export default function ShowRun({ run }: { run: Run }) {
    const running = run.status === 'running';
    const { stop } = usePoll(1000, { only: ['run'] });
    const [showLog, setShowLog] = useState(run.status !== 'succeeded');
    const [label, tone] = runStatus[run.status];
    const isDevBox = run.kind === 'create-dev-box';
    const isCreate = run.kind === 'create-server' || isDevBox;
    const server = run.meta?.server ?? run.serverName ?? null;

    useEffect(() => {
        if (!running) stop();
    }, [running, stop]);

    const isDetached =
        typeof window !== 'undefined' &&
        window.location.search.includes('detached=1');

    const content = (
        <>
            {!isDetached && (
                <Link
                    href={backLink(run).href}
                    className="mb-3 inline-block text-xs text-soft hover:text-ink"
                >
                    ← {backLink(run).label}
                </Link>
            )}
            <header className="mb-5 flex items-center justify-between gap-6">
                <div className="min-w-0">
                    <h1 className="truncate text-[28px] leading-tight font-semibold tracking-[-0.03em]">
                        {run.label}
                    </h1>
                    <div className="mt-2 flex items-center gap-3">
                        <StatusPill tone={tone}>{label}</StatusPill>
                        <span className="font-mono text-xs text-soft">
                            {elapsed(run)}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2.5">
                    {!isDetached && (
                        <button
                            type="button"
                            onClick={() =>
                                void sendJson(`/runs/${run.id}/detach`, 'POST')
                            }
                            className={buttonClass('secondary')}
                            title="Detach into floating window"
                        >
                            <ExternalLink className="size-4" />
                            <span>Detach</span>
                        </button>
                    )}
                    {running && (
                        <Link
                            href={cancel(run.id).url}
                            method="post"
                            as="button"
                            className={buttonClass('danger')}
                        >
                            <XCircle className="size-4" />
                            <span>Cancel</span>
                        </Link>
                    )}
                    {!running &&
                        isCreate &&
                        run.subject &&
                        run.status !== 'failed' && (
                            <Link
                                href={
                                    isDevBox
                                        ? showDevBox(run.subject).url
                                        : showServer(run.subject).url
                                }
                                className={buttonClass('secondary')}
                            >
                                <ArrowRight className="size-4" />
                                <span>
                                    {isDevBox ? 'View dev box' : 'View server'}
                                </span>
                            </Link>
                        )}
                    {run.kind === 'new-project' &&
                        run.status === 'succeeded' &&
                        run.meta?.project && (
                            <Link
                                href={showProject(Number(run.meta.project)).url}
                                className={buttonClass('primary')}
                            >
                                <ArrowRight className="size-4" />
                                <span>Open project</span>
                            </Link>
                        )}
                    {!running && run.kind === 'destroy-server' && (
                        <Link
                            href={serversIndex().url}
                            className={buttonClass('secondary')}
                        >
                            <ArrowLeft className="size-4" />
                            <span>Back to servers</span>
                        </Link>
                    )}
                    {!running &&
                        (run.kind === 'cluster-grant' ||
                            run.kind === 'cluster-revoke') &&
                        server && (
                            <Link
                                href={showServer(server).url}
                                className={buttonClass('secondary')}
                            >
                                <ArrowLeft className="size-4" />
                                <span>Back to {server}</span>
                            </Link>
                        )}
                </div>
            </header>

            {isCreate && (
                <RunSteps
                    output={run.output}
                    status={run.status}
                    kind={isDevBox ? 'dev-box' : 'server'}
                />
            )}

            {run.status === 'succeeded' &&
                isCreate &&
                (isDevBox ? (
                    <DevBoxCreatedCard run={run} />
                ) : (
                    <CreatedCard run={run} />
                ))}
            {run.status === 'succeeded' &&
                run.kind === 'share-domain-dev-box-project' && (
                    <SharedLinkCard run={run} />
                )}
            {run.status === 'succeeded' && run.kind === 'cluster-grant' && (
                <ClusterGrantCard run={run} />
            )}
            {run.status === 'failed' && (
                <Card tone="error" className="mb-4">
                    <p className="text-base font-semibold text-accent">
                        {isCreate
                            ? `The ${isDevBox ? 'dev box' : 'server'} couldn't be created`
                            : 'This run failed'}
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed">
                        {typeof run.result?.error === 'string'
                            ? run.result.error
                            : 'See the log below for what went wrong.'}
                    </p>
                </Card>
            )}
            {run.status === 'cancelled' && (
                <Card tone="warn" className="mb-4">
                    <p className="text-base font-semibold text-warn">
                        Cancelled
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed">
                        {isCreate
                            ? 'The provider finishes the step it already started and LaraKube keeps track of everything it made. Open the server to destroy what was created.'
                            : 'The run was stopped before it finished.'}
                    </p>
                </Card>
            )}

            {showLog ? (
                <LogPanel
                    output={run.output}
                    placeholder={running ? 'Starting…' : 'No output.'}
                    follow={running}
                    fill
                />
            ) : (
                <button
                    type="button"
                    onClick={() => setShowLog(true)}
                    className="flex w-full items-center justify-between rounded-xl bg-surface px-4.5 py-3 text-left ring-1 ring-line ring-inset"
                >
                    <span className="text-[13px] font-medium">
                        Full log · {run.output.split('\n').length} lines
                    </span>
                    <span className="text-[13px] text-soft">Show ▾</span>
                </button>
            )}
        </>
    );

    if (isDetached) {
        return (
            <div className="min-h-screen bg-surface p-6 text-ink">
                <Head title={run.label} />
                {content}
            </div>
        );
    }

    return <AppLayout title={run.label}>{content}</AppLayout>;
}

const serviceLabels: Record<string, string> = {
    hmr: 'Vite hot reload',
    reverb: 'Reverb',
    storage: 'File storage',
    'storage-console': 'Storage console',
};

/** The public link `share` made, and what it means to hand it out. */
function SharedLinkCard({ run }: { run: Run }) {
    const result = run.result ?? {};
    const urls = (
        typeof result.urls === 'object' && result.urls !== null
            ? result.urls
            : {}
    ) as Record<string, string>;
    const web = urls.web;
    const others = Object.entries(urls).filter(([key]) => key !== 'web');

    return (
        <Card className="mb-4 p-5.5">
            <h2 className="text-[11px] font-medium tracking-[0.06em] text-ok uppercase">
                Your project is public (the names stay the same)
            </h2>
            {web ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="font-mono text-sm font-medium break-all">
                        {web}
                    </span>
                    <CopyButton value={web} />
                    <Link
                        href={open().url}
                        method="post"
                        data={{ url: web }}
                        as="button"
                        className={buttonClass('dark', 'sm')}
                    >
                        Open it
                    </Link>
                </div>
            ) : (
                <p className="mt-3 text-sm text-soft">
                    The names were made but are not in the result. See the log.
                </p>
            )}
            {others.length > 0 && (
                <ul className="mt-3 space-y-1 text-[13px]">
                    {others.map(([key, url]) => (
                        <li key={key} className="flex items-center gap-2">
                            <span className="w-28 text-soft">
                                {serviceLabels[key] ?? key}
                            </span>
                            <span className="font-mono break-all">{url}</span>
                            <CopyButton value={url} />
                        </li>
                    ))}
                </ul>
            )}
            <p className="mt-4 text-[13px] leading-relaxed text-soft">
                The app is set to use these names, also after Up. Who can open
                them is set in Cloudflare; add a login there (Cloudflare Access)
                if the app should not be open to everyone. Take them down from
                the app&apos;s page when you are done.
            </p>
        </Card>
    );
}

function DevBoxCreatedCard({ run }: { run: Run }) {
    const result = run.result ?? {};
    const name = run.subject ?? '';

    return (
        <Card className="mb-4 p-5.5">
            <h2 className="text-[11px] font-medium tracking-[0.06em] text-ok uppercase">
                Your dev box is ready
            </h2>
            <dl className="mt-3 flex flex-wrap gap-10">
                {typeof result.ip === 'string' && (
                    <div>
                        <dt className="text-xs text-soft">IP address</dt>
                        <dd className="mt-1 font-mono text-sm font-medium">
                            {result.ip}
                        </dd>
                    </div>
                )}
                <div>
                    <dt className="text-xs text-soft">Connect</dt>
                    <dd className="mt-1 font-mono text-sm font-medium">
                        ssh {name}
                    </dd>
                </div>
                <div>
                    <dt className="text-xs text-soft">Make an app there</dt>
                    <dd className="mt-1 font-mono text-sm font-medium">
                        larakube new my-app
                    </dd>
                </div>
            </dl>
        </Card>
    );
}

function CreatedCard({ run }: { run: Run }) {
    const result = run.result ?? {};
    const facts = [
        ['IP address', result.ip],
        ['kubectl context', result.context],
        ['SSH', run.subject ? `ssh ${run.subject}` : null],
    ].filter(
        (fact): fact is [string, string] =>
            typeof fact[1] === 'string' && fact[1] !== '',
    );

    return (
        <Card className="mb-4 p-5.5">
            <h2 className="text-[11px] font-medium tracking-[0.06em] text-ok uppercase">
                Your server is ready
            </h2>
            <dl className="mt-3 flex flex-wrap gap-10">
                {facts.map(([term, value]) => (
                    <div key={term}>
                        <dt className="text-xs text-soft">{term}</dt>
                        <dd className="mt-1 font-mono text-sm font-medium">
                            {value}
                        </dd>
                    </div>
                ))}
            </dl>
            <p className="mt-4 text-[13px] text-soft">
                Connecting a domain and automatic SSL certificates need a
                Cloudflare token, so they were skipped. Set them up now, or
                later from the server page.
            </p>
            {run.subject && (
                <div className="mt-3 flex gap-2.5">
                    <Link
                        href={
                            showServer(run.subject, {
                                query: { step: 'domain' },
                            }).url
                        }
                        className={buttonClass('secondary', 'sm')}
                    >
                        <Globe className="size-3.5" />
                        <span>Connect a domain</span>
                    </Link>
                    <Link
                        href={
                            showServer(run.subject, { query: { step: 'ssl' } })
                                .url
                        }
                        className={buttonClass('secondary', 'sm')}
                    >
                        <ShieldCheck className="size-3.5" />
                        <span>Automatic SSL certificates</span>
                    </Link>
                    <Link
                        href={toolsIndex(run.subject).url}
                        className={buttonClass('primary', 'sm')}
                    >
                        <Wrench className="size-3.5" />
                        <span>Install Cluster Tools</span>
                    </Link>
                </div>
            )}
        </Card>
    );
}

function ClusterGrantCard({ run }: { run: Run }) {
    const server = (run.meta?.server as string) ?? run.serverName ?? '';
    const teammate =
        (run.meta?.teammate as string) ||
        run.output.match(/Granted '([a-z0-9_-]+)'/i)?.[1] ||
        'teammate';
    const role =
        (run.meta?.role as string) ||
        run.output.match(/Granted '[^']+' \[([^\]]+)\]/i)?.[1] ||
        'admin';
    const isClusterWide =
        Boolean(run.meta?.cluster) ||
        run.output.includes('on the whole cluster');
    const scope = isClusterWide
        ? 'Cluster-wide (all namespaces)'
        : (run.meta?.scope as string) || 'Scoped namespaces';

    const kubeconfigMatch = run.output.match(
        /Kubeconfig(?:\s+credential)?:\s*(\S+?\.kubeconfig)/i,
    );
    const kubeconfigPath =
        (run.meta?.kubeconfigPath as string) || kubeconfigMatch?.[1];

    const rbacMatch = run.output.match(
        /RBAC(?:\s+manifest\s+YAML)?:\s*(\S+?-rbac\.yaml)/i,
    );
    const rbacPath = (run.meta?.rbacPath as string) || rbacMatch?.[1];

    const [kubeconfigContent, setKubeconfigContent] = useState<string | null>(
        null,
    );
    const [rbacContent, setRbacContent] = useState<string | null>(null);
    const [copiedKube, setCopiedKube] = useState(false);
    const [copiedRbac, setCopiedRbac] = useState(false);

    const revealPath = (type: 'kubeconfig' | 'rbac') => {
        router.post(
            `/runs/${run.id}/reveal`,
            { type },
            { preserveScroll: true },
        );
    };

    const copyFile = async (type: 'kubeconfig' | 'rbac') => {
        try {
            let content =
                type === 'kubeconfig' ? kubeconfigContent : rbacContent;
            if (!content) {
                const res = await sendJson<{ content: string }>(
                    `/runs/${run.id}/file?type=${type}`,
                    'GET',
                );
                if (res.ok && res.data.content) {
                    content = res.data.content;
                    if (type === 'kubeconfig') setKubeconfigContent(content);
                    else setRbacContent(content);
                }
            }
            if (content) {
                await navigator.clipboard.writeText(content);
                if (type === 'kubeconfig') {
                    setCopiedKube(true);
                    setTimeout(() => setCopiedKube(false), 2000);
                } else {
                    setCopiedRbac(true);
                    setTimeout(() => setCopiedRbac(false), 2000);
                }
            }
        } catch {
            // ignore
        }
    };

    return (
        <Card className="mb-4 divide-y divide-line p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
                <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-ok/10 text-ok">
                        <ShieldCheck className="size-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-ink">
                                Access Granted to {teammate}
                            </h3>
                            <span className="rounded bg-paper px-2 py-0.5 font-mono text-xs font-semibold text-ink ring-1 ring-line">
                                {role}
                            </span>
                        </div>
                        <p className="mt-0.5 text-xs text-soft">
                            {scope}
                            {server ? ` · ${server}` : ''}
                        </p>
                    </div>
                </div>
                {server && (
                    <Link
                        href={showServer(server).url}
                        className={buttonClass('secondary', 'sm')}
                    >
                        <ArrowLeft className="size-3.5" />
                        <span>Back to {server}</span>
                    </Link>
                )}
            </div>

            <div className="py-3 text-xs leading-relaxed text-soft">
                Kubernetes RBAC permissions have been applied to the cluster.
                Deliver the standalone kubeconfig file securely to{' '}
                <strong className="text-ink">{teammate}</strong> so they can
                import it via{' '}
                <code className="rounded bg-paper px-1 py-0.5 font-mono text-[11px] text-ink">
                    larakube context:import
                </code>
                .
            </div>

            <div className="grid gap-3 pt-3 sm:grid-cols-2">
                <div className="rounded-xl bg-paper/60 p-3.5 ring-1 ring-line">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-ink">
                            <KeyRound className="size-3.5 text-brand" />
                            <span>Kubeconfig Credential</span>
                        </div>
                    </div>
                    <p className="mt-1 font-mono text-[11px] break-all text-soft">
                        {kubeconfigPath || 'Saved in Downloads'}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                        {kubeconfigPath && (
                            <button
                                type="button"
                                onClick={() => revealPath('kubeconfig')}
                                className={buttonClass('secondary', 'sm')}
                            >
                                <Folder className="size-3.5" />
                                <span>Show in Folder</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => void copyFile('kubeconfig')}
                            className={buttonClass('secondary', 'sm')}
                        >
                            {copiedKube ? (
                                <Check className="size-3.5 text-ok" />
                            ) : (
                                <Copy className="size-3.5" />
                            )}
                            <span>{copiedKube ? 'Copied' : 'Copy'}</span>
                        </button>
                    </div>
                </div>

                <div className="rounded-xl bg-paper/60 p-3.5 ring-1 ring-line">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-ink">
                            <FileCode className="size-3.5 text-soft" />
                            <span>Applied RBAC Manifest</span>
                        </div>
                    </div>
                    <p className="mt-1 font-mono text-[11px] break-all text-soft">
                        {rbacPath || 'Applied directly to cluster'}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                        {rbacPath && (
                            <button
                                type="button"
                                onClick={() => revealPath('rbac')}
                                className={buttonClass('secondary', 'sm')}
                            >
                                <Folder className="size-3.5" />
                                <span>Show in Folder</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => void copyFile('rbac')}
                            className={buttonClass('secondary', 'sm')}
                        >
                            {copiedRbac ? (
                                <Check className="size-3.5 text-ok" />
                            ) : (
                                <Copy className="size-3.5" />
                            )}
                            <span>
                                {copiedRbac ? 'Copied YAML' : 'Copy YAML'}
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        </Card>
    );
}
