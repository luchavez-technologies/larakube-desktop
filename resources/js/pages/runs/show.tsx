import { Link, usePoll } from '@inertiajs/react';
import { useEffect, useRef } from 'react';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { cancel } from '@/routes/runs';
import type { Run } from '@/types/larakube';

const statusTone = {
    running: 'busy',
    succeeded: 'ok',
    failed: 'bad',
    cancelled: 'muted',
} as const;
const statusLabel = {
    running: 'Running',
    succeeded: 'Done',
    failed: 'Failed',
    cancelled: 'Cancelled',
} as const;

export default function ShowRun({ run }: { run: Run }) {
    const running = run.status === 'running';
    const { stop } = usePoll(1000, { only: ['run'] });
    const logRef = useRef<HTMLPreElement>(null);

    useEffect(() => {
        if (!running) {
            stop();
        }
    }, [running, stop]);

    useEffect(() => {
        logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
    }, [run.output]);

    return (
        <AppLayout title={run.label}>
            <div className="mb-4 flex items-center gap-3">
                <StatusPill tone={statusTone[run.status]}>
                    {statusLabel[run.status]}
                </StatusPill>
                {run.exitCode !== null && (
                    <span className="text-xs text-slate-500">
                        exit code {run.exitCode}
                    </span>
                )}
                {running && (
                    <Link
                        href={cancel(run.id).url}
                        method="post"
                        as="button"
                        className="ml-auto rounded-lg px-3 py-1.5 text-xs font-medium text-setup-500 ring-1 ring-setup-500/30 hover:bg-setup-50"
                    >
                        Cancel
                    </Link>
                )}
            </div>

            {run.status === 'cancelled' && (
                <p className="mb-4 max-w-3xl rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Cancelled. If a cloud server was being created, the provider
                    finishes its current step and LaraKube keeps track of it, so
                    anything already created can still be removed with larakube
                    cloud:destroy.
                </p>
            )}

            {run.result && <ResultSummary result={run.result} />}

            <pre
                ref={logRef}
                className="h-[28rem] overflow-auto rounded-2xl bg-slate-950 p-5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-slate-200"
            >
                {run.output || (running ? 'Starting…' : 'No output.')}
            </pre>
        </AppLayout>
    );
}

function ResultSummary({ result }: { result: Record<string, unknown> }) {
    const entries = Object.entries(result).filter(
        ([key, value]) =>
            key !== 'success' && value !== null && typeof value !== 'object',
    );

    if (entries.length === 0) {
        return null;
    }

    return (
        <dl className="mb-4 grid max-w-3xl grid-cols-2 gap-x-6 gap-y-2 rounded-2xl bg-white p-5 text-sm shadow-sm ring-1 ring-slate-200">
            {entries.map(([key, value]) => (
                <div key={key}>
                    <dt className="text-xs text-slate-500">{key}</dt>
                    <dd className="font-mono break-all">{String(value)}</dd>
                </div>
            ))}
        </dl>
    );
}
