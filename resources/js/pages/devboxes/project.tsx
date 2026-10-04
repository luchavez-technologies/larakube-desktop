import { Deferred, Link, usePoll } from '@inertiajs/react';
import { Share2 } from 'lucide-react';
import BackingServicesCard from '@/components/backing-services-card';
import BoxProjectActions from '@/components/box-project-actions';
import { buttonClass } from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import { ListRow, TwoLine } from '@/components/list-row';
import PageHeader from '@/components/page-header';
import ProjectTerminalCard, {
    type ProjectRun,
} from '@/components/project-terminal-card';
import RecentRunsCard, { type RecentRun } from '@/components/recent-runs-card';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { open } from '@/routes';
import {
    show as showBox,
    share,
    shareDomainPage,
    unshare,
} from '@/routes/devboxes';
import { index } from '@/routes/projects';
import type { BackingServices, DevBoxProject } from '@/types/larakube';

export default function ShowDevBoxProject({
    box,
    name,
    details,
    backing,
    sharing,
    runs,
    latestRun,
}: {
    box: string;
    name: string;
    details?: DevBoxProject | { state: 'unreachable' | 'missing' };
    backing?: BackingServices | null;
    sharing?: Sharing | null;
    runs: RecentRun[];
    latestRun: ProjectRun | null;
}) {
    // Follow an action that is still running until it finishes.
    usePoll(
        2000,
        { only: ['runs', 'latestRun', 'details'] },
        { autoStart: latestRun?.status === 'running', keepAlive: false },
    );

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
                {details && !('state' in details) ? (
                    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                        <div className="flex flex-col gap-5">
                            <DevelopmentCard box={box} project={details} />
                            <Deferred
                                data="backing"
                                fallback={
                                    <div className="h-40 animate-pulse rounded-2xl bg-surface ring-1 ring-line" />
                                }
                            >
                                <BackingServicesCard
                                    label="Backing Services · LOCAL"
                                    services={backing}
                                    hasCommons={backing?.commons ?? false}
                                />
                            </Deferred>
                            <Deferred
                                data="sharing"
                                fallback={
                                    <div className="h-24 animate-pulse rounded-2xl bg-surface ring-1 ring-line" />
                                }
                            >
                                <SharingCard
                                    box={box}
                                    project={details}
                                    sharing={sharing}
                                />
                            </Deferred>
                            {latestRun && (
                                <ProjectTerminalCard run={latestRun} />
                            )}
                        </div>
                        <div className="flex flex-col gap-5">
                            <RecentRunsCard runs={runs} activeEnv="local" />
                        </div>
                    </div>
                ) : (
                    <Card tone="warn">
                        <p className="text-sm">
                            {details &&
                            'state' in details &&
                            details.state === 'missing'
                                ? `${box} answered, but ${name} is not in ~/projects there. Only apps in that folder are listed.`
                                : `${box} did not answer in time. It may be busy (an Up can take a while on a small box) or unreachable. Reload in a moment.`}
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
    details?: DevBoxProject | { state: 'unreachable' | 'missing' };
}) {
    const project = details && !('state' in details) ? details : null;

    return (
        <PageHeader
            title={name}
            badge={
                project?.framework ? (
                    <StatusPill tone="muted">{project.framework}</StatusPill>
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
                    {project ? ` · ${project.path}` : ''}
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

type Sharing = {
    zone: string | null;
    urls: Record<string, string>;
    running: boolean;
};

const serviceLabels: Record<string, string> = {
    web: 'App',
    hmr: 'Vite hot reload',
    reverb: 'Reverb',
    storage: 'File storage',
    'storage-console': 'Storage console',
};

function SharingCard({
    box,
    project,
    sharing,
}: {
    box: string;
    project: DevBoxProject;
    sharing?: Sharing | null;
}) {
    const running = project.local === 'running';
    const names = Object.entries(sharing?.urls ?? {});
    const hasNames = names.length > 0;

    return (
        <Card
            label="See it from your computer"
            action={
                hasNames ? (
                    <StatusPill tone={sharing?.running ? 'ok' : 'warn'}>
                        {sharing?.running ? 'Active' : 'Tunnel stopped'}
                    </StatusPill>
                ) : undefined
            }
        >
            {hasNames && (
                <div className="mb-3 divide-y divide-line">
                    {names.map(([key, url]) => (
                        <div
                            key={key}
                            className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                        >
                            <div className="min-w-0">
                                <p className="text-xs text-soft">
                                    {serviceLabels[key] ?? key}
                                </p>
                                <p className="truncate font-mono text-sm">
                                    {url}
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <CopyButton value={url} />
                                {key === 'web' && (
                                    <Link
                                        href={open().url}
                                        method="post"
                                        data={{ url }}
                                        as="button"
                                        className={buttonClass('dark', 'sm')}
                                    >
                                        Open
                                    </Link>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {!running && !hasNames ? (
                <p className="text-sm text-soft">
                    Start the app first, then share a link to it.
                </p>
            ) : (
                <div className="flex flex-wrap items-center gap-2">
                    {running && !hasNames && (
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
                    )}
                    <Link
                        href={
                            shareDomainPage({ box, project: project.name }).url
                        }
                        title="Stable public names under your own Cloudflare domain: app, Vite, Reverb and storage"
                        className={buttonClass('secondary', 'sm')}
                    >
                        {hasNames ? 'Change or remove names' : 'Use my domain'}
                    </Link>
                    {running && !hasNames && (
                        <Link
                            href={unshare({ box, project: project.name }).url}
                            method="delete"
                            as="button"
                            title="Take the public link down"
                            className={buttonClass('ghost', 'sm')}
                        >
                            Stop sharing
                        </Link>
                    )}
                </div>
            )}
        </Card>
    );
}
