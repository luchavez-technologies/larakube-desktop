import { Link, router, usePage } from '@inertiajs/react';
import {
    Activity,
    AlertCircle,
    ArrowRight,
    ArrowUpCircle,
    Bell,
    Check,
    CheckCheck,
    CheckCircle2,
    Clock,
    X,
} from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import StatusPill, { type Tone } from '@/components/status-pill';
import { runStatus } from '@/lib/servers';
import { cn } from '@/lib/utils';
import { index as runsIndex, show as showRun } from '@/routes/runs';
import { show as showSettings } from '@/routes/settings';
import type {
    ActiveRunSummary,
    NotificationItem,
    NotificationPayload,
    RecentRunSummary,
    RunStatus,
} from '@/types/larakube';

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

function StatusIcon({ status, type }: { status?: RunStatus; type?: string }) {
    if (type === 'update') {
        return <ArrowUpCircle className="size-3.5 shrink-0 text-indigo-500" />;
    }
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
        notifications?: NotificationPayload;
    }>();

    const activeRuns = page.props.activeRuns ?? [];
    const notifications = page.props.notifications;
    const items = notifications?.items ?? [];
    const unreadCount = notifications?.unreadCount ?? 0;
    const isRunning = activeRuns.length > 0;

    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Refresh notifications and active runs on an interval if runs are executing
    useEffect(() => {
        if (!isRunning) return;

        const interval = setInterval(() => {
            router.reload({
                only: ['activeRuns', 'recentRuns', 'notifications'],
            });
        }, 4000);

        return () => clearInterval(interval);
    }, [isRunning]);

    // Handle click outside and Escape key
    useEffect(() => {
        if (!open) return;

        function onPointerDown(event: globalThis.MouseEvent) {
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
            router.reload({
                only: ['activeRuns', 'recentRuns', 'notifications'],
            });
            setOpen(true);
        } else {
            setOpen(false);
        }
    }

    function handleMarkAllAsRead() {
        router.post(
            '/notifications/read-all',
            {},
            {
                preserveScroll: true,
                preserveState: true,
                only: ['notifications'],
            },
        );
    }

    function handleMarkAsRead(id: string, e?: MouseEvent) {
        e?.stopPropagation();
        e?.preventDefault();
        router.post(
            `/notifications/${id}/read`,
            {},
            {
                preserveScroll: true,
                preserveState: true,
                only: ['notifications'],
            },
        );
    }

    function handleNotificationClick(item: NotificationItem) {
        if (!item.read_at) {
            handleMarkAsRead(item.id);
        }
        setOpen(false);

        if (item.data.type === 'update') {
            router.visit(showSettings().url);
        } else if (item.data.run_id) {
            router.visit(showRun(item.data.run_id).url);
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
                ) : unreadCount > 0 ? (
                    <span
                        className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white shadow-2xs"
                        title={`${unreadCount} unread notification(s)`}
                    >
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                ) : null}
            </button>

            {/* Dropdown Popover */}
            {open && (
                <div
                    role="dialog"
                    aria-label="Activity notifications"
                    className="animate-in fade-in zoom-in-95 absolute top-full left-0 z-50 mt-2 w-88 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl duration-100"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-line/60 bg-paper/50 px-3.5 py-2.5">
                        <div className="flex items-center gap-2">
                            <Activity className="size-3.5 text-indigo-500" />
                            <span className="text-xs font-semibold text-ink">
                                Notifications
                            </span>
                            {unreadCount > 0 && (
                                <span className="py-0.2 rounded-full bg-indigo-500/10 px-1.5 text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
                                    {unreadCount} unread
                                </span>
                            )}
                        </div>
                        {isRunning ? (
                            <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-500">
                                <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
                                {activeRuns.length} running
                            </span>
                        ) : unreadCount > 0 ? (
                            <button
                                type="button"
                                onClick={handleMarkAllAsRead}
                                className="flex cursor-pointer items-center gap-1 text-[11px] font-medium text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400"
                                title="Mark all notifications as read"
                            >
                                <CheckCheck className="size-3" />
                                <span>Mark all read</span>
                            </button>
                        ) : (
                            <span className="text-[11px] text-faint">
                                All caught up
                            </span>
                        )}
                    </div>

                    {/* Notification List */}
                    <div className="max-h-80 divide-y divide-line/40 overflow-y-auto pr-1">
                        {items.length === 0 ? (
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
                            items.map((item) => {
                                const isUnread = !item.read_at;
                                const status = item.data.status;
                                const [statusLabel, statusTone]: [
                                    string,
                                    Tone,
                                ] =
                                    status && runStatus[status]
                                        ? runStatus[status]
                                        : [status ?? 'Done', 'muted'];

                                return (
                                    <div
                                        key={item.id}
                                        onClick={() =>
                                            handleNotificationClick(item)
                                        }
                                        className={cn(
                                            'group flex cursor-pointer items-start gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-paper',
                                            isUnread &&
                                                'bg-indigo-50/40 dark:bg-indigo-950/20',
                                        )}
                                    >
                                        <div className="mt-0.5 shrink-0">
                                            <StatusIcon
                                                status={status}
                                                type={item.data.type}
                                            />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <span
                                                    className={cn(
                                                        'truncate text-xs font-medium',
                                                        isUnread
                                                            ? 'font-semibold text-ink'
                                                            : 'text-soft',
                                                    )}
                                                >
                                                    {item.data.title ??
                                                        item.data.message ??
                                                        'Activity'}
                                                </span>
                                                <div className="flex shrink-0 items-center gap-1.5">
                                                    {status && (
                                                        <StatusPill
                                                            tone={statusTone}
                                                        >
                                                            {statusLabel}
                                                        </StatusPill>
                                                    )}
                                                    {isUnread && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) =>
                                                                handleMarkAsRead(
                                                                    item.id,
                                                                    e,
                                                                )
                                                            }
                                                            className="flex size-4.5 cursor-pointer items-center justify-center rounded text-soft opacity-0 transition group-hover:opacity-100 hover:bg-line hover:text-ink"
                                                            title="Mark as read"
                                                        >
                                                            <Check className="size-3" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="mt-1 flex items-center gap-2 text-[11px] text-faint">
                                                <span>
                                                    {formatRelativeTime(
                                                        item.created_at,
                                                    )}
                                                </span>
                                                {item.data.duration && (
                                                    <>
                                                        <span>·</span>
                                                        <span>
                                                            {item.data.duration}
                                                        </span>
                                                    </>
                                                )}
                                                {isUnread && (
                                                    <span className="size-1.5 rounded-full bg-indigo-500" />
                                                )}
                                            </div>
                                        </div>
                                    </div>
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
