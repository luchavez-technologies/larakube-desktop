import { useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { Deferred, Link } from '@inertiajs/react';
import {
    ArrowUpCircle,
    Check,
    Copy,
    Download,
    FolderGit2,
    Key,
    Lock,
    Plus,
    RotateCw,
    Share2,
    Trash2,
    UserPlus,
} from 'lucide-react';
import { SiGithub } from '@icons-pack/react-simple-icons';
import Button, { buttonClass } from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import DevBoxExportModal from '@/components/devbox-export-modal';
import DevBoxGrantModal from '@/components/devbox-grant-modal';
import { ListRow, TwoLine } from '@/components/list-row';
import PageHeader from '@/components/page-header';
import PlexCommonsCard, { CheckingRow } from '@/components/plex-commons-card';
import {
    DestroyServerDialog,
    RestartServerDialog,
    ServerActions,
} from '@/components/server-dialogs';
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
type Collaborator = { type: 'github' | 'key'; name: string; key: string };

export default function ShowDevBox({
    box,
    projects,
    cluster,
    collaborators,
}: {
    box: Server;
    projects?: DevBoxProject[] | null;
    cluster?: Cluster;
    collaborators?: Collaborator[] | null;
}) {
    const [label, tone] = serverStatus[box.status];
    const ready = box.status === 'ready';
    const ssh = `ssh ${box.name}`;
    const [exportOpen, setExportOpen] = useState(false);
    const [grantOpen, setGrantOpen] = useState(false);
    const [serverDialog, setServerDialog] = useState<
        'restart' | 'destroy' | null
    >(null);

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

                    <Card
                        label={`Collaborators${collaborators && collaborators.length > 0 ? ` · ${collaborators.length}` : ''}`}
                        action={
                            ready ? (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setGrantOpen(true)}
                                >
                                    <UserPlus className="size-3.5" />
                                    <span>Grant access</span>
                                </Button>
                            ) : null
                        }
                    >
                        <Deferred
                            data="collaborators"
                            fallback={
                                <p className="text-xs text-soft">
                                    Checking authorized collaborator keys…
                                </p>
                            }
                        >
                            <CollaboratorList
                                box={box.name}
                                collaborators={collaborators}
                                ready={ready}
                            />
                        </Deferred>
                    </Card>

                    <Card label="Work on this box">
                        <ol className="mt-1 flex flex-col gap-4">
                            <Step
                                n={1}
                                title="Connect"
                                detail={
                                    <>
                                        Opens a shell on the box. Point VS Code
                                        Remote-SSH or JetBrains Gateway at{' '}
                                        <code className="font-mono text-ink">
                                            {box.name}
                                        </code>{' '}
                                        to edit there.
                                    </>
                                }
                                command={ssh}
                            />
                            <Step
                                n={2}
                                title="Make an app"
                                detail={
                                    <>
                                        Then run{' '}
                                        <code className="font-mono text-ink">
                                            larakube up
                                        </code>{' '}
                                        in its folder. Only apps in{' '}
                                        <code className="font-mono text-ink">
                                            ~/projects
                                        </code>{' '}
                                        are listed here.
                                    </>
                                }
                                command="cd ~/projects && larakube new my-app"
                            />
                            <Step
                                n={3}
                                title="Open it from your computer"
                                detail={
                                    <>
                                        Press{' '}
                                        <span className="inline-flex items-center gap-1 font-medium text-ink">
                                            <Share2 className="size-3" />
                                            Share
                                        </span>{' '}
                                        on a running project above. It gets
                                        stable names under your own Cloudflare
                                        domain for the app, Vite, Reverb and
                                        storage.
                                    </>
                                }
                            />
                        </ol>
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
                        <Card label="Manage">
                            <ActionRow
                                icon={ArrowUpCircle}
                                title="Update CLI"
                                detail="Reinstall the latest LaraKube CLI on the box."
                                action={
                                    <Link
                                        href={updateCli({ box: box.name }).url}
                                        method="post"
                                        as="button"
                                        className={buttonClass(
                                            'secondary',
                                            'sm',
                                        )}
                                    >
                                        <ArrowUpCircle className="size-3.5" />
                                        <span>Update</span>
                                    </Link>
                                }
                            />
                            <ActionRow
                                icon={Lock}
                                title="Export bundle"
                                detail="An encrypted .devbox file to open this box on another computer."
                                action={
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => setExportOpen(true)}
                                    >
                                        <Download className="size-3.5" />
                                        <span>Export</span>
                                    </Button>
                                }
                            />
                            {box.kind === 'vps' && (
                                <ActionRow
                                    icon={RotateCw}
                                    title="Restart"
                                    detail="Reboot the server. Apps come back up on their own."
                                    action={
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() =>
                                                setServerDialog('restart')
                                            }
                                        >
                                            <RotateCw className="size-3.5" />
                                            <span>Restart</span>
                                        </Button>
                                    }
                                />
                            )}

                            <div className="mt-3 rounded-xl bg-accent-tint/40 p-3 ring-1 ring-accent-line ring-inset">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-accent">
                                            Destroy dev box
                                        </div>
                                        <p className="mt-0.5 text-xs leading-relaxed text-soft">
                                            Deletes the server and everything on
                                            it. This cannot be undone.
                                        </p>
                                    </div>
                                    <Button
                                        variant="danger"
                                        size="sm"
                                        className="shrink-0"
                                        onClick={() =>
                                            setServerDialog('destroy')
                                        }
                                    >
                                        <Trash2 className="size-3.5" />
                                        <span>Destroy</span>
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    )}
                    {!ready && box.kind !== 'discovered' && (
                        <Card label="Manage">
                            <ServerActions server={box} />
                        </Card>
                    )}
                </div>
            </div>

            {serverDialog === 'restart' && (
                <RestartServerDialog
                    server={box}
                    onClose={() => setServerDialog(null)}
                />
            )}
            {serverDialog === 'destroy' && (
                <DestroyServerDialog
                    server={box}
                    onClose={() => setServerDialog(null)}
                />
            )}

            <DevBoxExportModal
                isOpen={exportOpen}
                onClose={() => setExportOpen(false)}
                box={box.name}
            />

            <DevBoxGrantModal
                isOpen={grantOpen}
                onClose={() => setGrantOpen(false)}
                box={box.name}
            />
        </AppLayout>
    );
}

