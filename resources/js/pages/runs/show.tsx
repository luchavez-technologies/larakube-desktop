import { Link, usePoll } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { buttonClass } from '@/components/button';
import Card from '@/components/card';
import LogPanel from '@/components/log-panel';
import RunSteps from '@/components/run-steps';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { runStatus } from '@/lib/servers';
import { readiness } from '@/routes';
import { show as showProject } from '@/routes/projects';
import { cancel, index as runsIndex } from '@/routes/runs';
import { index as serversIndex, show as showServer } from '@/routes/servers';
import { index as toolsIndex } from '@/routes/servers/tools';
import type { Run } from '@/types/larakube';

/** Where this run came from, so its page always has a way back. */
function backLink(run: Run): { href: string; label: string } {
    const server = run.meta?.server ?? null;

    if (run.meta?.project) {
        return {
            href: showProject(Number(run.meta.project)).url,
            label: 'Project',
        };
    }

    switch (run.kind) {
        case 'create-server':
            return run.status === 'succeeded' && run.subject
                ? { href: showServer(run.subject).url, label: run.subject }
                : { href: serversIndex().url, label: 'Servers' };
        case 'destroy-server':
            return { href: serversIndex().url, label: 'Servers' };
        case 'connect-domain':
        case 'enable-ssl':
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
    const isCreate = run.kind === 'create-server';

    useEffect(() => {
        if (!running) stop();
    }, [running, stop]);

    return (
        <AppLayout title={run.label}>
            <Link
                href={backLink(run).href}
                className="mb-3 inline-block text-xs text-soft hover:text-ink"
            >
                ← {backLink(run).label}
            </Link>
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
                    {running && (
                        <Link
                            href={cancel(run.id).url}
                            method="post"
                            as="button"
                            className={buttonClass('danger')}
                        >
                            Cancel
                        </Link>
                    )}
                    {!running &&
                        isCreate &&
                        run.subject &&
                        run.status !== 'failed' && (
                            <Link
                                href={showServer(run.subject).url}
                                className={buttonClass('secondary')}
                            >
                                View server
                            </Link>
                        )}
                    {!running && run.kind === 'destroy-server' && (
                        <Link
                            href={serversIndex().url}
                            className={buttonClass('secondary')}
                        >
                            Back to servers
                        </Link>
                    )}
                </div>
            </header>

            {isCreate && <RunSteps output={run.output} status={run.status} />}

            {run.status === 'succeeded' && isCreate && (
                <CreatedCard run={run} />
            )}
            {run.status === 'failed' && (
                <Card tone="error" className="mb-4">
                    <p className="text-base font-semibold text-accent">
                        {isCreate
                            ? "The server couldn't be created"
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
                    className="h-[26rem]"
                    follow={running}
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
        </AppLayout>
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
                        Connect a domain
                    </Link>
                    <Link
                        href={
                            showServer(run.subject, { query: { step: 'ssl' } })
                                .url
                        }
                        className={buttonClass('secondary', 'sm')}
                    >
                        Automatic SSL certificates
                    </Link>
                    <Link
                        href={toolsIndex(run.subject).url}
                        className={buttonClass('primary', 'sm')}
                    >
                        Install Cluster Tools
                    </Link>
                </div>
            )}
        </Card>
    );
}
