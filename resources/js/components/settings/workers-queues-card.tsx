import { useCallback, useEffect, useState } from 'react';
import {
    Activity,
    ChevronDown,
    ChevronRight,
    RotateCw,
    Trash2,
    X,
    XCircle,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import { sendJson } from '@/lib/http';
import { cn } from '@/lib/utils';

type RuntimeProcess = {
    alias: string;
    pid: number | null;
    running: boolean;
    kind: 'system' | 'run';
};

type PendingJob = {
    id: number;
    queue: string;
    name: string;
    attempts: number;
    reserved: boolean;
    availableAt: string;
    createdAt: string;
};

type FailedJob = {
    id: number;
    uuid: string;
    queue: string;
    name: string;
    summary: string;
    exception: string;
    failedAt: string;
};

type RuntimeSnapshot = {
    processes: RuntimeProcess[];
    pending: { total: number; items: PendingJob[] };
    failed: { total: number; items: FailedJob[] };
};

export default function WorkersQueuesCard() {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [busyAction, setBusyAction] = useState<string | null>(null);
    const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
    const [expandedFailed, setExpandedFailed] = useState<
        Record<string, boolean>
    >({});

    const refresh = useCallback(async () => {
        setLoading(true);
        const result = await sendJson<RuntimeSnapshot>(
            '/diagnostics/runtime',
            'GET',
        );
        if (result.ok && result.data) {
            setSnapshot(result.data);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (!open) {
            return;
        }

        void refresh();
        const timer = window.setInterval(() => {
            void refresh();
        }, 3000);

        return () => window.clearInterval(timer);
    }, [open, refresh]);

    const runAction = async (key: string, url: string) => {
        setBusyAction(key);
        await sendJson(url, 'POST');
        await refresh();
        setBusyAction(null);
    };

    const toggleFailed = (uuid: string) => {
        setExpandedFailed((prev) => ({ ...prev, [uuid]: !prev[uuid] }));
    };

    return (
        <Card
            label="Workers & Queues"
            action={
                open ? (
                    <div className="flex items-center gap-1">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={loading}
                            onClick={() => void refresh()}
                        >
                            <RotateCw
                                className={cn(
                                    'size-3.5',
                                    loading && 'animate-spin',
                                )}
                            />
                            Refresh
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setOpen(false)}
                        >
                            <X className="size-3.5" />
                            Close
                        </Button>
                    </div>
                ) : (
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setOpen(true)}
                    >
                        <Activity className="size-4" />
                        Inspect workers &amp; queues
                    </Button>
                )
            }
        >
            {!open ? (
                <p className="text-sm text-soft">
                    Live NativePHP child processes (<code>
                        queue_default
                    </code>,{' '}
                    <code>queue_sync</code>, <code>scheduler</code>, active CLI
                    runs), pending queue jobs, and failed jobs with retry
                    controls.
                </p>
            ) : !snapshot ? (
                <p className="text-sm text-soft">
                    Loading runtime workers &amp; queues…
                </p>
            ) : (
                <div className="space-y-5">
                    <div>
                        <p className="mb-2 text-xs font-medium tracking-wider text-soft uppercase">
                            Child Processes ({snapshot.processes.length})
                        </p>
                        <div className="divide-y divide-line rounded-xl border border-line">
                            {snapshot.processes.map((proc) => (
                                <div
                                    key={proc.alias}
                                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                                >
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <span
                                            className={cn(
                                                'inline-block size-2 shrink-0 rounded-full',
                                                proc.running
                                                    ? 'bg-emerald-500'
                                                    : 'bg-rose-500',
                                            )}
                                        />
                                        <code className="truncate font-mono text-xs text-ink">
                                            {proc.alias}
                                        </code>
                                        <span className="rounded bg-surface px-1.5 py-0.5 text-[11px] text-soft">
                                            {proc.kind === 'system'
                                                ? 'worker'
                                                : 'cli run'}
                                        </span>
                                        {proc.pid !== null && (
                                            <span className="font-mono text-[11px] text-soft">
                                                PID {proc.pid}
                                            </span>
                                        )}
                                    </div>
                                    {proc.kind === 'system' ? (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="xs"
                                            disabled={
                                                busyAction ===
                                                `restart:${proc.alias}`
                                            }
                                            onClick={() =>
                                                void runAction(
                                                    `restart:${proc.alias}`,
                                                    `/diagnostics/processes/${encodeURIComponent(proc.alias)}/restart`,
                                                )
                                            }
                                        >
                                            <RotateCw className="size-3" />
                                            Restart
                                        </Button>
                                    ) : (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="xs"
                                            disabled={
                                                busyAction ===
                                                `stop:${proc.alias}`
                                            }
                                            onClick={() =>
                                                void runAction(
                                                    `stop:${proc.alias}`,
                                                    `/diagnostics/processes/${encodeURIComponent(proc.alias)}/stop`,
                                                )
                                            }
                                        >
                                            <XCircle className="size-3" />
                                            Stop
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <p className="mb-2 text-xs font-medium tracking-wider text-soft uppercase">
                            Queued Jobs ({snapshot.pending.total})
                        </p>
                        {snapshot.pending.items.length === 0 ? (
                            <p className="rounded-xl border border-line px-3 py-2 text-xs text-soft">
                                No pending jobs in the queue.
                            </p>
                        ) : (
                            <div className="divide-y divide-line rounded-xl border border-line">
                                {snapshot.pending.items.map((job) => (
                                    <div
                                        key={job.id}
                                        className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate font-mono text-ink">
                                                {job.name}
                                            </p>
                                            <p className="text-soft">
                                                queue: {job.queue} · attempts:{' '}
                                                {job.attempts}
                                            </p>
                                        </div>
                                        <span
                                            className={cn(
                                                'shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium',
                                                job.reserved
                                                    ? 'bg-amber-500/15 text-amber-600'
                                                    : 'bg-surface text-soft',
                                            )}
                                        >
                                            {job.reserved
                                                ? 'Running'
                                                : 'Waiting'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-xs font-medium tracking-wider text-soft uppercase">
                                Failed Jobs ({snapshot.failed.total})
                            </p>
                            {snapshot.failed.total > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="xs"
                                        disabled={busyAction === 'retry:all'}
                                        onClick={() =>
                                            void runAction(
                                                'retry:all',
                                                '/diagnostics/queues/retry',
                                            )
                                        }
                                    >
                                        <RotateCw className="size-3" />
                                        Retry all
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="danger"
                                        size="xs"
                                        disabled={busyAction === 'flush'}
                                        onClick={() =>
                                            void runAction(
                                                'flush',
                                                '/diagnostics/queues/flush',
                                            )
                                        }
                                    >
                                        <Trash2 className="size-3" />
                                        Flush
                                    </Button>
                                </div>
                            )}
                        </div>
                        {snapshot.failed.items.length === 0 ? (
                            <p className="rounded-xl border border-line px-3 py-2 text-xs text-soft">
                                No failed jobs.
                            </p>
                        ) : (
                            <div className="divide-y divide-line rounded-xl border border-line">
                                {snapshot.failed.items.map((job) => {
                                    const expanded = Boolean(
                                        expandedFailed[job.uuid],
                                    );

                                    return (
                                        <div
                                            key={job.uuid}
                                            className="px-3 py-2 text-xs"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        toggleFailed(job.uuid)
                                                    }
                                                    className="flex min-w-0 flex-1 items-start gap-1.5 text-left"
                                                >
                                                    {expanded ? (
                                                        <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-soft" />
                                                    ) : (
                                                        <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-soft" />
                                                    )}
                                                    <div className="min-w-0">
                                                        <p className="truncate font-mono text-ink">
                                                            {job.name}
                                                        </p>
                                                        <p className="truncate text-rose-600">
                                                            {job.summary}
                                                        </p>
                                                        <p className="text-[11px] text-soft">
                                                            queue: {job.queue} ·{' '}
                                                            {job.failedAt}
                                                        </p>
                                                    </div>
                                                </button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="xs"
                                                    disabled={
                                                        busyAction ===
                                                        `retry:${job.uuid}`
                                                    }
                                                    onClick={() =>
                                                        void runAction(
                                                            `retry:${job.uuid}`,
                                                            `/diagnostics/queues/retry/${encodeURIComponent(job.uuid)}`,
                                                        )
                                                    }
                                                >
                                                    <RotateCw className="size-3" />
                                                    Retry
                                                </Button>
                                            </div>
                                            {expanded && (
                                                <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-term p-2 font-mono text-[11px] whitespace-pre-wrap text-term-bright">
                                                    {job.exception}
                                                </pre>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Card>
    );
}
