import { Deferred, Link } from '@inertiajs/react';
import { Share2 } from 'lucide-react';
import BoxProjectActions from '@/components/box-project-actions';
import { buttonClass } from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import { ListRow, TwoLine } from '@/components/list-row';
import PageHeader from '@/components/page-header';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import {
    show as showBox,
    share,
    shareDomainPage,
    unshare,
} from '@/routes/devboxes';
import { index } from '@/routes/projects';
import { show as showRun } from '@/routes/runs';
import type { DevBoxProject } from '@/types/larakube';

type BoxRun = {
    id: number;
    label: string;
    status: string;
    kind: string | null;
    at: string | null;
};

export default function ShowDevBoxProject({
    box,
    name,
    details,
    runs,
}: {
    box: string;
    name: string;
    details?: DevBoxProject | null;
    runs: BoxRun[];
}) {
    return (
        <AppLayout title={name}>
            <Link
                href={index({ query: { box } }).url}
                className="mb-3 inline-block text-xs text-soft hover:text-ink"
            >
                ← Projects
            </Link>
            <Deferred
                data="details"
                fallback={
                    <PageHeader title={name} meta={<span>On {box}</span>} />
                }
            >
                <Header box={box} name={name} details={details} />
            </Deferred>

            <Deferred
                data="details"
                fallback={
                    <div className="h-40 animate-pulse rounded-2xl bg-surface ring-1 ring-line" />
                }
            >
                {details ? (
                    <div className="space-y-5">
                        <DevelopmentCard box={box} project={details} />
                        <SharingCard box={box} project={details} />
                        <RunsCard runs={runs} />
                    </div>
                ) : (
                    <Card tone="warn">
                        <p className="text-sm">
                            {box} did not report {name}. Check the box is
                            running and the app is in ~/projects, then reload.
                        </p>
                    </Card>
                )}
            </Deferred>
        </AppLayout>
    );
}

function Header({
    box,
    name,
    details,
}: {
    box: string;
    name: string;
    details?: DevBoxProject | null;
}) {
    return (
        <PageHeader
            title={name}
            badge={
                details?.framework ? (
                    <StatusPill tone="muted">{details.framework}</StatusPill>
                ) : undefined
            }
            meta={
                <span>
                    <Link
                        href={showBox({ box }).url}
                        className="hover:text-ink hover:underline"
                    >
                        {box}
                    </Link>
                    {details ? ` · ${details.path}` : ''}
                </span>
            }
        />
    );
}

function DevelopmentCard({
    box,
    project,
}: {
    box: string;
    project: DevBoxProject;
}) {
    const host = project.environments[0]?.host;
    const running = project.local === 'running';

    return (
        <Card label={`Development on ${box}`}>
            <div className="space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        {host ? (
                            <span className="font-mono text-sm font-medium">
                                https://{host}
                            </span>
                        ) : (
                            <span className="text-sm text-soft">
                                No web host configured
                            </span>
                        )}
                        <p className="text-xs text-soft">
                            This address opens only on the box. To see the app
                            from here, share it below.
                        </p>
                    </div>
                    <StatusPill tone={running ? 'ok' : 'muted'}>
                        {running ? 'Running' : 'Stopped'}
                    </StatusPill>
                </div>
                <BoxProjectActions box={box} project={project} />
            </div>
            <div className="mt-3 border-t border-line pt-1">
                <ListRow action={<CopyButton value={`cd ${project.path}`} />}>
                    <TwoLine
                        title="Folder on the box"
                        detail={project.path}
                        mono
                    />
                </ListRow>
            </div>
        </Card>
    );
}

function SharingCard({
    box,
    project,
}: {
    box: string;
    project: DevBoxProject;
}) {
    const running = project.local === 'running';

    return (
        <Card label="See it from your computer">
            {!running ? (
                <p className="text-sm text-soft">
                    Start the app first, then share a link to it.
                </p>
            ) : (
                <div className="flex flex-wrap items-center gap-2">
                    <Link
                        href={share({ box, project: project.name }).url}
                        method="post"
                        as="button"
                        title="Make a temporary public link to this app"
                        className={buttonClass('secondary', 'sm')}
                    >
                        <Share2 className="size-3.5" />
                        <span>Share preview</span>
                    </Link>
                    <Link
                        href={
                            shareDomainPage({ box, project: project.name }).url
                        }
                        title="Stable public names under your own Cloudflare domain: app, Vite, Reverb and storage"
                        className={buttonClass('secondary', 'sm')}
                    >
                        Use my domain
                    </Link>
                    <Link
                        href={unshare({ box, project: project.name }).url}
                        method="delete"
                        as="button"
                        title="Take the public link down"
                        className={buttonClass('ghost', 'sm')}
                    >
                        Stop sharing
                    </Link>
                </div>
            )}
        </Card>
    );
}

function RunsCard({ runs }: { runs: BoxRun[] }) {
    return (
        <Card label="Recent runs">
            {runs.length === 0 ? (
                <p className="text-sm text-soft">
                    Nothing has been run on this app from LaraKube Desktop yet.
                </p>
            ) : (
                <div className="divide-y divide-line">
                    {runs.map((run) => (
                        <div
                            key={run.id}
                            className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                        >
                            <Link
                                href={showRun(run.id).url}
                                className="truncate text-sm font-medium hover:underline"
                            >
                                {run.label}
                            </Link>
                            <div className="flex shrink-0 items-center gap-3 text-xs text-soft">
                                <span>{run.at}</span>
                                <StatusPill
                                    tone={
                                        run.status === 'succeeded'
                                            ? 'ok'
                                            : run.status === 'failed'
                                              ? 'bad'
                                              : 'muted'
                                    }
                                >
                                    {run.status}
                                </StatusPill>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}