/** One numbered step: what to do, why, and the exact command to copy. */
function Step({
    n,
    title,
    detail,
    command,
}: {
    n: number;
    title: string;
    detail: ReactNode;
    command?: string;
}) {
    return (
        <li className="flex gap-3">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-badge text-[11px] font-semibold text-soft">
                {n}
            </span>
            <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink">{title}</div>
                {command && <CommandSnippet command={command} />}
                <p className="mt-1.5 text-xs leading-relaxed text-soft">
                    {detail}
                </p>
            </div>
        </li>
    );
}

/** A terminal command shown as-is, with a copy button inside it. */
function CommandSnippet({ command }: { command: string }) {
    const [copied, setCopied] = useState(false);

    return (
        <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-paper py-1.5 pr-1.5 pl-3 ring-1 ring-line ring-inset">
            <span className="text-faint select-none">$</span>
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink">
                {command}
            </code>
            <button
                type="button"
                onClick={() => {
                    void navigator.clipboard.writeText(command);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                }}
                className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-soft transition hover:bg-badge hover:text-ink"
                aria-label={`Copy ${command}`}
            >
                {copied ? (
                    <Check className="size-3" />
                ) : (
                    <Copy className="size-3" />
                )}
                <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
        </div>
    );
}

/** One thing that can be done to the box: what it is, what it does, and its button. */
function ActionRow({
    icon: Icon,
    title,
    detail,
    action,
}: {
    icon: ComponentType<{ className?: string }>;
    title: string;
    detail: string;
    action: ReactNode;
}) {
    return (
        <div className="flex items-center gap-3 border-t border-line py-3 first:border-t-0 first:pt-1">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-badge text-soft">
                <Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink">{title}</div>
                <p className="text-xs leading-relaxed text-soft">{detail}</p>
            </div>
            <div className="shrink-0">{action}</div>
        </div>
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
                                <Share2 className="size-3.5" />
                                <span>Share</span>
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

function CollaboratorList({
    box,
    collaborators,
    ready,
}: {
    box: string;
    collaborators?: Collaborator[] | null;
    ready: boolean;
}) {
    if (collaborators == null) {
        return (
            <p className="py-2 text-xs text-soft">
                Could not read collaborator keys from this box.
            </p>
        );
    }

    if (collaborators.length === 0) {
        return (
            <p className="py-2 text-xs text-soft">
                No collaborators authorized yet. Grant access to allow teammates
                to connect over SSH without sharing root keys.
            </p>
        );
    }

    return (
        <div className="divide-y divide-line">
            {collaborators.map((collab) => {
                const isGithub = collab.type === 'github';
                const keySnippet =
                    collab.key.length > 36
                        ? `${collab.key.slice(0, 16)}…${collab.key.slice(-12)}`
                        : collab.key;

                return (
                    <div
                        key={`${collab.type}-${collab.name}`}
                        className="flex items-center justify-between py-2.5 first:pt-1 last:pb-1"
                    >
                        <div className="flex items-center gap-2.5">
                            <div className="flex size-7 items-center justify-center rounded-lg bg-badge text-soft">
                                {isGithub ? (
                                    <SiGithub className="size-3.5" />
                                ) : (
                                    <Key className="size-3.5" />
                                )}
                            </div>
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-semibold text-ink">
                                        {isGithub
                                            ? `@${collab.name}`
                                            : collab.name}
                                    </span>
                                    <span className="rounded bg-paper px-1 py-0.5 font-mono text-[9px] text-soft uppercase">
                                        {collab.type}
                                    </span>
                                </div>
                                <p className="font-mono text-[11px] text-faint">
                                    {keySnippet}
                                </p>
                            </div>
                        </div>

                        {ready && (
                            <Link
                                href={`/dev-boxes/${box}/access/revoke`}
                                method="post"
                                data={
                                    isGithub
                                        ? { github: collab.name }
                                        : { pubkey: collab.key }
                                }
                                as="button"
                                className={buttonClass('danger', 'sm', 'gap-1')}
                                title="Revoke access"
                            >
                                <Trash2 className="size-3" />
                                <span>Revoke</span>
                            </Link>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
