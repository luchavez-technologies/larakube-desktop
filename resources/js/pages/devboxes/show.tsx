import { Deferred, Link } from '@inertiajs/react';
import { FolderGit2, Plus } from 'lucide-react';
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
import { index, shareDomainPage, updateCli } from '@/routes/devboxes';
import { show as showBoxProject } from '@/routes/devboxes/projects';
import {
    create as projectsCreate,
    index as projectsIndex,
} from '@/routes/projects';
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

            <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-4.5">
                <div className="flex flex-col gap-4.5">
                    <Card
                        label={`Projects${projects && projects.length > 0 ? ` · ${projects.length}` : ''}`}
                        action={
                            ready ? (
                                <Link
                                    href={
                                        projectsIndex({
                                            query: { box: box.name },
                                        }).url
                                    }
                                    className={buttonClass('ghost', 'sm')}
                                >
                                    View all
                                </Link>
                            ) : null
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
                                title="See an app from your computer"
                                detail="Share gives the app names under your own Cloudflare domain that stay the same: the app, Vite, Reverb and storage."
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

/** The apps on the box, asked of the box itself. Laid out like a server's hosted projects. */
function BoxProjects({
    box,
    projects,
}: {
    box: string;
    projects?: DevBoxProject[] | null;
}) {
    if (projects == null) {
        return (
            <p className="py-2 text-xs text-soft">
                The box did not answer, so its projects can&apos;t be listed
                now.
            </p>
        );
    }

    if (projects.length === 0) {
        return (
            <div className="py-6 text-center">
                <FolderGit2 className="mx-auto mb-2 size-8 text-faint" />
                <p className="text-sm font-medium text-ink">
                    No projects on this box yet
                </p>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-soft">
                    Create one with New project and choose this box. Apps
                    outside ~/projects are not listed.
                </p>
                <div className="mt-4 flex justify-center">
                    <Link
                        href={projectsCreate().url}
                        className={buttonClass('primary', 'sm')}
                    >
                        <Plus className="size-3.5" />
                        <span>New Project</span>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="divide-y divide-line">
            {projects.map((project) => (
                <div
                    key={project.path}
                    className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
                >
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <Link
                                href={
                                    showBoxProject({
                                        box,
                                        project: project.name,
                                    }).url
                                }
                                className="truncate text-sm font-semibold hover:underline"
                            >
                                {project.name}
                            </Link>
                            <span className="rounded bg-paper px-2 py-0.5 text-[11px] font-medium text-soft capitalize">
                                {project.framework ?? 'unknown'}
                            </span>
                            {project.environments.map((environment) => (
                                <span
                                    key={environment.name}
                                    className="rounded bg-paper px-1.5 py-0.5 font-mono text-[10px] text-soft"
                                >
                                    {environment.name}
                                </span>
                            ))}
                        </div>
                        <div className="mt-0.5 flex items-center gap-3 text-xs text-soft">
                            {project.environments[0]?.host ? (
                                <span className="font-mono text-ink">
                                    {project.environments[0].host}
                                </span>
                            ) : (
                                <span>No web host configured</span>
                            )}
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {project.local === 'running' && (
                            <Link
                                href={
                                    shareDomainPage({
                                        box,
                                        project: project.name,
                                    }).url
                                }
                                title="Public names under your own Cloudflare domain: app, Vite, Reverb and storage"
                                className={buttonClass('secondary', 'sm')}
                            >
                                Share
                            </Link>
                        )}
                        <StatusPill
                            tone={project.local === 'running' ? 'ok' : 'muted'}
                        >
                            {project.local === 'running'
                                ? 'Running'
                                : 'Stopped'}
                        </StatusPill>
                    </div>
                </div>
            ))}
        </div>
    );
}
