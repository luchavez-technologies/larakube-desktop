import { Link } from '@inertiajs/react';
import { useEffect, useMemo, useState } from 'react';
import Card from '@/components/card';
import StatusPill from '@/components/status-pill';
import { runStatus } from '@/lib/servers';
import { show as showRun } from '@/routes/runs';
import type { RunStatus } from '@/types/larakube';

export type RecentRun = {
    id: number;
    label: string;
    kind?: string;
    status: RunStatus;
    created_at: string;
    environment?: string | null;
};

function formatRunTimestamp(
    iso?: string | null,
    nowMs?: number | null,
): {
    text: string;
    title?: string;
} {
    if (!iso || nowMs === null || nowMs === undefined) {
        return { text: '\u00A0' };
    }

    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return { text: '—' };
    }

    const now = new Date(nowMs);
    const diffMs = Math.max(0, nowMs - date.getTime());
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    const timeStr = date.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
    });

    let prefix: string;
    if (diffMins < 1) {
        prefix = 'just now';
    } else if (diffMins < 60) {
        prefix = `${diffMins}m ago`;
    } else if (diffHours < 24) {
        prefix = `${diffHours}h ago`;
    } else {
        prefix = date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year:
                date.getFullYear() !== now.getFullYear()
                    ? 'numeric'
                    : undefined,
        });
    }

    return {
        text: `${prefix} · ${timeStr}`,
        title: date.toLocaleString(),
    };
}

export default function RecentRunsCard({
    runs,
    activeEnv,
}: {
    runs: RecentRun[];
    activeEnv: string;
}) {
    const [filterByEnv, setFilterByEnv] = useState(true);
    const [nowMs, setNowMs] = useState<number | null>(null);

    useEffect(() => {
        setNowMs(Date.now());
        const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
        return () => window.clearInterval(id);
    }, []);

    const filteredRuns = useMemo(() => {
        if (!filterByEnv) return runs;
        return runs.filter((run) => {
            const runEnv = run.environment?.toLowerCase();
            if (runEnv) {
                return runEnv === activeEnv.toLowerCase();
            }

            if (activeEnv === 'local') {
                return (
                    !runEnv ||
                    runEnv === 'local' ||
                    [
                        'up-project',
                        'down-project',
                        'start-project',
                        'stop-project',
                        'init-project',
                        'new-project',
                    ].includes(run.kind ?? '')
                );
            }
            return (
                runEnv === activeEnv.toLowerCase() ||
                run.label
                    .toLowerCase()
                    .includes(`(${activeEnv.toLowerCase()})`) ||
                (!run.label.includes('(') &&
                    activeEnv.toLowerCase() === 'production' &&
                    ['deploy-app', 'link-server', 'configure-host'].includes(
                        run.kind ?? '',
                    ))
            );
        });
    }, [runs, activeEnv, filterByEnv]);

    return (
        <Card
            label={
                filterByEnv
                    ? `Recent runs · ${activeEnv.toUpperCase()}`
                    : 'Recent runs (All)'
            }
            action={
                <button
                    type="button"
                    onClick={() => setFilterByEnv(!filterByEnv)}
                    className="cursor-pointer text-[11px] text-soft transition-colors hover:text-ink"
                    title={
                        filterByEnv
                            ? 'Show all project runs'
                            : `Filter runs for ${activeEnv}`
                    }
                >
                    {filterByEnv ? 'Show all' : `Filter ${activeEnv}`}
                </button>
            }
        >
            {filteredRuns.length === 0 ? (
                <p className="py-2 text-xs text-soft">
                    {filterByEnv
                        ? `No recent runs for ${activeEnv}.`
                        : 'Nothing yet.'}
                </p>
            ) : (
                filteredRuns.map((run) => {
                    const [label, tone] = runStatus[run.status];
                    const timestamp = formatRunTimestamp(run.created_at, nowMs);
                    return (
                        <Link
                            key={run.id}
                            href={showRun(run.id).url}
                            className="-mx-1 flex items-center justify-between gap-3 rounded border-t border-line px-1 py-2 transition-colors first:border-t-0 hover:bg-paper"
                        >
                            <div className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] text-ink">
                                    {run.label}
                                </span>
                                <time
                                    dateTime={run.created_at || undefined}
                                    title={timestamp.title}
                                    className="mt-0.5 block font-mono text-[11px] text-soft"
                                >
                                    {timestamp.text}
                                </time>
                            </div>
                            <StatusPill tone={tone} className="shrink-0">
                                {label}
                            </StatusPill>
                        </Link>
                    );
                })
            )}
        </Card>
    );
}
