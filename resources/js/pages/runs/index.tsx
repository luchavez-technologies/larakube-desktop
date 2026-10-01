import { useMemo, useState } from 'react';
import { Link, router } from '@inertiajs/react';
import {
    Activity,
    AlertCircle,
    CheckCircle2,
    ChevronRight,
    Clock,
    FolderGit2,
    Search,
    Server,
    Settings,
    Wrench,
    X,
} from 'lucide-react';
import PageHeader from '@/components/page-header';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { runStatus } from '@/lib/servers';
import { show } from '@/routes/runs';
import type { RunStatus, RunSummary, RunTargetType } from '@/types/larakube';

function formatDuration(
    startedAt: string | null,
    finishedAt: string | null,
    status: RunStatus,
): string {
    if (!startedAt) return '—';
    if (status === 'running') return 'running…';
    if (!finishedAt) return '—';

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

function formatTime(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
    });
}

type DateGroup = {
    title: string;
    count: number;
    runs: RunSummary[];
};

function groupRunsByDate(runs: RunSummary[]): DateGroup[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups: DateGroup[] = [];
    const groupMap = new Map<string, RunSummary[]>();

    for (const run of runs) {
        if (!run.startedAt) {
            const key = 'Earlier';
            if (!groupMap.has(key)) groupMap.set(key, []);
            groupMap.get(key)!.push(run);
            continue;
        }

        const date = new Date(run.startedAt);
        const runDay = new Date(date);
        runDay.setHours(0, 0, 0, 0);

        let key: string;
        if (runDay.getTime() === today.getTime()) {
            key = 'Today';
        } else if (runDay.getTime() === yesterday.getTime()) {
            key = 'Yesterday';
        } else {
            key = date.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year:
                    date.getFullYear() !== today.getFullYear()
                        ? 'numeric'
                        : undefined,
            });
        }

        if (!groupMap.has(key)) groupMap.set(key, []);
        groupMap.get(key)!.push(run);
    }

    for (const [title, list] of groupMap.entries()) {
        groups.push({ title, count: list.length, runs: list });
    }

    return groups;
}

