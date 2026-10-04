import { useState, useEffect } from 'react';
import { Deferred, Link, router, usePage, usePoll } from '@inertiajs/react';
import { ArrowRight, FolderPlus, Laptop, Plus, Server } from 'lucide-react';
import { buttonClass } from '@/components/button';
import PageHeader from '@/components/page-header';
import ProjectActions from '@/components/project-actions';
import StatusPill from '@/components/status-pill';
import type { Tone } from '@/components/status-pill';
import ViewToggle, { type ViewMode } from '@/components/view-toggle';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import { show as showDevBox } from '@/routes/devboxes';
import { show as showBoxProject } from '@/routes/devboxes/projects';
import { create, index, show, store } from '@/routes/projects';
import BoxProjectActions from '@/components/box-project-actions';
import type { DevBoxProject, Project } from '@/types/larakube';

export default function ProjectsIndex({
    projects,
    hasActiveRuns = false,
    devBoxes,
    box = null,
    boxProjects,
}: {
    projects: Project[];
    hasActiveRuns?: boolean;
    devBoxes?: string[];
    box?: string | null;
    boxProjects?: DevBoxProject[] | null;
}) {
    const { errors } = usePage().props as { errors: Record<string, string> };

    // Follow a running up, down, start or stop until it finishes.
    usePoll(
        2000,
        { only: ['projects', 'hasActiveRuns'] },
        { autoStart: hasActiveRuns, keepAlive: false },
    );
    const [viewMode, setViewMode] = useState<ViewMode>('cards');

    useEffect(() => {
        const saved = localStorage.getItem('larakube_view_mode_projects');
        if (saved === 'cards' || saved === 'table') {
            setViewMode(saved);
        }
    }, []);

    const handleViewModeChange = (mode: ViewMode) => {
        setViewMode(mode);
        localStorage.setItem('larakube_view_mode_projects', mode);
    };

    return (
        <AppLayout title="Projects">
            <PageHeader
                title="Projects"
                subtitle="Your app folders. Link one to a server and deploy it: Laravel, Statamic, WordPress, Next.js, Vite, Astro and Docusaurus."
                actions={
                    <div className="flex items-center gap-2.5">
                        <ViewToggle
                            mode={viewMode}
                            onChange={handleViewModeChange}
                        />
                        {!box && (
                            <Link
                                href={store().url}
                                method="post"
                                as="button"
                                className={buttonClass('secondary')}
                            >
                                <FolderPlus className="size-4" />
                                <span>Add existing folder</span>
                            </Link>
                        )}
                        <Link
                            href={
                                create(box ? { query: { box } } : undefined).url
                            }
                            className={buttonClass('primary')}
                        >
                            <Plus className="size-4" />
                            <span>New project</span>
                        </Link>
                    </div>
                }
            />
            {errors.path && (
                <p className="mb-4 rounded-lg bg-accent-tint px-3 py-2 text-sm text-accent">
                    {errors.path}
                </p>
            )}
            <Deferred data="devBoxes" fallback={<></>}>
                {devBoxes && devBoxes.length > 0 ? (
                    <LocationSwitch devBoxes={devBoxes} box={box} />
                ) : null}
            </Deferred>
            {box ? (
                <Deferred
                    data="boxProjects"
                    fallback={
                        <div className="h-40 animate-pulse rounded-2xl bg-surface ring-1 ring-line" />
                    }
                >
                    <BoxProjectList
                        box={box}
                        projects={boxProjects}
                        viewMode={viewMode}
                    />
                </Deferred>
            ) : projects.length === 0 ? (
                <div className="rounded-2xl bg-surface px-8 py-14 text-center ring-1 ring-line ring-inset">
                    <p className="text-lg font-semibold tracking-[-0.015em]">
                        No projects yet
                    </p>
                    <p className="mx-auto mt-1.5 max-w-sm text-sm text-soft">
                        Start a new Laravel, Next.js, Vite, Astro or Docusaurus
                        app, or add the folder of one you already have.
                    </p>
                </div>
            ) : viewMode === 'cards' ? (
                /* Card Grid View */
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
                    {projects.map((project) => (
                        <div
                            key={project.id}
                            className="rounded-xl bg-surface p-4 ring-1 ring-line transition-all ring-inset hover:ring-faint"
                        >
                            <Link href={show(project.id).url} className="block">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="truncate text-sm font-semibold">
                                        {project.name}
                                    </span>
                                    <StatusPill
                                        tone={projectStatus(project)[1]}
                                    >
                                        {projectStatus(project)[0]}
                                    </StatusPill>
                                </div>
                                <p className="mt-1 text-xs text-soft">
                                    {project.framework ??
                                        project.detectedFramework ??
                                        (project.exists
                                            ? 'Unknown framework'
                                            : '—')}
                                </p>
                                <p className="mt-2 truncate font-mono text-[11px] text-faint">
                                    {project.path}
                                </p>
                            </Link>
                            <div className="mt-3 border-t border-line pt-3">
                                <ProjectActions project={project} />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                /* Table View */
                <div className="overflow-hidden rounded-2xl bg-surface px-5.5 ring-1 ring-line ring-inset">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="text-[11px] tracking-[0.06em] text-soft uppercase">
                                {[
                                    'Name',
                                    'Framework',
                                    'Host / Path',
                                    'Server',
                                    'Status',
                                    'Quick actions',
                                    '',
                                ].map((heading) => (
                                    <th
                                        key={heading}
                                        className="py-3 font-medium"
                                    >
                                        {heading}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {projects.map((project) => {
                                const [statusLabel, statusTone] =
                                    projectStatus(project);
                                const framework =
                                    project.framework ??
                                    project.detectedFramework ??
                                    (project.exists ? 'Unknown' : '—');

                                return (
                                    <tr
                                        key={project.id}
                                        className="border-t border-line"
                                    >
                                        <td className="py-3.5 font-medium">
                                            <Link
                                                href={show(project.id).url}
                                                className="font-semibold hover:underline"
                                            >
                                                {project.name}
                                            </Link>
                                        </td>
                                        <td className="text-soft">
                                            <StatusPill tone="muted">
                                                {framework}
                                            </StatusPill>
                                        </td>
                                        <td className="max-w-[220px] truncate font-mono text-[12px] text-soft">
                                            {project.webHost
                                                ? `https://${project.webHost}`
                                                : project.path}
                                        </td>
                                        <td className="font-mono text-[12px] text-soft">
                                            {project.serverIp ?? '—'}
                                        </td>
                                        <td>
                                            <StatusPill tone={statusTone}>
                                                {statusLabel}
                                            </StatusPill>
                                        </td>
                                        <td className="py-2">
                                            <ProjectActions project={project} />
                                        </td>
                                        <td className="text-right">
                                            <Link
                                                href={show(project.id).url}
                                                className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
                                                aria-label={`Open ${project.name}`}
                                            >
                                                <span>Manage</span>
                                                <ArrowRight className="size-3.5" />
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </AppLayout>
    );
}

/** Where the projects are: this computer or one of the dev boxes. Tabs for a few, a menu for many. */
function LocationSwitch({
    devBoxes,
    box,
}: {
    devBoxes: string[];
    box: string | null;
}) {
    const go = (name: string | null) =>
        router.get(index(name ? { query: { box: name } } : undefined).url);

    if (devBoxes.length > 3) {
        return (
            <div className="mb-4 inline-flex items-center gap-2 rounded-xl bg-surface px-3 py-1.5 ring-1 ring-line ring-inset">
                {box ? (
                    <Server className="size-4 text-soft" />
                ) : (
                    <Laptop className="size-4 text-soft" />
                )}
                <select
                    value={box ?? ''}
                    onChange={(event) => go(event.target.value || null)}
                    aria-label="Where the projects are"
                    className="bg-transparent text-sm font-medium outline-none"
                >
                    <option value="">This computer</option>
                    <optgroup label="Dev boxes">
                        {devBoxes.map((name) => (
                            <option key={name} value={name}>
                                {name}
                            </option>
                        ))}
                    </optgroup>
                </select>
            </div>
        );
    }

    const options = [
        { name: null, label: 'This computer', Icon: Laptop },
        ...devBoxes.map((name) => ({ name, label: name, Icon: Server })),
    ];

    return (
        <div
            className="mb-4 inline-flex flex-wrap gap-1 rounded-xl bg-surface p-1 ring-1 ring-line ring-inset"
            role="tablist"
            aria-label="Where the projects are"
        >
            {options.map(({ name, label, Icon }) => (
                <Link
                    key={name ?? 'local'}
                    href={
                        index(name ? { query: { box: name } } : undefined).url
                    }
                    role="tab"
                    aria-selected={box === name}
                    className={cn(
                        'inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium transition',
                        box === name
                            ? 'bg-ink text-white'
                            : 'text-soft hover:bg-paper hover:text-ink',
                    )}
                >
                    <Icon className="size-4" />
                    <span>{label}</span>
                </Link>
            ))}
        </div>
    );
}

/** The apps on one dev box, as the box reports them, in the same table or cards as the local list. */
function BoxProjectList({
    box,
    projects,
    viewMode,
}: {
    box: string;
    projects?: DevBoxProject[] | null;
    viewMode: ViewMode;
}) {
    if (projects == null) {
        return (
            <p className="rounded-2xl bg-surface px-8 py-10 text-center text-sm text-soft ring-1 ring-line ring-inset">
                {box} did not answer, so its projects can&apos;t be listed now.
                Check the box is running, then reload.
            </p>
        );
    }

    if (projects.length === 0) {
        return (
            <div className="rounded-2xl bg-surface px-8 py-14 text-center ring-1 ring-line ring-inset">
                <p className="text-lg font-semibold tracking-[-0.015em]">
                    No projects on {box} yet
                </p>
                <p className="mx-auto mt-1.5 max-w-sm text-sm text-soft">
                    Create one with New project. Apps outside ~/projects on the
                    box are not listed.
                </p>
            </div>
        );
    }

    const status = (project: DevBoxProject): [string, Tone] =>
        project.local === 'running' ? ['Running', 'ok'] : ['Stopped', 'muted'];

    if (viewMode === 'cards') {
        return (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
                {projects.map((project) => (
                    <div
                        key={project.path}
                        className="rounded-xl bg-surface p-4 ring-1 ring-line transition-all ring-inset hover:ring-faint"
                    >
                        <Link href={showDevBox({ box }).url} className="block">
                            <div className="flex items-center justify-between gap-3">
                                <span className="truncate text-sm font-semibold">
                                    {project.name}
                                </span>
                                <StatusPill tone={status(project)[1]}>
                                    {status(project)[0]}
                                </StatusPill>
                            </div>
                            <p className="mt-1 text-xs text-soft">
                                {project.framework ?? 'Unknown framework'}
                            </p>
                            <p className="mt-2 truncate font-mono text-[11px] text-faint">
                                {project.path}
                            </p>
                        </Link>
                        <div className="mt-3 border-t border-line pt-3">
                            <BoxProjectActions box={box} project={project} />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-2xl bg-surface px-5.5 ring-1 ring-line ring-inset">
            <table className="w-full text-left text-sm">
                <thead>
                    <tr className="text-[11px] tracking-[0.06em] text-soft uppercase">
                        {[
                            'Name',
                            'Framework',
                            'Host / Path',
                            'Server',
                            'Status',
                            'Quick actions',
                            '',
                        ].map((heading) => (
                            <th key={heading} className="py-3 font-medium">
                                {heading}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {projects.map((project) => (
                        <tr key={project.path} className="border-t border-line">
                            <td className="py-3.5 font-medium">
                                <Link
                                    href={
                                        showBoxProject({
                                            box,
                                            project: project.name,
                                        }).url
                                    }
                                    className="font-semibold hover:underline"
                                >
                                    {project.name}
                                </Link>
                            </td>
                            <td className="text-soft">
                                <StatusPill tone="muted">
                                    {project.framework ?? 'Unknown'}
                                </StatusPill>
                            </td>
                            <td className="max-w-[220px] truncate font-mono text-[12px] text-soft">
                                {project.environments[0]?.host ?? project.path}
                            </td>
                            <td className="font-mono text-[12px] text-soft">
                                <Link
                                    href={showDevBox({ box }).url}
                                    className="hover:text-ink hover:underline"
                                >
                                    {box}
                                </Link>
                            </td>
                            <td>
                                <StatusPill tone={status(project)[1]}>
                                    {status(project)[0]}
                                </StatusPill>
                            </td>
                            <td className="py-2">
                                <BoxProjectActions
                                    box={box}
                                    project={project}
                                />
                            </td>
                            <td className="text-right">
                                <Link
                                    href={
                                        showBoxProject({
                                            box,
                                            project: project.name,
                                        }).url
                                    }
                                    className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
                                    aria-label={`Open ${project.name}`}
                                >
                                    <span>Manage</span>
                                    <ArrowRight className="size-3.5" />
                                </Link>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/** A missing folder is explained by its create run: still going, failed, or gone. */
function projectStatus(project: Project): [string, Tone] {
    if (!project.exists) {
        if (project.scaffoldStatus === 'running') return ['Creating…', 'busy'];
        if (
            project.scaffoldStatus === 'failed' ||
            project.scaffoldStatus === 'cancelled'
        )
            return ["Couldn't be created", 'bad'];
        return ['Folder missing', 'bad'];
    }

    if (project.webHost && project.serverIp) return ['Ready to deploy', 'ok'];
    if (project.initialized) return ['Needs a server', 'warn'];
    return ['Not set up', 'muted'];
}
