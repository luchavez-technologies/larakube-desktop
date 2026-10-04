import { Link } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Terminal } from 'lucide-react';
import Card from '@/components/card';
import LogPanel from '@/components/log-panel';
import StatusPill from '@/components/status-pill';
import { runStatus } from '@/lib/servers';
import { cancel, show as showRun } from '@/routes/runs';
import type { RunStatus } from '@/types/larakube';

export type ProjectRun = {
    id: number;
    label: string;
    kind: string | null;
    status: RunStatus;
    output: string;
    startedAt: string | null;
    finishedAt: string | null;
    environment?: string | null;
};

export default function ProjectTerminalCard({ run }: { run: ProjectRun }) {
    const running = run.status === 'running';
    const [label, tone] = runStatus[run.status];
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        if (running) {
            setCollapsed(false);
        }
    }, [running, run.id]);

    return (
        <Card>
            <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="relative flex size-6 shrink-0 items-center justify-center rounded-lg bg-term text-white shadow-2xs">
                        <Terminal className="size-3 text-brand" />
                        {running && (
                            <span className="absolute -top-0.5 -right-0.5 size-2 animate-ping rounded-full bg-brand" />
                        )}
                    </span>
                    <span
                        className="truncate text-xs font-semibold text-ink"
                        title={run.label}
                    >
                        {run.label}
                    </span>
                </div>

                <div className="flex shrink-0 items-center gap-2.5">
                    <StatusPill tone={tone}>{label}</StatusPill>
                    {running && (
                        <Link
                            href={cancel(run.id).url}
                            method="post"
                            as="button"
                            className="text-xs font-medium text-accent hover:underline"
                        >
                            Cancel
                        </Link>
                    )}
                    <Link
                        href={showRun(run.id).url}
                        className="inline-flex items-center gap-1 text-xs text-soft hover:text-ink hover:underline"
                        title="View in Activity"
                    >
                        <span>Activity</span>
                        <ExternalLink className="size-3" />
                    </Link>
                    <button
                        type="button"
                        onClick={() => setCollapsed(!collapsed)}
                        className="ml-1 inline-flex cursor-pointer items-center gap-1 text-xs text-soft transition-colors hover:text-ink"
                        title={
                            collapsed
                                ? 'Expand terminal output'
                                : 'Collapse terminal output'
                        }
                    >
                        <span>{collapsed ? 'Expand' : 'Collapse'}</span>
                        {collapsed ? (
                            <ChevronDown className="size-3" />
                        ) : (
                            <ChevronUp className="size-3" />
                        )}
                    </button>
                </div>
            </div>

            {!collapsed && (
                <div className="pt-3">
                    <LogPanel
                        output={run.output}
                        placeholder={
                            running ? 'Running command…' : 'No output recorded.'
                        }
                        follow={running}
                        className="h-72 max-h-96 min-h-[160px]"
                    />
                </div>
            )}
        </Card>
    );
}
