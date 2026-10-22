import { useState, useEffect } from 'react';
import { Deferred, Link, router, usePage, usePoll } from '@inertiajs/react';
import {
    ChevronRight,
    Database,
    ExternalLink,
    Folder,
    FolderPlus,
    FolderTree,
    GitBranch,
    Globe,
    HardDrive,
    Laptop,
    Plus,
    RotateCw,
    Server,
    Zap,
} from 'lucide-react';
import { buttonClass } from '@/components/button';
import CopyButton from '@/components/copy-button';
import AssignGroupModal from '@/components/assign-group-modal';
import ProjectGroupCombobox from '@/components/project-group-combobox';
import ProjectGroupSection from '@/components/project-group-section';
import CloneModal from '@/components/clone-modal';
import ProviderLogo from '@/components/provider-logo';
import FrameworkLogo, {
    FrameworkBadge,
    resolveFrameworkLabel,
} from '@/components/framework-logo';
import PageHeader from '@/components/page-header';
import ProjectActions from '@/components/project-actions';
import SelectMenu from '@/components/select-menu';
import StatusPill from '@/components/status-pill';
import type { Tone } from '@/components/status-pill';
import QrCodePopover from '@/components/qr-code-popover';
import ViewToggle, { type ViewMode } from '@/components/view-toggle';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import { show as showDevBox } from '@/routes/devboxes';
import { show as showBoxProject } from '@/routes/devboxes/projects';
import { create, index, show, store } from '@/routes/projects';
import { show as showServer } from '@/routes/servers';
import EditorMenu from '@/components/editor-menu';
import BoxProjectActions from '@/components/box-project-actions';
import type { DevBoxProject, Editor, Project } from '@/types/larakube';