export default function RunsIndex({ runs }: { runs: RunSummary[] }) {
    const [search, setSearch] = useState('');
    const [targetFilter, setTargetFilter] = useState<RunTargetType | 'all'>(
        'all',
    );
    const [statusFilter, setStatusFilter] = useState<RunStatus | 'all'>('all');

    const filteredRuns = useMemo(() => {
        const query = search.toLowerCase().trim();

        return runs.filter((run) => {
            if (targetFilter !== 'all' && run.targetType !== targetFilter) {
                return false;
            }

            if (statusFilter !== 'all' && run.status !== statusFilter) {
                return false;
            }

            if (!query) {
                return true;
            }

            const searchFields = [
                run.label,
                run.targetName ?? '',
                run.kind ?? '',
                run.status,
                run.environment ?? '',
            ].map((f) => f.toLowerCase());

            return searchFields.some((field) => field.includes(query));
        });
    }, [runs, search, targetFilter, statusFilter]);

    const targetCounts = useMemo(() => {
        const counts: Record<string, number> = {
            all: runs.length,
            project: 0,
            server: 0,
            tool: 0,
            companion: 0,
            context: 0,
            system: 0,
        };
        runs.forEach((r) => {
            counts[r.targetType] = (counts[r.targetType] || 0) + 1;
        });
        return counts;
    }, [runs]);

    const statusCounts = useMemo(() => {
        const counts = {
            all: runs.length,
            running: 0,
            succeeded: 0,
            failed: 0,
            cancelled: 0,
        };
        runs.forEach((r) => {
            counts[r.status] = (counts[r.status] || 0) + 1;
        });
        return counts;
    }, [runs]);

    const dateGroups = useMemo(
        () => groupRunsByDate(filteredRuns),
        [filteredRuns],
    );

    const hasActiveFilters =
        search !== '' || targetFilter !== 'all' || statusFilter !== 'all';

    const clearFilters = () => {
        setSearch('');
        setTargetFilter('all');
        setStatusFilter('all');
    };

    return (
        <AppLayout title="Activity">
            <PageHeader
                title="Activity"
                subtitle="Everything LaraKube Desktop has run on this machine, newest first."
            />

            {/* Quick Metrics Bar */}
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className={`rounded-xl p-3 text-left ring-1 transition-all ${
                        statusFilter === 'all'
                            ? 'bg-surface shadow-xs ring-2 ring-ink'
                            : 'bg-surface ring-line hover:ring-soft'
                    }`}
                >
                    <div className="mb-1 flex items-center justify-between text-soft">
                        <span className="text-[11px] font-medium tracking-[0.06em] uppercase">
                            Total Runs
                        </span>
                        <Activity className="size-4" />
                    </div>
                    <span className="text-xl font-semibold text-ink">
                        {runs.length}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() =>
                        setStatusFilter(
                            statusFilter === 'succeeded' ? 'all' : 'succeeded',
                        )
                    }
                    className={`rounded-xl p-3 text-left ring-1 transition-all ${
                        statusFilter === 'succeeded'
                            ? 'bg-ok-tint/30 shadow-xs ring-2 ring-ok'
                            : 'bg-surface ring-line hover:ring-ok/50'
                    }`}
                >
                    <div className="mb-1 flex items-center justify-between text-ok">
                        <span className="text-[11px] font-medium tracking-[0.06em] uppercase">
                            Succeeded
                        </span>
                        <CheckCircle2 className="size-4" />
                    </div>
                    <span className="text-xl font-semibold text-ok">
                        {statusCounts.succeeded}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() =>
                        setStatusFilter(
                            statusFilter === 'failed' ? 'all' : 'failed',
                        )
                    }
                    className={`rounded-xl p-3 text-left ring-1 transition-all ${
                        statusFilter === 'failed'
                            ? 'bg-accent-tint/30 shadow-xs ring-2 ring-accent'
                            : 'bg-surface ring-line hover:ring-accent/50'
                    }`}
                >
                    <div className="mb-1 flex items-center justify-between text-accent">
                        <span className="text-[11px] font-medium tracking-[0.06em] uppercase">
                            Failed
                        </span>
                        <AlertCircle className="size-4" />
                    </div>
                    <span className="text-xl font-semibold text-accent">
                        {statusCounts.failed}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() =>
                        setStatusFilter(
                            statusFilter === 'running' ? 'all' : 'running',
                        )
                    }
                    className={`rounded-xl p-3 text-left ring-1 transition-all ${
                        statusFilter === 'running'
                            ? 'bg-brand-tint/30 shadow-xs ring-2 ring-brand'
                            : 'bg-surface ring-line hover:ring-brand/50'
                    }`}
                >
                    <div className="mb-1 flex items-center justify-between text-brand">
                        <span className="text-[11px] font-medium tracking-[0.06em] uppercase">
                            Active
                        </span>
                        <Clock
                            className={`size-4 ${statusCounts.running > 0 ? 'animate-spin' : ''}`}
                        />
                    </div>
                    <span className="text-xl font-semibold text-brand">
                        {statusCounts.running}
                    </span>
                </button>
            </div>

            {/* Search and Filters Toolbar */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {/* Search Bar */}
                <div className="relative w-full max-w-sm">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search activity, projects, servers, status…"
                        className="h-9 w-full rounded-lg border border-line bg-surface pr-8 pl-9 text-[13px] text-ink placeholder:text-soft focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                    />
                    <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-soft" />
                    {search && (
                        <button
                            type="button"
                            onClick={() => setSearch('')}
                            className="absolute top-2.5 right-2.5 text-soft hover:text-ink"
                            aria-label="Clear search"
                        >
                            <X className="size-4" />
                        </button>
                    )}
                </div>

                {/* Target & Status Filter Groups */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Target Types */}
                    <div className="inline-flex h-9 items-center rounded-lg border border-line bg-surface p-1 text-xs">
                        {(['all', 'project', 'server', 'tool'] as const).map(
                            (type) => (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => setTargetFilter(type)}
                                    className={`flex h-7 items-center rounded-md px-2.5 font-medium capitalize transition-colors ${
                                        targetFilter === type
                                            ? 'bg-ink text-surface shadow-xs'
                                            : 'text-soft hover:text-ink'
                                    }`}
                                >
                                    <span>
                                        {type === 'all'
                                            ? 'All'
                                            : type === 'project'
                                              ? 'Projects'
                                              : type === 'server'
                                                ? 'Servers'
                                                : 'Tools'}
                                    </span>
                                    <span className="ml-1 opacity-70">
                                        (
                                        {type === 'all'
                                            ? targetCounts.all
                                            : targetCounts[type] || 0}
                                        )
                                    </span>
                                </button>
                            ),
                        )}
                    </div>

                    {/* Status Filter */}
                    <div className="inline-flex h-9 items-center rounded-lg border border-line bg-surface p-1 text-xs">
                        {(
                            ['all', 'succeeded', 'failed', 'running'] as const
                        ).map((status) => (
                            <button
                                key={status}
                                type="button"
                                onClick={() => setStatusFilter(status)}
                                className={`flex h-7 items-center rounded-md px-2.5 font-medium capitalize transition-colors ${
                                    statusFilter === status
                                        ? 'bg-ink text-surface shadow-xs'
                                        : 'text-soft hover:text-ink'
                                }`}
                            >
                                <span>
                                    {status === 'all'
                                        ? 'Status: All'
                                        : status === 'succeeded'
                                          ? 'Done'
                                          : status}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Results Counter / Filter Notice */}
            <div className="mb-4 flex items-center justify-between text-xs text-soft">
                <span>
                    Showing {filteredRuns.length} of {runs.length} runs
                </span>
                {hasActiveFilters && (
                    <button
                        type="button"
                        onClick={clearFilters}
                        className="font-medium text-brand hover:underline"
                    >
                        Reset filters
                    </button>
                )}
            </div>

            {/* Activity List */}
            {filteredRuns.length === 0 ? (
                <div className="rounded-2xl bg-surface px-6 py-12 text-center ring-1 ring-line ring-inset">
                    <p className="text-sm font-medium text-ink">
                        No matching activity
                    </p>
                    <p className="mt-1 text-xs text-soft">
                        {hasActiveFilters
                            ? 'Try clearing your filters or search terms.'
                            : 'Nothing has run on this machine yet.'}
                    </p>
                    {hasActiveFilters && (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="mt-3 inline-block text-xs font-medium text-brand hover:underline"
                        >
                            Clear all filters
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-6">
                    {dateGroups.map((group) => (
                        <div key={group.title}>
                            <div className="mb-2 flex items-center justify-between px-1">
                                <h3 className="text-[11px] font-medium tracking-[0.06em] text-soft uppercase">
                                    {group.title}
                                </h3>
                                <span className="font-mono text-xs text-faint">
                                    {group.runs.length}{' '}
                                    {group.runs.length === 1 ? 'run' : 'runs'}
                                </span>
                            </div>

                            <div className="overflow-hidden rounded-2xl bg-surface shadow-xs ring-1 ring-line ring-inset">
                                <table className="w-full border-collapse text-left">
                                    <thead>
                                        <tr className="border-b border-line bg-paper/40 text-[11px] font-medium tracking-[0.06em] text-soft uppercase">
                                            <th className="w-28 py-2.5 pr-3 pl-4">
                                                Status
                                            </th>
                                            <th className="px-3 py-2.5">
                                                Activity
                                            </th>
                                            <th className="w-48 px-3 py-2.5">
                                                Target
                                            </th>
                                            <th className="hidden w-28 px-3 py-2.5 md:table-cell">
                                                Environment
                                            </th>
                                            <th className="hidden w-24 px-3 py-2.5 text-right sm:table-cell">
                                                Duration
                                            </th>
                                            <th className="w-32 px-3 py-2.5 text-right">
                                                Time
                                            </th>
                                            <th className="w-9 py-2.5 pr-4 pl-1"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-line text-[13px]">
                                        {group.runs.map((run) => {
                                            const [label, tone] =
                                                runStatus[run.status];
                                            const duration = formatDuration(
                                                run.startedAt,
                                                run.finishedAt,
                                                run.status,
                                            );
                                            const relTime = formatRelativeTime(
                                                run.startedAt,
                                            );
                                            const timeStr = formatTime(
                                                run.startedAt,
                                            );

                                            return (
                                                <tr
                                                    key={run.id}
                                                    onClick={() =>
                                                        router.visit(
                                                            show(run.id).url,
                                                        )
                                                    }
                                                    className="group cursor-pointer transition-colors hover:bg-paper/60"
                                                >
                                                    {/* Status */}
                                                    <td className="py-3 pr-3 pl-4 align-middle whitespace-nowrap">
                                                        <StatusPill tone={tone}>
                                                            {label}
                                                        </StatusPill>
                                                    </td>

                                                    {/* Activity */}
                                                    <td className="px-3 py-3 align-middle">
                                                        <div className="min-w-0">
                                                            <span className="block max-w-md truncate font-medium text-ink transition-colors group-hover:text-brand">
                                                                {run.label}
                                                            </span>
                                                            <span className="font-mono text-[11px] text-faint">
                                                                #{run.id} ·{' '}
                                                                {run.kind ??
                                                                    'cli'}
                                                            </span>
                                                        </div>
                                                    </td>

                                                    {/* Target */}
                                                    <td className="px-3 py-3 align-middle whitespace-nowrap">
                                                        {run.targetName ? (
                                                            run.targetUrl ? (
                                                                <Link
                                                                    href={
                                                                        run.targetUrl
                                                                    }
                                                                    onClick={(
                                                                        e,
                                                                    ) =>
                                                                        e.stopPropagation()
                                                                    }
                                                                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                                                                        run.targetType ===
                                                                        'project'
                                                                            ? 'bg-brand-tint/60 text-brand hover:underline'
                                                                            : run.targetType ===
                                                                                'server'
                                                                              ? 'bg-ok-tint/60 text-ok hover:underline'
                                                                              : 'bg-tools-tint/60 text-tools hover:underline'
                                                                    }`}
                                                                >
                                                                    {run.targetType ===
                                                                        'project' && (
                                                                        <FolderGit2 className="size-3.5 shrink-0" />
                                                                    )}
                                                                    {run.targetType ===
                                                                        'server' && (
                                                                        <Server className="size-3.5 shrink-0" />
                                                                    )}
                                                                    {run.targetType ===
                                                                        'tool' && (
                                                                        <Wrench className="size-3.5 shrink-0" />
                                                                    )}
                                                                    <span className="max-w-[130px] truncate font-mono text-[11px]">
                                                                        {
                                                                            run.targetName
                                                                        }
                                                                    </span>
                                                                </Link>
                                                            ) : (
                                                                <span
                                                                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${
                                                                        run.targetType ===
                                                                        'project'
                                                                            ? 'bg-brand-tint/60 text-brand'
                                                                            : run.targetType ===
                                                                                'server'
                                                                              ? 'bg-ok-tint/60 text-ok'
                                                                              : 'bg-tools-tint/60 text-tools'
                                                                    }`}
                                                                >
                                                                    {run.targetType ===
                                                                        'project' && (
                                                                        <FolderGit2 className="size-3.5 shrink-0" />
                                                                    )}
                                                                    {run.targetType ===
                                                                        'server' && (
                                                                        <Server className="size-3.5 shrink-0" />
                                                                    )}
                                                                    {run.targetType ===
                                                                        'tool' && (
                                                                        <Wrench className="size-3.5 shrink-0" />
                                                                    )}
                                                                    <span className="max-w-[130px] truncate font-mono text-[11px]">
                                                                        {
                                                                            run.targetName
                                                                        }
                                                                    </span>
                                                                </span>
                                                            )
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1.5 rounded-md bg-paper px-2 py-0.5 text-[11px] font-medium text-soft">
                                                                <Settings className="size-3.5 shrink-0" />
                                                                <span className="font-mono">
                                                                    System
                                                                </span>
                                                            </span>
                                                        )}
                                                    </td>

                                                    {/* Environment */}
                                                    <td className="hidden px-3 py-3 align-middle whitespace-nowrap md:table-cell">
                                                        {run.environment ? (
                                                            <span className="rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[11px] text-soft uppercase">
                                                                {
                                                                    run.environment
                                                                }
                                                            </span>
                                                        ) : (
                                                            <span className="text-faint">
                                                                —
                                                            </span>
                                                        )}
                                                    </td>

                                                    {/* Duration */}
                                                    <td className="hidden px-3 py-3 text-right align-middle font-mono text-xs whitespace-nowrap text-soft sm:table-cell">
                                                        {duration}
                                                    </td>

                                                    {/* Time */}
                                                    <td className="px-3 py-3 text-right align-middle whitespace-nowrap">
                                                        <span
                                                            className="block font-mono text-xs text-ink"
                                                            title={
                                                                run.startedAt
                                                                    ? new Date(
                                                                          run.startedAt,
                                                                      ).toLocaleString()
                                                                    : undefined
                                                            }
                                                        >
                                                            {relTime}
                                                        </span>
                                                        {timeStr && (
                                                            <span className="block font-mono text-[10px] text-faint">
                                                                {timeStr}
                                                            </span>
                                                        )}
                                                    </td>

                                                    {/* Details Arrow */}
                                                    <td className="py-3 pr-4 pl-1 text-right align-middle">
                                                        <ChevronRight className="ml-auto size-4 text-faint transition-all group-hover:translate-x-0.5 group-hover:text-ink" />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </AppLayout>
    );
}
