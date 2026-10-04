import { Deferred, Link } from '@inertiajs/react';
import { Plus, Share2 } from 'lucide-react';
import { buttonClass } from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import { ListRow, TwoLine } from '@/components/list-row';
import PageHeader from '@/components/page-header';
import PlexCommonsCard, { CheckingRow } from '@/components/plex-commons-card';
import { ServerActions } from '@/components/server-dialogs';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { serverStatus } from '@/lib/servers';
import {
    index,
    share,
    shareDomainPage,
    unshare,
    updateCli,
} from '@/routes/devboxes';
import { create as projectsCreate } from '@/routes/projects';
import { providerLabels } from '@/types/larakube';
import type { DevBoxProject, PlexStatus, Server } from '@/types/larakube';

type Cluster = { context: string | null; plex: PlexStatus | null };

export default function ShowDevBox({
    box,
    projects,
    cluster,
}: {
    box: Server;
    projects?: DevBoxProject[] | null;
    cluster?: Cluster;
}) {
    const [label, tone] = serverStatus[box.status];
    const ready = box.status === 'ready';
    const ssh = `ssh ${box.name}`;

    return (
        <AppLayout title={box.name}>
            <Link
                href={index().url}
                className="mb-3 inline-block text-xs text-soft hover:text-ink"
            >
                ← Dev Boxes
            </Link>
            <PageHeader
                title={box.name}
                badge={<StatusPill tone={tone}>{label}</StatusPill>}
                meta={[
                    providerLabels[box.provider] ?? box.provider,
                    box.region,
                    box.ip,
                    'dev box',
                ]
                    .filter(Boolean)
                    .map((part) => (
                        <span key={part}>{part}</span>
                    ))}
            />

            <div className="grid grid-cols-[1fr_360px] gap-4.5">
                <div className="flex flex-col gap-4.5">
                    <Card
                        label="Projects on this box"
                        action={
                            <Link
                                href={projectsCreate().url}
                                className={buttonClass('secondary', 'sm')}
                            >
                                <Plus className="size-3.5" />
                                <span>New project</span>
                            </Link>
                        }
                    >
                        <Deferred
                            data="projects"
                            fallback={
                                <p className="text-xs text-soft">
                                    Asking the box…
                                </p>
                            }
                        >
                            <BoxProjects box={box.name} projects={projects} />
                        </Deferred>
                    </Card>

                    <Deferred
                        data="cluster"
                        fallback={
                            <CheckingRow title="Connecting to the box and checking Plex Commons…" />
                        }
                    >
                        {cluster?.context ? (
                            <PlexCommonsCard
                                server={box}
                                plex={cluster.plex}
                                disabled={!ready}
                            />
                        ) : (
                            <Card label="Plex Commons">
                                <p className="text-sm text-soft">
                                    Could not open the tunnel to the box&apos;s
                                    cluster, so Plex Commons can not be shown.
                                    Check the box is running, then reload.
                                </p>
                            </Card>
                        )}
                    </Deferred>

                    <Card label="Work on this box">
                        <ListRow action={<CopyButton value={ssh} />}>
                            <TwoLine
                                title="Connect"
                                detail="Opens a shell on the box. Use it from your terminal, or point VS Code Remote-SSH or JetBrains Gateway at it."
                                mono
                            />
                        </ListRow>
                        <ListRow
                            action={
                                <CopyButton value="cd ~/projects && larakube new my-app" />
                            }
                        >
                            <TwoLine
                                title="Make an app from a terminal"
                                detail="On the box: cd ~/projects, larakube new my-app, then larakube up in its folder. Apps outside ~/projects are not listed here."
                            />
                        </ListRow>
                        <ListRow>
                            <TwoLine
                                title="See an app"
                                detail="Share preview makes a temporary public link; Use my domain gives stable names for the app, Vite, Reverb and storage."
                            />
                        </ListRow>
                    </Card>
                </div>

                <div className="flex flex-col gap-4.5">
                    <Card label="Connection">
                        <ListRow action={<CopyButton value={ssh} />}>
                            <TwoLine title="SSH" detail={ssh} mono />
                        </ListRow>
                        <ListRow>
                            <TwoLine
                                title="Login user"
                                detail="larakube (root login disabled)"
                                mono
                            />
                        </ListRow>
                        <Deferred data="cluster" fallback={<></>}>
                            {cluster?.context ? (
                                <ListRow
                                    action={
                                        <CopyButton value={cluster.context} />
                                    }
                                >
                                    <TwoLine
                                        title="kubectl context"
                                        detail={cluster.context}
                                        mono
                                    />
                                </ListRow>
                            ) : null}
                        </Deferred>
                    </Card>

                    {ready && (
                        <Card label="This box">
                            <div className="flex flex-wrap items-center gap-2">
                                <Link
                                    href={updateCli({ box: box.name }).url}
                                    method="post"
                                    as="button"
                                    title="Install the latest LaraKube CLI on this box"
                                    className={buttonClass('secondary', 'sm')}
                                >
                                    Update CLI
                                </Link>
                                <ServerActions server={box} />
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </AppLayout>
    );
}

/** The apps on the box, asked of the box itself. */
function BoxProjects({
    box,
    projects,
}: {
    box: string;
    projects?: DevBoxProject[] | null;
}) {
    if (projects == null) {
        return (
            <p className="text-xs text-soft">
                The box did not answer, so its projects can&apos;t be listed
                now.
            </p>
        );
    }

    if (projects.length === 0) {
        return (
            <p className="text-xs text-soft">
                None in ~/projects yet. Create one with New project and choose
                this box.
            </p>
        );
    }

    return (
        <ul className="divide-y divide-line">
            {projects.map((project) => (
                <li
                    key={project.path}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0"
                >
                    <span className="min-w-0 truncate font-medium">
                        {project.name}
                        <span className="ml-2 font-mono text-xs font-normal text-soft">
                            {project.framework ?? 'unknown'}
                            {' · '}
                            {project.environments
                                .map((environment) => environment.name)
                                .join(', ')}
                        </span>
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                        {project.local === 'running' && (
                            <>
                                <Link
                                    href={
                                        share({ box, project: project.name })
                                            .url
                                    }
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
                                        shareDomainPage({
                                            box,
                                            project: project.name,
                                        }).url
                                    }
                                    title="Stable public names under your own Cloudflare domain: app, Vite, Reverb and storage"
                                    className={buttonClass('secondary', 'sm')}
                                >
                                    Use my domain
                                </Link>
                                <Link
                                    href={
                                        unshare({ box, project: project.name })
                                            .url
                                    }
                                    method="delete"
                                    as="button"
                                    title="Take the public link down"
                                    className={buttonClass('ghost', 'sm')}
                                >
                                    Stop sharing
                                </Link>
                            </>
                        )}
                        <StatusPill
                            tone={project.local === 'running' ? 'ok' : 'muted'}
                        >
                            {project.local === 'running'
                                ? 'Running'
                                : 'Stopped'}
                        </StatusPill>
                    </div>
                </li>
            ))}
        </ul>
    );
}
