import { Link } from '@inertiajs/react';
import { useMemo, useState } from 'react';
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

export default function RecentRunsCard({
    runs,
    activeEnv,
}: {
    runs: RecentRun[];
    activeEnv: string;
}) {
    const [filterByEnv, setFilterByEnv] = useState(true);

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
                    return (
                        <Link
                            key={run.id}
                            href={showRun(run.id).url}
                            className="-mx-1 flex items-center justify-between gap-3 rounded border-t border-line px-1 py-2 transition-colors first:border-t-0 hover:bg-paper"
                        >
                            <span className="truncate text-[13px]">
                                {run.label}
                            </span>
                            <StatusPill tone={tone}>{label}</StatusPill>
                        </Link>
                    );
                })
            )}
        </Card>
    );
}