export default function ProjectsIndex({
    projects,
    hasActiveRuns = false,
    devBoxes,
    box = null,
    boxProjects,
    defaultParent = '',
    editors = [],
    defaultEditor,
}: {
    projects: Project[];
    hasActiveRuns?: boolean;
    devBoxes?: string[];
    box?: string | null;
    boxProjects?: DevBoxProject[] | null;
    defaultParent?: string;
    editors?: Editor[];
    defaultEditor?: string;
}) {
    const { errors } = usePage().props as { errors: Record<string, string> };

    // Follow a running up, down, start or stop until it finishes.
    usePoll(
        2000,
        { only: ['projects', 'hasActiveRuns'] },
        { autoStart: hasActiveRuns, keepAlive: false },
    );
    const [viewMode, setViewMode] = useState<ViewMode>('cards');
    const [isCloneOpen, setIsCloneOpen] = useState(false);
    const [isAddingFolder, setIsAddingFolder] = useState(false);
    const [selectedProjectForGroup, setSelectedProjectForGroup] =
        useState<Project | null>(null);
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

    // Extract unique existing groups
    const existingGroups = Array.from(
        new Set(
            projects
                .map((p) => p.group)
                .filter((g): g is string => Boolean(g && g.trim() !== '')),
        ),
    );

    const handleUpdateProjectGroup = (
        projectId: number,
        group: string | null,
    ) => {
        router.post(
            `/projects/${projectId}/group`,
            { group },
            { preserveScroll: true },
        );
    };

    const handleRenameGroup = (oldName: string, newName: string) => {
        const inGroup = projects.filter((p) => p.group === oldName);
        for (const p of inGroup) {
            router.post(
                `/projects/${p.id}/group`,
                { group: newName },
                { preserveScroll: true },
            );
        }
    };

    const handleDropOnCard = (draggedId: number, targetProject: Project) => {
        if (draggedId === targetProject.id) return;
        if (targetProject.group) {
            handleUpdateProjectGroup(draggedId, targetProject.group);
        } else {
            const newGroup = targetProject.name;
            handleUpdateProjectGroup(targetProject.id, newGroup);
            handleUpdateProjectGroup(draggedId, newGroup);
        }
    };

    // Grouping
    const grouped = new Map<string, Project[]>();
    const ungrouped: Project[] = [];

    for (const project of projects) {
        if (project.group && project.group.trim() !== '') {
            const list = grouped.get(project.group) ?? [];
            list.push(project);
            grouped.set(project.group, list);
        } else {
            ungrouped.push(project);
        }
    }

    const handleAddFolder = () => {
        if (isAddingFolder) return;
        setIsAddingFolder(true);
        router.post(
            store().url,
            {},
            {
                onError: () => setIsAddingFolder(false),
                onFinish: () => setIsAddingFolder(false),
            },
        );
    };

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
                            <button
                                type="button"
                                onClick={handleAddFolder}
                                disabled={isAddingFolder}
                                className={buttonClass('secondary')}
                            >
                                <FolderPlus className="size-4" />
                                <span>
                                    {isAddingFolder
                                        ? 'Adding…'
                                        : 'Add existing folder'}
                                </span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setIsCloneOpen(true)}
                            className={buttonClass('secondary')}
                        >
                            <GitBranch className="size-4" />
                            <span>Clone repository</span>
                        </button>
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
                /* Card View: Groups + Standalone */
                <div className="space-y-6">
                    {/* Render Group Sections */}
                    {Array.from(grouped.entries()).map(
                        ([groupName, groupProjects]) => (
                            <ProjectGroupSection
                                key={groupName}
                                group={groupName}
                                projects={groupProjects}
                                onRenameGroup={handleRenameGroup}
                                onDropProject={handleUpdateProjectGroup}
                                renderCard={(project) => (
                                    <ProjectCard
                                        key={project.id}
                                        project={project}
                                        editors={editors}
                                        defaultEditor={defaultEditor}
                                        existingGroups={existingGroups}
                                        onDropOnCard={handleDropOnCard}
                                        onUpdateGroup={handleUpdateProjectGroup}
                                        onOpenGroupModal={(p) => {
                                            setSelectedProjectForGroup(p);
                                            setIsGroupModalOpen(true);
                                        }}
                                    />
                                )}
                            />
                        ),
                    )}

                    {/* Standalone Codebases Grid */}
                    {ungrouped.length > 0 && (
                        <div>
                            {grouped.size > 0 && (
                                <div className="mb-3 flex items-center justify-between">
                                    <h3 className="text-sm font-semibold tracking-[-0.01em] text-soft">
                                        Standalone Codebases
                                    </h3>
                                    <span className="text-xs text-faint">
                                        Drag onto another card or group to link
                                        them
                                    </span>
                                </div>
                            )}
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
                                {ungrouped.map((project) => (
                                    <ProjectCard
                                        key={project.id}
                                        project={project}
                                        editors={editors}
                                        defaultEditor={defaultEditor}
                                        existingGroups={existingGroups}
                                        onDropOnCard={handleDropOnCard}
                                        onUpdateGroup={handleUpdateProjectGroup}
                                        onOpenGroupModal={(p) => {
                                            setSelectedProjectForGroup(p);
                                            setIsGroupModalOpen(true);
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* Table View */
                <div className="overflow-x-auto rounded-2xl bg-surface px-5.5 ring-1 ring-line ring-inset">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="text-[11px] tracking-[0.06em] text-soft uppercase">
                                {[
                                    'Name',
                                    'Group',
                                    'Framework',
                                    'Host',
                                    'IDE / Agent',
                                    '',
                                ].map((heading, i) => (
                                    <th
                                        key={heading}
                                        className={cn(
                                            'py-3 font-medium whitespace-nowrap',
                                            i === 0 ? 'pr-3 pl-0' : 'px-3',
                                            heading === '' &&
                                                'pr-0 pl-3 text-right',
                                        )}
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
                                const serverTarget =
                                    project.serverName ?? project.serverIp;
                                const serverDisplay =
                                    project.serverName ?? project.serverIp;

                                return (
                                    <tr
                                        key={project.id}
                                        className="border-t border-line"
                                    >
                                        <td className="py-3.5 pr-3 pl-0 font-medium">
                                            <div className="flex max-w-[320px] min-w-0 flex-col gap-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <Link
                                                        href={
                                                            show(project.id).url
                                                        }
                                                        className="truncate font-semibold hover:underline"
                                                        title={project.name}
                                                    >
                                                        {project.name}
                                                    </Link>
                                                    {statusLabel ===
                                                    'Running' ? (
                                                        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                                                            <span className="relative flex size-1.5">
                                                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                                                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                                                            </span>
                                                            Running
                                                        </span>
                                                    ) : statusTone ===
                                                      'busy' ? (
                                                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
                                                            <RotateCw className="size-2.5 animate-spin" />
                                                            {statusLabel}
                                                        </span>
                                                    ) : (
                                                        <StatusPill
                                                            tone={statusTone}
                                                            className="shrink-0 px-2 py-0.5 text-[11px]"
                                                        >
                                                            {statusLabel}
                                                        </StatusPill>
                                                    )}
                                                </div>
                                                <div className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-faint">
                                                    <Folder className="size-3 shrink-0 text-faint" />
                                                    <span
                                                        className="truncate font-mono"
                                                        title={project.path}
                                                    >
                                                        {project.path}
                                                    </span>
                                                    <CopyButton
                                                        value={project.path}
                                                        label=""
                                                        copiedLabel=""
                                                        size="xs"
                                                        variant="ghost"
                                                        className="h-5 w-5 shrink-0 p-0 text-faint hover:text-ink"
                                                        title="Copy path"
                                                    />
                                                </div>
                                                {project.exists &&
                                                    project.initialized && (
                                                        <div className="pt-1">
                                                            <ProjectActions
                                                                project={
                                                                    project
                                                                }
                                                            />
                                                        </div>
                                                    )}
                                            </div>
                                        </td>
                                        <td className="px-3 py-3.5 whitespace-nowrap">
                                            <ProjectGroupCombobox
                                                project={project}
                                                existingGroups={existingGroups}
                                                onAssign={
                                                    handleUpdateProjectGroup
                                                }
                                            />
                                        </td>
                                        <td className="px-3 py-3.5 whitespace-nowrap">
                                            <FrameworkBadge slug={framework} />
                                        </td>
                                        <td className="max-w-[260px] px-3 py-3.5 font-mono text-[12px] text-soft">
                                            {project.webHost ||
                                            serverDisplay ? (
                                                <div className="flex max-w-[240px] min-w-0 flex-col gap-0.5">
                                                    {project.webHost ? (
                                                        <div className="flex min-w-0 items-center justify-between gap-1.5">
                                                            <div className="flex min-w-0 items-center gap-1.5 truncate">
                                                                <Globe className="size-3 shrink-0 text-brand" />
                                                                <a
                                                                    href={`https://${project.webHost}`}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="truncate hover:text-brand hover:underline"
                                                                    title={`https://${project.webHost}`}
                                                                >
                                                                    https://
                                                                    {
                                                                        project.webHost
                                                                    }
                                                                </a>
                                                            </div>
                                                            <QrCodePopover
                                                                url={`https://${project.webHost}`}
                                                                title={
                                                                    project.name
                                                                }
                                                                description="Scan with your phone to preview your project"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-faint">
                                                            —
                                                        </span>
                                                    )}
                                                    {serverDisplay ? (
                                                        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-soft">
                                                            <ProviderLogo
                                                                provider={
                                                                    project.serverProvider
                                                                }
                                                                size="xs"
                                                                className="size-4.5 shrink-0 rounded p-0.5 [&_svg]:size-3"
                                                            />
                                                            {serverTarget ? (
                                                                <Link
                                                                    href={
                                                                        showServer(
                                                                            serverTarget,
                                                                        ).url
                                                                    }
                                                                    className="truncate text-soft hover:text-brand hover:underline"
                                                                    title={
                                                                        project.serverName
                                                                            ? `Server: ${project.serverName}`
                                                                            : `Server: ${project.serverIp}`
                                                                    }
                                                                >
                                                                    {
                                                                        serverDisplay
                                                                    }
                                                                </Link>
                                                            ) : (
                                                                <span className="truncate">
                                                                    {
                                                                        serverDisplay
                                                                    }
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-faint">
                                                    —
                                                </span>
                                            )}
                                        </td>

                                        <td className="px-3 py-2 whitespace-nowrap">
                                            {project.exists ? (
                                                <EditorMenu
                                                    project={project}
                                                    editors={editors}
                                                    defaultEditor={
                                                        defaultEditor
                                                    }
                                                    compact
                                                    showFullLabel
                                                />
                                            ) : (
                                                <span className="text-xs text-faint">
                                                    —
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-3.5 pr-0 pl-3 text-right whitespace-nowrap">
                                            <Link
                                                href={show(project.id).url}
                                                className="inline-flex p-1 text-faint transition-colors hover:text-ink"
                                                aria-label={`Open ${project.name}`}
                                            >
                                                <ChevronRight className="size-4" />
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            <CloneModal
                isOpen={isCloneOpen}
                onClose={() => setIsCloneOpen(false)}
                devBoxes={devBoxes}
                initialBox={box}
                defaultParent={defaultParent}
            />
            <AssignGroupModal
                project={selectedProjectForGroup}
                isOpen={isGroupModalOpen}
                onClose={() => {
                    setIsGroupModalOpen(false);
                    setSelectedProjectForGroup(null);
                }}
                existingGroups={existingGroups}
                onAssign={handleUpdateProjectGroup}
            />
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
                <SelectMenu
                    value={box ?? ''}
                    aria-label="Where the projects are"
                    triggerClassName="h-7 bg-transparent px-1 ring-0 hover:ring-0"
                    onChange={(value) => go(value || null)}
                    options={[
                        { value: '', label: 'This computer' },
                        ...devBoxes.map((name) => ({
                            value: name,
                            label: name,
                            group: 'Dev boxes',
                        })),
                    ]}
                />
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
                            ? 'bg-ink text-surface shadow-xs'
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

    if (viewMode === 'cards') {
        return (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
                {projects.map((project) => (
                    <BoxProjectCard
                        key={project.path}
                        box={box}
                        project={project}
                    />
                ))}
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-2xl bg-surface px-5.5 ring-1 ring-line ring-inset">
            <table className="w-full text-left text-sm">
                <thead>
                    <tr className="text-[11px] tracking-[0.06em] text-soft uppercase">
                        {['Name', 'Framework', 'Host', 'Quick actions', ''].map(
                            (heading, i) => (
                                <th
                                    key={heading}
                                    className={cn(
                                        'py-3 font-medium whitespace-nowrap',
                                        i === 0 ? 'pr-3 pl-0' : 'px-3',
                                        heading === '' &&
                                            'pr-0 pl-3 text-right',
                                    )}
                                >
                                    {heading}
                                </th>
                            ),
                        )}
                    </tr>
                </thead>
                <tbody>
                    {projects.map((project) => {
                        const host = project.environments[0]?.host;
                        return (
                            <tr
                                key={project.path}
                                className="border-t border-line"
                            >
                                <td className="py-3.5 pr-3 pl-0 font-medium">
                                    <div className="flex max-w-[280px] min-w-0 flex-col gap-0.5">
                                        <div className="flex items-center justify-between gap-2">
                                            <Link
                                                href={
                                                    showBoxProject({
                                                        box,
                                                        project: project.name,
                                                    }).url
                                                }
                                                className="truncate font-semibold hover:underline"
                                                title={project.name}
                                            >
                                                {project.name}
                                            </Link>
                                            <StatusPill
                                                tone={
                                                    boxProjectStatus(project)[1]
                                                }
                                                className="shrink-0 px-2 py-0.5 text-[11px]"
                                            >
                                                {boxProjectStatus(project)[0]}
                                            </StatusPill>
                                        </div>
                                        <div className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-faint">
                                            <Folder className="size-3 shrink-0 text-faint" />
                                            <span
                                                className="truncate font-mono"
                                                title={project.path}
                                            >
                                                {project.path}
                                            </span>
                                            <CopyButton
                                                value={project.path}
                                                label=""
                                                copiedLabel=""
                                                size="xs"
                                                variant="ghost"
                                                className="h-5 w-5 shrink-0 p-0 text-faint hover:text-ink"
                                                title="Copy path"
                                            />
                                        </div>
                                    </div>
                                </td>
                                <td className="px-3 py-3.5 whitespace-nowrap">
                                    <FrameworkBadge slug={project.framework} />
                                </td>
                                <td className="max-w-[260px] px-3 py-3.5 font-mono text-[12px] text-soft">
                                    <div className="flex max-w-[240px] min-w-0 flex-col gap-0.5">
                                        {host ? (
                                            <div className="flex min-w-0 items-center gap-1.5">
                                                <Globe className="size-3 shrink-0 text-brand" />
                                                <span
                                                    className="truncate font-mono"
                                                    title={host}
                                                >
                                                    {host}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-faint">
                                                —
                                            </span>
                                        )}
                                        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-soft">
                                            <ProviderLogo
                                                provider="vps"
                                                size="xs"
                                                className="size-4.5 shrink-0 rounded p-0.5 [&_svg]:size-3"
                                            />
                                            <Link
                                                href={showDevBox({ box }).url}
                                                className="truncate text-soft hover:text-brand hover:underline"
                                                title={`Dev Box: ${box}`}
                                            >
                                                {box}
                                            </Link>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                    <BoxProjectActions
                                        box={box}
                                        project={project}
                                    />
                                </td>
                                <td className="py-3.5 pr-0 pl-3 text-right whitespace-nowrap">
                                    <Link
                                        href={
                                            showBoxProject({
                                                box,
                                                project: project.name,
                                            }).url
                                        }
                                        className="inline-flex p-1 text-faint transition-colors hover:text-ink"
                                        aria-label={`Open ${project.name}`}
                                    >
                                        <ChevronRight className="size-4" />
                                    </Link>
                                </td>
                            </tr>
                        );
                    })}
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
        return ['Missing', 'bad'];
    }

    if (project.localStatus) {
        if (project.localStatus.state === 'running') return ['Running', 'ok'];
        if (
            project.localStatus.state === 'starting' ||
            project.localStatus.state === 'stopping'
        ) {
            return [project.localStatus.label, 'busy'];
        }
        if (
            project.localStatus.state === 'paused' ||
            project.localStatus.state === 'down' ||
            project.localStatus.state === 'uninitialized'
        ) {
            return ['Paused', 'muted'];
        }
    }

    return ['Paused', 'muted'];
}

function boxProjectStatus(project: DevBoxProject): [string, Tone] {
    return project.local === 'running'
        ? ['Running', 'ok']
        : ['Paused', 'muted'];
}

function ProjectCard({
    project,
    editors,
    defaultEditor,
    existingGroups = [],
    onDropOnCard,
    onUpdateGroup,
    onOpenGroupModal,
}: {
    project: Project;
    editors?: Editor[];
    defaultEditor?: string;
    existingGroups?: string[];
    onDropOnCard?: (draggedId: number, targetProject: Project) => void;
    onUpdateGroup?: (projectId: number, group: string | null) => void;
    onOpenGroupModal?: (project: Project) => void;
}) {
    const [statusLabel, statusTone] = projectStatus(project);
    const [isDragOver, setIsDragOver] = useState(false);
    const frameworkSlug =
        project.framework ?? project.detectedFramework ?? 'code';
    const effectiveHost =
        project.webHost ||
        project.localStatus?.domain ||
        project.environments?.local?.webHost;
    const isRunning =
        project.localStatus?.state === 'running' || statusLabel === 'Running';
    const isBusy = statusTone === 'busy';

    return (
        <div
            draggable={true}
            onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', String(project.id));
                e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragOver(false);
                const rawId = e.dataTransfer.getData('text/plain');
                if (rawId && Number(rawId) !== project.id) {
                    onDropOnCard?.(Number(rawId), project);
                }
            }}
            className={cn(
                // An open IDE menu (<details open>) or group combobox (data-open) lifts the
                // whole card above its neighbours: the hover transform makes each card its
                // own stacking context, so a z-index on the dropdown alone can't escape it.
                'group relative flex cursor-grab flex-col justify-between rounded-2xl bg-surface p-5 shadow-2xs ring-1 ring-line transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-faint active:cursor-grabbing has-[[data-open=true]]:z-40 has-[details[open]]:z-40',
                isDragOver &&
                    'bg-brand/5 shadow-md ring-2 ring-brand ring-offset-2',
            )}
        >
            <div>
                {/* Header: Framework Logo, Project Name, and Status */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-paper/60 p-2 shadow-2xs ring-1 ring-line/60 transition-transform group-hover:scale-105">
                            <FrameworkLogo slug={frameworkSlug} size="md" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5 truncate">
                                <Link
                                    href={show(project.id).url}
                                    className="block truncate text-base font-semibold text-ink transition-colors group-hover:text-brand"
                                >
                                    {project.name}
                                </Link>
                                {project.group && (
                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand ring-1 ring-brand/20">
                                        <FolderTree className="size-2.5" />
                                        <span className="max-w-[80px] truncate">
                                            {project.group}
                                        </span>
                                    </span>
                                )}
                            </div>
                            <span className="block truncate text-xs text-soft">
                                {resolveFrameworkLabel(frameworkSlug)}
                            </span>
                        </div>
                    </div>

                    {isRunning ? (
                        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                            <span className="relative flex size-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                            </span>
                            Running
                        </span>
                    ) : isBusy ? (
                        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
                            <RotateCw className="size-3 animate-spin" />
                            {statusLabel}
                        </span>
                    ) : (
                        <StatusPill tone={statusTone} className="shrink-0">
                            {statusLabel}
                        </StatusPill>
                    )}
                </div>

                {/* Host Preview Strip */}
                {effectiveHost ? (
                    <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-paper/60 px-3 py-2 ring-1 ring-line/60 transition group-hover:bg-paper/80">
                        <div className="flex min-w-0 items-center gap-2 truncate font-mono text-xs font-medium text-ink">
                            <Globe className="size-3.5 shrink-0 text-brand" />
                            <a
                                href={`https://${effectiveHost}`}
                                target="_blank"
                                rel="noreferrer"
                                className="truncate hover:text-brand hover:underline"
                                title={`Open https://${effectiveHost}`}
                            >
                                https://{effectiveHost}
                            </a>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            <QrCodePopover
                                url={`https://${effectiveHost}`}
                                title={project.name}
                                description="Scan with your phone to preview your project"
                            />
                            <a
                                href={`https://${effectiveHost}`}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded p-1 text-soft transition hover:bg-surface hover:text-ink"
                                title="Open in browser"
                            >
                                <ExternalLink className="size-3.5" />
                            </a>
                        </div>
                    </div>
                ) : null}

                {/* Path and Git Repo */}
                <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                    <div className="flex min-w-0 items-center gap-1.5 truncate font-mono text-[11px] text-faint">
                        <Folder className="size-3.5 shrink-0 text-faint" />
                        <span className="truncate" title={project.path}>
                            {project.path}
                        </span>
                        <CopyButton
                            value={project.path}
                            label=""
                            copiedLabel=""
                            size="xs"
                            variant="ghost"
                            className="h-5 w-5 shrink-0 p-0 text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink"
                            title="Copy path"
                        />
                    </div>
                    {project.git?.repoSlug && (
                        <span
                            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-paper px-1.5 py-0.5 font-mono text-[10px] text-soft ring-1 ring-line/50"
                            title={`Repository: ${project.git.repoSlug}`}
                        >
                            <GitBranch className="size-2.5 text-soft" />
                            <span className="max-w-[110px] truncate">
                                {project.git.repoSlug}
                            </span>
                        </span>
                    )}
                </div>

                {/* Server info if assigned */}
                {(project.serverName || project.serverIp) && (
                    <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-soft">
                        <ProviderLogo
                            provider={project.serverProvider}
                            size="xs"
                            className="size-4 shrink-0 rounded p-0.5 [&_svg]:size-2.5"
                        />
                        <Link
                            href={
                                showServer(
                                    project.serverName ??
                                        project.serverIp ??
                                        '',
                                ).url
                            }
                            className="truncate font-mono text-[11px] text-soft hover:text-brand hover:underline"
                            title={
                                project.serverName
                                    ? `Server: ${project.serverName}`
                                    : `Server: ${project.serverIp}`
                            }
                        >
                            {project.serverName ?? project.serverIp}
                        </Link>
                    </div>
                )}

                {/* Backing Services Chips */}
                {(project.database ||
                    project.cacheDriver ||
                    project.objectStorage) && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {project.database && (
                            <span
                                className="inline-flex items-center gap-1 rounded-md bg-paper px-2 py-0.5 text-[11px] font-medium text-soft capitalize ring-1 ring-line/50"
                                title={`Database: ${project.database}`}
                            >
                                <Database className="size-3 text-faint" />
                                {project.database}
                            </span>
                        )}
                        {project.cacheDriver && (
                            <span
                                className="inline-flex items-center gap-1 rounded-md bg-paper px-2 py-0.5 text-[11px] font-medium text-soft capitalize ring-1 ring-line/50"
                                title={`Cache: ${project.cacheDriver}`}
                            >
                                <Zap className="size-3 text-faint" />
                                {project.cacheDriver}
                            </span>
                        )}
                        {project.objectStorage && (
                            <span
                                className="inline-flex items-center gap-1 rounded-md bg-paper px-2 py-0.5 text-[11px] font-medium text-soft capitalize ring-1 ring-line/50"
                                title={`Storage: ${project.objectStorage}`}
                            >
                                <HardDrive className="size-3 text-faint" />
                                {project.objectStorage}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Footer: Quick Actions + Group Button + Manage Link */}
            <div className="mt-4 flex items-center justify-between border-t border-line/70 pt-3">
                <div className="flex items-center gap-1.5">
                    {project.exists && project.initialized ? (
                        <ProjectActions project={project} compact />
                    ) : (
                        <span className="text-[11px] text-soft">
                            {!project.exists
                                ? 'Folder missing'
                                : 'Setup needed'}
                        </span>
                    )}
                    {project.exists && (
                        <EditorMenu
                            project={project}
                            editors={editors}
                            defaultEditor={defaultEditor}
                            compact
                            align="left"
                        />
                    )}
                    {onUpdateGroup ? (
                        <ProjectGroupCombobox
                            project={project}
                            existingGroups={existingGroups}
                            onAssign={onUpdateGroup}
                            variant="icon"
                            align="left"
                        />
                    ) : onOpenGroupModal ? (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onOpenGroupModal(project);
                            }}
                            className="rounded-lg p-1.5 text-soft transition hover:bg-paper hover:text-ink"
                            title={
                                project.group
                                    ? `Group: ${project.group} (Click to change)`
                                    : 'Assign to project group'
                            }
                        >
                            <FolderTree className="size-3.5" />
                        </button>
                    ) : null}
                </div>
                <Link
                    href={show(project.id).url}
                    className="ml-auto inline-flex shrink-0 rounded-lg p-1 text-faint transition-colors hover:bg-paper hover:text-ink"
                    aria-label={`Open ${project.name}`}
                >
                    <ChevronRight className="size-4" />
                </Link>
            </div>
        </div>
    );
}

function BoxProjectCard({
    box,
    project,
}: {
    box: string;
    project: DevBoxProject;
}) {
    const isRunning = project.local === 'running';
    const frameworkSlug = project.framework ?? 'code';
    const host = project.environments?.[0]?.host;

    return (
        <div className="group relative flex flex-col justify-between rounded-2xl bg-surface p-5 shadow-2xs ring-1 ring-line transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-faint">
            <div>
                {/* Header: Framework Logo, Project Name, and Status */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-paper/60 p-2 shadow-2xs ring-1 ring-line/60 transition-transform group-hover:scale-105">
                            <FrameworkLogo slug={frameworkSlug} size="md" />
                        </div>
                        <div className="min-w-0">
                            <Link
                                href={
                                    showBoxProject({
                                        box,
                                        project: project.name,
                                    }).url
                                }
                                className="block truncate text-base font-semibold text-ink transition-colors group-hover:text-brand"
                            >
                                {project.name}
                            </Link>
                            <span className="block truncate text-xs text-soft">
                                {resolveFrameworkLabel(frameworkSlug)}
                            </span>
                        </div>
                    </div>

                    {isRunning ? (
                        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                            <span className="relative flex size-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                            </span>
                            Running
                        </span>
                    ) : (
                        <StatusPill tone="muted" className="shrink-0">
                            Stopped
                        </StatusPill>
                    )}
                </div>

                {/* Host Preview Strip */}
                {host ? (
                    <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-paper/60 px-3 py-2 ring-1 ring-line/60 transition group-hover:bg-paper/80">
                        <div className="flex min-w-0 items-center gap-2 truncate font-mono text-xs font-medium text-ink">
                            <Globe className="size-3.5 shrink-0 text-brand" />
                            <a
                                href={`https://${host}`}
                                target="_blank"
                                rel="noreferrer"
                                className="truncate hover:text-brand hover:underline"
                                title={`Open https://${host}`}
                            >
                                https://{host}
                            </a>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            <QrCodePopover
                                url={`https://${host}`}
                                title={project.name}
                                description="Scan with your phone to preview your project"
                            />
                            <a
                                href={`https://${host}`}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded p-1 text-soft transition hover:bg-surface hover:text-ink"
                                title="Open in browser"
                            >
                                <ExternalLink className="size-3.5" />
                            </a>
                        </div>
                    </div>
                ) : null}

                {/* Path and Dev Box info */}
                <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                    <div className="flex min-w-0 items-center gap-1.5 truncate font-mono text-[11px] text-faint">
                        <Folder className="size-3.5 shrink-0 text-faint" />
                        <span className="truncate" title={project.path}>
                            {project.path}
                        </span>
                        <CopyButton
                            value={project.path}
                            label=""
                            copiedLabel=""
                            size="xs"
                            variant="ghost"
                            className="h-5 w-5 shrink-0 p-0 text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink"
                            title="Copy path"
                        />
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-paper px-1.5 py-0.5 font-mono text-[10px] text-soft ring-1 ring-line/50">
                        <Server className="size-2.5 text-soft" />
                        <span>{box}</span>
                    </span>
                </div>
            </div>

            {/* Footer: Quick Actions + Manage Link */}
            <div className="mt-4 flex items-center justify-between border-t border-line/70 pt-3">
                <BoxProjectActions box={box} project={project} compact />
                <Link
                    href={
                        showBoxProject({
                            box,
                            project: project.name,
                        }).url
                    }
                    className="ml-auto inline-flex shrink-0 rounded-lg p-1 text-faint transition-colors hover:bg-paper hover:text-ink"
                    aria-label={`Open ${project.name}`}
                >
                    <ChevronRight className="size-4" />
                </Link>
            </div>
        </div>
    );
}
