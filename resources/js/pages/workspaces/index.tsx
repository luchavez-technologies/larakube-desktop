import { Deferred, Link, router, useForm, usePoll } from '@inertiajs/react';
import { ExternalLink, Pause, Play, Plus, Trash2 } from 'lucide-react';
import type { FormEvent } from 'react';
import Button, { buttonClass } from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import { ListRow, TwoLine } from '@/components/list-row';
import PageHeader from '@/components/page-header';
import StatusPill from '@/components/status-pill';
import type { Tone } from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { open } from '@/routes';
import { create as createServer } from '@/routes/servers';
import {
    destroy,
    index,
    open as openEditor,
    resume,
    store,
    suspend,
} from '@/routes/workspaces';

type ServerOption = {
    name: string;
    kind: string;
    ip: string | null;
    bindings: string[];
};
type DevPort = { name: string; port: number };
type Options = {
    sizes: { value: string; label: string }[];
    runtimes: {
        value: string;
        label: string;
        versions: string[];
        defaultVersion: string;
    }[];
    frameworks: {
        value: string;
        label: string;
        runtime: string;
        available: boolean;
        devCommand: string;
        devPorts: DevPort[];
    }[];
    defaultSize: string;
    defaultFramework: string;
    defaultBranch: string;
};
type Workspace = {
    name: string;
    repo: string;
    branch: string;
    size: string;
    framework: string;
    runtime: string;
    runtimeVersion: string;
    devCommand: string;
    devPorts: DevPort[];
    status: 'running' | 'suspended' | 'starting';
    publicKey: string;
    password?: string | null;
};

const statusTone: Record<Workspace['status'], [string, Tone]> = {
    running: ['Running', 'ok'],
    starting: ['Starting…', 'busy'],
    suspended: ['Suspended', 'muted'],
};

const inputClass =
    'w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand';

export default function Workspaces({
    servers,
    server,
    editor,
    options,
    workspaces,
}: {
    servers: ServerOption[];
    server: string | null;
    editor: {
        workspace: string;
        url: string;
        apps: Record<string, number>;
    } | null;
    options?: Options | null;
    workspaces?: Workspace[] | null;
}) {
    const anyStarting = (workspaces ?? []).some((w) => w.status === 'starting');

    usePoll(
        3000,
        { only: ['workspaces'] },
        { autoStart: anyStarting, keepAlive: false },
    );

    return (
        <AppLayout title="Workspaces">
            <PageHeader
                title="Workspaces"
                badge={<StatusPill tone="warn">Experimental</StatusPill>}
                subtitle="A browser editor with your repository, running on your own server. Nothing here is hosted by LaraKube. Experimental: it can change or break between releases."
                actions={
                    servers.length > 0 && (
                        <select
                            value={server ?? ''}
                            onChange={(event) =>
                                router.get(index().url, {
                                    server: event.target.value,
                                })
                            }
                            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm"
                            aria-label="Server"
                        >
                            {servers.map((s) => (
                                <option key={s.name} value={s.name}>
                                    {s.name}
                                    {s.ip ? ` (${s.ip})` : ''}
                                </option>
                            ))}
                        </select>
                    )
                }
            />

            {servers.length === 0 ? (
                <div className="rounded-2xl bg-surface px-8 py-14 text-center ring-1 ring-line ring-inset">
                    <p className="text-lg font-semibold tracking-[-0.015em]">
                        You need a server first
                    </p>
                    <p className="mx-auto mt-1.5 max-w-sm text-sm text-soft">
                        A workspace runs on a server of yours. Prefer a separate
                        one for development, not the one that runs your
                        production apps.
                    </p>
                    <Link
                        href={createServer().url}
                        className={buttonClass('primary', 'md', 'mt-5')}
                    >
                        Create a server
                    </Link>
                </div>
            ) : (
                <div className="space-y-5">
                    {(servers.find((s) => s.name === server)?.bindings.length ??
                        0) > 0 && (
                        <p className="rounded-lg bg-warn-tint px-3 py-2 text-sm text-warn">
                            {server} already runs{' '}
                            {servers
                                .find((s) => s.name === server)
                                ?.bindings.join(', ')}
                            . A workspace here shares its memory and disk with
                            it. A separate dev server is safer.
                        </p>
                    )}
                    <Deferred
                        data="options"
                        fallback={<Card label="New workspace">Loading…</Card>}
                    >
                        <NewWorkspace
                            server={server}
                            options={options ?? null}
                        />
                    </Deferred>

                    <Deferred
                        data="workspaces"
                        fallback={
                            <Card label="Workspaces on this server">
                                <p className="text-sm text-soft">
                                    Asking the server…
                                </p>
                            </Card>
                        }
                    >
                        <Card label="Workspaces on this server">
                            {workspaces == null ? (
                                <p className="text-sm text-soft">
                                    This server did not answer. Check that it is
                                    running, then reload.
                                </p>
                            ) : workspaces.length === 0 ? (
                                <p className="text-sm text-soft">
                                    None yet. Create one above.
                                </p>
                            ) : (
                                workspaces.map((workspace) => (
                                    <WorkspaceRow
                                        key={workspace.name}
                                        workspace={workspace}
                                        server={server}
                                        editor={
                                            editor?.workspace === workspace.name
                                                ? editor
                                                : null
                                        }
                                    />
                                ))
                            )}
                        </Card>
                    </Deferred>
                </div>
            )}
        </AppLayout>
    );
}

