import { Link } from '@inertiajs/react';
import PageHeader from '@/components/page-header';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { runStatus } from '@/lib/servers';
import { show } from '@/routes/runs';
import type { RunSummary } from '@/types/larakube';

const when = (iso: string | null) =>
    iso
        ? new Date(iso).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
          })
        : '—';

export default function RunsIndex({ runs }: { runs: RunSummary[] }) {
    return (
        <AppLayout title="Activity">
            <PageHeader
                title="Activity"
                subtitle="Everything LaraKube Desktop has run on this machine, newest first."
            />
            {runs.length === 0 ? (
                <p className="rounded-2xl bg-surface px-6 py-10 text-center text-sm text-soft ring-1 ring-line ring-inset">
                    Nothing has run yet.
                </p>
            ) : (
                <div className="rounded-2xl bg-surface px-5.5 ring-1 ring-line ring-inset">
                    {runs.map((run) => {
                        const [label, tone] = runStatus[run.status];

                        return (
                            <Link
                                key={run.id}
                                href={show(run.id).url}
                                className="flex items-center justify-between gap-4 border-t border-line py-3 first:border-t-0 hover:opacity-80"
                            >
                                <span className="text-sm font-medium">
                                    {run.label}
                                </span>
                                <span className="flex items-center gap-4">
                                    <span className="font-mono text-xs text-soft">
                                        {when(run.startedAt)}
                                    </span>
                                    <StatusPill tone={tone}>{label}</StatusPill>
                                </span>
                            </Link>
                        );
                    })}
                </div>
            )}
        </AppLayout>
    );
}
