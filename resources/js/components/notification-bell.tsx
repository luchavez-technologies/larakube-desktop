import { Link, router, usePage } from '@inertiajs/react';
import {
    Activity,
    AlertCircle,
    ArrowRight,
    Bell,
    CheckCircle2,
    Clock,
    X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import StatusPill from '@/components/status-pill';
import { runStatus } from '@/lib/servers';
import { cn } from '@/lib/utils';
import { index as runsIndex, show as showRun } from '@/routes/runs';
import type {
    ActiveRunSummary,
    RecentRunSummary,
    RunStatus,
} from '@/types/larakube';

const STORAGE_KEY = 'larakube:notifications:last_read_run_id';

function formatDuration(
    startedAt: string | null,
    finishedAt: string | null,
    status: RunStatus,
): string | null {
    if (!startedAt) return null;
    if (status === 'running') return 'running…';
    if (!finishedAt) return null;

    const start = new Date(startedAt).getTime();
    const finish = new Date(finishedAt).getTime();
    const diffSec = Math.max(0, Math.round((finish - start) / 1000));

    if (diffSec < 60) {
        return `${diffSec}s`;
    }
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    return `${mins}m ${secs}s`;
}

function formatRelativeTime(iso: string | null): string {
    if (!iso) return '—';
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return '1d ago';
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
    });
}

function StatusIcon({ status }: { status: RunStatus }) {
    if (status === 'running') {
        return (
            <span className="relative flex size-3.5 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
            </span>
        );
    }
    if (status === 'failed') {
        return <AlertCircle className="size-3.5 shrink-0 text-rose-500" />;
    }
    if (status === 'succeeded') {
        return <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />;
    }
    return <X className="size-3.5 shrink-0 text-soft" />;
}

export default function NotificationBell() {
    const page = usePage<{
        activeRuns?: ActiveRunSummary[];
        recentRuns?: RecentRunSummary[];
    }>();

    const activeRuns = page.props.activeRuns ?? [];
    const recentRuns = page.props.recentRuns ?? [];

    const [open, setOpen] = useState(false);
    const [lastReadId, setLastReadId] = useState<number>(() => {
        if (typeof window === 'undefined') return 0;
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? Number(stored) : 0;
    });

    const containerRef = useRef<HTMLDivElement>(null);

    const latestRun = recentRuns[0];
    const latestRunId = latestRun?.id ?? 0;
    const hasUnread = latestRunId > lastReadId;
    const isRunning = activeRuns.length > 0;
    const hasRecentFailure =
        latestRun?.status === 'failed' && latestRunId > lastReadId;

    // Refresh active/recent runs on an interval if there are active runs running
    useEffect(() => {
        if (!isRunning) return;

        const interval = setInterval(() => {
            router.reload({ only: ['activeRuns', 'recentRuns'] });
        }, 4000);

        return () => clearInterval(interval);
    }, [isRunning]);

    // Handle click outside and Escape key
    useEffect(() => {
        if (!open) return;

        function onPointerDown(event: MouseEvent) {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node)
            ) {
                setOpen(false);
            }
        }

        function onKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        }

        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    function toggleOpen() {
        if (!open) {
            // When opening, mark unread as read
            if (latestRunId > 0) {
                localStorage.setItem(STORAGE_KEY, String(latestRunId));
                setLastReadId(latestRunId);
            }
            // Trigger a quick reload to get the freshest run records
            router.reload({ only: ['activeRuns', 'recentRuns'] });
            setOpen(true);
        } else {
            setOpen(false);
        }
    }

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={toggleOpen}
                aria-label="Activity and notifications"
                aria-expanded={open}
                title="Activity & Notifications"
                className={cn(
                    'relative flex size-8 cursor-pointer items-center justify-center rounded-lg border transition',
                    open
                        ? 'border-line bg-paper text-ink shadow-2xs'
                        : 'border-transparent text-soft hover:border-line/60 hover:bg-paper hover:text-ink',
                )}
            >
                <Bell className="size-4" />

                {/* Status Badges */}
                {isRunning ? (
                    <span
                        className="absolute -top-0.5 -right-0.5 flex size-2.5"
                        title={`${activeRuns.length} run(s) in progress`}
                    >
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                        <span className="relative inline-flex size-2.5 rounded-full bg-amber-500" />
                    </span>
                ) : hasRecentFailure ? (
                    <span
                        className="absolute -top-0.5 -right-0.5 flex size-2 rounded-full bg-rose-500"
                        title="Recent run failed"
                    />
                ) : hasUnread ? (
                    <span
                        className="absolute -top-0.5 -right-0.5 flex size-2 rounded-full bg-indigo-500"
                        title="New activity"
                    />
                ) : null}
            </button>

            {/* Dropdown Popover */}
            {open && (
                <div
                    role="dialog"
                    aria-label="Activity notifications"
                    className="animate-in fade-in zoom-in-95 absolute top-full left-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-surface shadow-xl duration-100"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-line/60 bg-paper/50 px-3.5 py-2.5">
                        <div className="flex items-center gap-2">
                            <Activity className="size-3.5 text-indigo-500" />
                            <span className="text-xs font-semibold text-ink">
                                Activity
                            </span>
                        </div>
                        {isRunning ? (
                            <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-500">
                                <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
                                {activeRuns.length} running
                            </span>
                        ) : (
                            <span className="text-[11px] text-faint">
                                Recent runs
                            </span>
                        )}
                    </div>

                    {/* Run List */}
                    <div className="max-h-72 divide-y divide-line/40 overflow-y-auto">
                        {recentRuns.length === 0 ? (
                            <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
                                <Clock className="mb-2 size-6 text-faint" />
                                <p className="text-xs font-medium text-soft">
                                    No activity yet
                                </p>
                                <p className="mt-0.5 text-[11px] text-faint">
                                    CLI runs and commands will appear here.
                                </p>
                            </div>
                        ) : (
                            recentRuns.map((run) => {
                                const [statusLabel, statusTone] = runStatus[
                                    run.status
                                ] ?? [run.status, 'muted'];
                                const duration = formatDuration(
                                    run.created_at,
                                    run.finished_at,
                                    run.status,
                                );

                                return (
                                    <Link
                                        key={run.id}
                                        href={showRun(run.id).url}
                                        onClick={() => setOpen(false)}
                                        className="group flex items-start gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-paper"
                                    >
                                        <div className="mt-0.5 shrink-0">
                                            <StatusIcon status={run.status} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-1.5">
                                                <span className="truncate text-xs font-medium text-ink group-hover:text-brand">
                                                    {run.label}
                                                </span>
                                                <StatusPill tone={statusTone}>
                                                    {statusLabel}
                                                </StatusPill>
                                            </div>
                                            <div className="mt-1 flex items-center gap-2 text-[11px] text-faint">
                                                <span>
                                                    {formatRelativeTime(
                                                        run.created_at,
                                                    )}
                                                </span>
                                                {duration && (
                                                    <>
                                                        <span>·</span>
                                                        <span>{duration}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })
                        )}
                    </div>

                    {/* Footer */}
                    <div className="border-t border-line/60 bg-paper/30 px-3.5 py-2">
                        <Link
                            href={runsIndex().url}
                            onClick={() => setOpen(false)}
                            className="flex items-center justify-between text-[11px] font-medium text-soft transition hover:text-ink"
                        >
                            <span>View all in Activity</span>
                            <ArrowRight className="size-3" />
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
