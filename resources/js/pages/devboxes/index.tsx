import { Deferred, Link } from '@inertiajs/react';
import { Plus, Share2 } from 'lucide-react';
import { buttonClass } from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import { ListRow, TwoLine } from '@/components/list-row';
import PageHeader from '@/components/page-header';
import { ServerActions } from '@/components/server-dialogs';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { serverStatus } from '@/lib/servers';
import {
    create,
    share,
    shareDomainPage,
    unshare,
    updateCli,
} from '@/routes/devboxes';
import { show as settingsShow } from '@/routes/settings';
import { index as workspacesIndex } from '@/routes/workspaces';
import { providerLabels } from '@/types/larakube';
import type { DevBoxProject, Server } from '@/types/larakube';

export default function DevBoxes({
    devBoxes,
    projects,
    disabled = false,
}: {
    devBoxes?: Server[] | null;
    projects?: Record<string, DevBoxProject[] | null>;
    disabled?: boolean;
}) {
    if (disabled) {
        return (
            <AppLayout title="Dev Boxes">
                <PageHeader
                    title="Dev Boxes"
                    badge={<StatusPill tone="warn">Experimental</StatusPill>}
                />
                <div className="rounded-2xl bg-surface px-8 py-14 text-center ring-1 ring-line ring-inset">
                    <p className="text-lg font-semibold tracking-[-0.015em]">
                        Experimental features are off
                    </p>
                    <p className="mx-auto mt-1.5 max-w-md text-sm text-soft">
                        Dev boxes are still being tried out. Turn on &ldquo;Show
                        experimental features&rdquo; in Settings and save to use
                        them. Dev boxes you already made keep running either
                        way.
                    </p>
                    <Link
                        href={settingsShow().url}
                        className={buttonClass('primary', 'md', 'mt-5')}
                    >
                        Open Settings
                    </Link>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout title="Dev Boxes">
            <PageHeader
                title="Dev Boxes"
                badge={<StatusPill tone="warn">Experimental</StatusPill>}
                subtitle="A server you work on, like your own computer: Podman, a local cluster and the LaraKube CLI. Make an app there, run it, and deploy it from there. Billed by your provider."
                actions={
                    <Link
                        href={create().url}
                        className={buttonClass('primary')}
                    >
                        <Plus className="size-4" />
                        <span>Create a dev box</span>
                    </Link>
                }
            />

            <Deferred
                data="devBoxes"
                fallback={
                    <div className="h-40 animate-pulse rounded-2xl bg-surface ring-1 ring-line" />
                }
            >
                {devBoxes == null ? (
                    <p className="text-sm text-soft">
                        The LaraKube CLI isn't ready yet. Finish Setup first.
                    </p>
                ) : devBoxes.length === 0 ? (
                    <div className="rounded-2xl bg-surface px-8 py-14 text-center ring-1 ring-line ring-inset">
                        <p className="text-lg font-semibold tracking-[-0.015em]">
                            No dev boxes yet
                        </p>
                        <p className="mx-auto mt-1.5 max-w-md text-sm text-soft">
                            A dev box is a server with Podman, a local cluster
                            and the LaraKube CLI already set up. Create one,
                            connect with SSH, and run{' '}
                            <span className="font-mono">larakube new</span>.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-5">
                        {devBoxes.map((box) => (
                            <DevBoxCard
                                key={box.name}
                                box={box}
                                projects={projects}
                            />
                        ))}
                    </div>
                )}
            </Deferred>

            <p className="mt-8 text-xs text-soft">
                Looking for browser editors on a deploy server?{' '}
                <Link
                    href={workspacesIndex().url}
                    className="text-ink underline"
                >
                    Browser workspaces
                </Link>{' '}
                (advanced).
            </p>
        </AppLayout>
    );
}

function DevBoxCard({
    box,
    projects,
}: {
    box: Server;
    projects?: Record<string, DevBoxProject[] | null>;
}) {
    const [label, tone] = serverStatus[box.status];
    const ssh = `ssh ${box.name}`;
    const tunnel = `ssh -L 8443:127.0.0.1:443 ${box.name}`;

    return (
        <Card
            label={box.name}
            action={
                <div className="flex items-center gap-3">
                    <StatusPill tone={tone}>{label}</StatusPill>
                    {box.status === 'ready' && (
                        <Link
                            href={updateCli({ box: box.name }).url}
                            method="post"
                            as="button"
                            title="Install the latest LaraKube CLI on this box"
                            className={buttonClass('ghost', 'sm')}
                        >
                            Update CLI
                        </Link>
                    )}
                    <ServerActions server={box} />
                </div>
            }
        >
            <p className="mb-2 font-mono text-xs text-soft">
                {providerLabels[box.provider] ?? box.provider}
                {box.region ? ` · ${box.region}` : ''}
                {box.ip ? ` · ${box.ip}` : ''}
            </p>
            <BoxProjects box={box.name} projects={projects} />
            <ListRow action={<CopyButton value={ssh} />}>
                <TwoLine
                    title="Connect"
                    detail="Opens a shell on the box. Use it from your terminal, or point VS Code Remote-SSH or JetBrains Gateway at it."
                    mono
                />
            </ListRow>
            <ListRow action={<CopyButton value="larakube new my-app" />}>
                <TwoLine
                    title="Make an app"
                    detail="On the box: larakube new my-app, then larakube up in its folder."
                />
            </ListRow>
            <ListRow action={<CopyButton value={tunnel} />}>
                <TwoLine
                    title="See an app"
                    detail="Open a tunnel to the box's ingress, then browse to the app on port 8443 (add its *.kube name to your hosts file, and accept the certificate)."
                    mono
                />
            </ListRow>
        </Card>
    );
}

/** The apps on the box, asked of the box itself. Empty until it answers. */
function BoxProjects({
    box,
    projects,
}: {
    box: string;
    projects?: Record<string, DevBoxProject[] | null>;
}) {
    const list = projects?.[box];

    return (
        <div className="mb-1 border-b border-line pb-3">
            <p className="mb-1.5 text-[11px] font-medium tracking-[0.06em] text-soft uppercase">
                Projects on this box
            </p>
            {projects === undefined ? (
                <p className="text-xs text-soft">Asking the box…</p>
            ) : list == null ? (
                <p className="text-xs text-soft">
                    The box did not answer, so its projects can't be listed now.
                </p>
            ) : list.length === 0 ? (
                <p className="text-xs text-soft">
                    None yet. Create one from New project and choose this box.
                </p>
            ) : (
                <ul className="space-y-1.5">
                    {list.map((project) => (
                        <li
                            key={project.path}
                            className="flex items-center justify-between gap-3 text-sm"
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
                                                share({
                                                    box,
                                                    project: project.name,
                                                }).url
                                            }
                                            method="post"
                                            as="button"
                                            title="Make a temporary public link to this app"
                                            className={buttonClass(
                                                'secondary',
                                                'sm',
                                            )}
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
                                            className={buttonClass(
                                                'secondary',
                                                'sm',
                                            )}
                                        >
                                            Use my domain
                                        </Link>
                                        <Link
                                            href={
                                                unshare({
                                                    box,
                                                    project: project.name,
                                                }).url
                                            }
                                            method="delete"
                                            as="button"
                                            title="Take the public link down"
                                            className={buttonClass(
                                                'ghost',
                                                'sm',
                                            )}
                                        >
                                            Stop sharing
                                        </Link>
                                    </>
                                )}
                                <StatusPill
                                    tone={
                                        project.local === 'running'
                                            ? 'ok'
                                            : 'muted'
                                    }
                                >
                                    {project.local === 'running'
                                        ? 'Running'
                                        : 'Stopped'}
                                </StatusPill>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
