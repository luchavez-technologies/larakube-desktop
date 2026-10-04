import { useState, useEffect } from 'react';
import { Deferred, Link, usePage, usePoll } from '@inertiajs/react';
import { FolderPlus, Plus, ArrowRight, Server } from 'lucide-react';
import { buttonClass } from '@/components/button';
import PageHeader from '@/components/page-header';
import ProjectActions from '@/components/project-actions';
import StatusPill from '@/components/status-pill';
import type { Tone } from '@/components/status-pill';
import ViewToggle, { type ViewMode } from '@/components/view-toggle';
import AppLayout from '@/layouts/app-layout';
import { show as showDevBox } from '@/routes/devboxes';
import { create, show, store } from '@/routes/projects';
import type { DevBoxProject, Project } from '@/types/larakube';

export default function ProjectsIndex({
    projects,
    hasActiveRuns = false,
    devBoxProjects,
}: {
    projects: Project[];
    hasActiveRuns?: boolean;
    devBoxProjects?: (DevBoxProject & { box: string })[];
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
                        <Link
                            href={store().url}
                            method="post"
                            as="button"
                            className={buttonClass('secondary')}
                        >
                            <FolderPlus className="size-4" />
                            <span>Add existing folder</span>
                        </Link>
                        <Link
                            href={create().url}
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
            {projects.length === 0 ? (
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
            <Deferred data="devBoxProjects" fallback={<></>}>
                {devBoxProjects && devBoxProjects.length > 0 ? (
                    <DevBoxProjects projects={devBoxProjects} />
                ) : null}
            </Deferred>
        </AppLayout>
    );
}

/** The apps that live on dev boxes, each opening its box. */
function DevBoxProjects({
    projects,
}: {
    projects: (DevBoxProject & { box: string })[];
}) {
    return (
        <div className="mt-8">
            <p className="mb-2.5 text-[13px] font-semibold text-ink">
                On dev boxes
            </p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
                {projects.map((project) => (
                    <Link
                        key={`${project.box}/${project.name}`}
                        href={showDevBox({ box: project.box }).url}
                        className="block rounded-xl bg-surface p-4 ring-1 ring-line transition-all ring-inset hover:ring-faint"
                    >
                        <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-sm font-semibold">
                                {project.name}
                            </span>
                            <StatusPill
                                tone={
                                    project.local === 'running' ? 'ok' : 'muted'
                                }
                            >
                                {project.local === 'running'
                                    ? 'Running'
                                    : 'Stopped'}
                            </StatusPill>
                        </div>
                        <p className="mt-1 text-xs text-soft">
                            {project.framework ?? 'Unknown framework'}
                        </p>
                        <p className="mt-2 flex items-center gap-1.5 truncate font-mono text-[11px] text-faint">
                            <Server className="size-3" />
                            <span>{project.box}</span>
                        </p>
                    </Link>
                ))}
            </div>
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