function NewWorkspace({
    server,
    options,
}: {
    server: string | null;
    options: Options | null;
}) {
    const form = useForm({
        server: server ?? '',
        name: '',
        repo: '',
        branch: options?.defaultBranch ?? 'main',
        size: options?.defaultSize ?? '',
        framework: options?.defaultFramework ?? 'laravel',
        runtimeVersion: '',
    });
    const framework = options?.frameworks.find(
        (f) => f.value === form.data.framework,
    );
    const runtime = options?.runtimes.find(
        (r) => r.value === framework?.runtime,
    );

    function submit(event: FormEvent) {
        event.preventDefault();
        form.transform((data) => ({ ...data, server: server ?? '' }));
        form.post(store().url);
    }

    return (
        <Card label="New workspace">
            <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                    <span className="mb-1 block text-xs font-medium text-soft">
                        Name
                    </span>
                    <input
                        value={form.data.name}
                        onChange={(e) => form.setData('name', e.target.value)}
                        placeholder="my-app"
                        className={inputClass}
                    />
                    {form.errors.name && (
                        <span className="text-xs text-accent">
                            Lowercase letters, digits and dashes.
                        </span>
                    )}
                </label>
                <label className="block">
                    <span className="mb-1 block text-xs font-medium text-soft">
                        Repository
                    </span>
                    <input
                        value={form.data.repo}
                        onChange={(e) => form.setData('repo', e.target.value)}
                        placeholder="https://github.com/you/app"
                        className={inputClass}
                    />
                    {form.errors.repo && (
                        <span className="text-xs text-accent">
                            Use an https://, git@ or ssh:// repository address.
                            A server of your own with SSH on another port is
                            ssh://git@host:2222/owner/repo.git.
                        </span>
                    )}
                </label>
                <label className="block">
                    <span className="mb-1 block text-xs font-medium text-soft">
                        Framework
                    </span>
                    <select
                        value={form.data.framework}
                        onChange={(e) => {
                            form.setData((data) => ({
                                ...data,
                                framework: e.target.value,
                                runtimeVersion: '',
                            }));
                        }}
                        className={inputClass}
                    >
                        {(options?.frameworks ?? []).map((f) => (
                            <option
                                key={f.value}
                                value={f.value}
                                disabled={!f.available}
                            >
                                {f.label}
                                {f.available
                                    ? ''
                                    : ' (image not published yet)'}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block">
                    <span className="mb-1 block text-xs font-medium text-soft">
                        {runtime?.label ?? 'Runtime'} version
                    </span>
                    <select
                        value={
                            form.data.runtimeVersion ||
                            runtime?.defaultVersion ||
                            ''
                        }
                        onChange={(e) =>
                            form.setData('runtimeVersion', e.target.value)
                        }
                        className={inputClass}
                    >
                        {(runtime?.versions ?? []).map((version) => (
                            <option key={version} value={version}>
                                {version}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block">
                    <span className="mb-1 block text-xs font-medium text-soft">
                        Branch to work on
                    </span>
                    <input
                        value={form.data.branch}
                        onChange={(e) => form.setData('branch', e.target.value)}
                        className={inputClass}
                    />
                </label>
                <label className="block">
                    <span className="mb-1 block text-xs font-medium text-soft">
                        Size
                    </span>
                    <select
                        value={form.data.size}
                        onChange={(e) => form.setData('size', e.target.value)}
                        className={inputClass}
                    >
                        {(options?.sizes ?? []).map((size) => (
                            <option key={size.value} value={size.value}>
                                {size.label}
                            </option>
                        ))}
                    </select>
                </label>
                <div className="flex items-center justify-between gap-4 sm:col-span-2">
                    <p className="text-xs leading-relaxed text-soft">
                        The first one takes a few minutes: LaraKube builds the
                        editor image and sends it to the server. You get a
                        deploy key to add to the repository, so the workspace
                        can clone and push to a branch.
                    </p>
                    <Button
                        type="submit"
                        disabled={
                            form.processing ||
                            !form.data.name ||
                            !form.data.repo
                        }
                    >
                        <Plus className="size-4" />
                        <span>Create workspace</span>
                    </Button>
                </div>
            </form>
        </Card>
    );
}

function WorkspaceRow({
    workspace,
    server,
    editor,
}: {
    workspace: Workspace;
    server: string | null;
    editor: { url: string; apps: Record<string, number> } | null;
}) {
    const editorUrl = editor?.url ?? null;
    const [label, tone] = statusTone[workspace.status];
    const data = { server };

    return (
        <div className="border-t border-line py-4 first:border-t-0 first:pt-0">
            <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                        <span className="text-sm font-semibold">
                            {workspace.name}
                        </span>
                        <StatusPill tone={tone}>{label}</StatusPill>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-xs text-soft">
                        {workspace.repo} · {workspace.branch} · {workspace.size}{' '}
                        · {workspace.runtime} {workspace.runtimeVersion}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {workspace.status === 'running' &&
                        (editorUrl ? (
                            <Link
                                href={open().url}
                                method="post"
                                data={{ url: editorUrl }}
                                as="button"
                                className={buttonClass('dark', 'sm')}
                            >
                                <ExternalLink className="size-3.5" />
                                <span>Open the editor</span>
                            </Link>
                        ) : (
                            <Link
                                href={openEditor(workspace.name).url}
                                method="post"
                                data={data}
                                as="button"
                                className={buttonClass('primary', 'sm')}
                            >
                                <ExternalLink className="size-3.5" />
                                <span>Connect</span>
                            </Link>
                        ))}
                    {workspace.status === 'suspended' ? (
                        <Link
                            href={resume(workspace.name).url}
                            method="post"
                            data={data}
                            as="button"
                            className={buttonClass('secondary', 'sm')}
                        >
                            <Play className="size-3.5" />
                            <span>Resume</span>
                        </Link>
                    ) : (
                        <Link
                            href={suspend(workspace.name).url}
                            method="post"
                            data={data}
                            as="button"
                            className={buttonClass('secondary', 'sm')}
                        >
                            <Pause className="size-3.5" />
                            <span>Suspend</span>
                        </Link>
                    )}
                    <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                            if (
                                window.confirm(
                                    `Delete workspace ${workspace.name}? Work that is not pushed is lost.`,
                                )
                            ) {
                                router.delete(destroy(workspace.name).url, {
                                    data,
                                });
                            }
                        }}
                    >
                        <Trash2 className="size-3.5" />
                        <span>Delete</span>
                    </Button>
                </div>
            </div>
            {editorUrl && (
                <p className="mt-2 text-xs text-soft">
                    The tunnel to the editor is open at{' '}
                    <span className="font-mono">{editorUrl}</span>. It closes
                    when you stop it in Activity.
                </p>
            )}
            {editor && workspace.devPorts.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-soft">
                    <span>Once the app is running, open it here:</span>
                    {workspace.devPorts.map((dev) => {
                        const local = editor.apps[String(dev.port)];

                        return local ? (
                            <Link
                                key={dev.port}
                                href={open().url}
                                method="post"
                                data={{ url: `http://127.0.0.1:${local}/` }}
                                as="button"
                                className={buttonClass('secondary', 'sm')}
                            >
                                {dev.name} ({local})
                            </Link>
                        ) : null;
                    })}
                </div>
            )}
            <div className="mt-2">
                {workspace.password && (
                    <ListRow action={<CopyButton value={workspace.password} />}>
                        <TwoLine
                            title="Editor password"
                            detail="Asked for when the editor opens"
                        />
                    </ListRow>
                )}
                <ListRow action={<CopyButton value={workspace.devCommand} />}>
                    <TwoLine
                        title="Start the app"
                        detail={`Run this in the editor's terminal: ${workspace.devCommand}`}
                    />
                </ListRow>
                <ListRow action={<CopyButton value={workspace.publicKey} />}>
                    <TwoLine
                        title="Deploy key"
                        detail="Add it to the repository (Settings, Deploy keys, allow write access) so the workspace can clone and push"
                    />
                </ListRow>
            </div>
        </div>
    );
}
