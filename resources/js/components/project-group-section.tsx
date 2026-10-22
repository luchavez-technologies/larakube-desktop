import { useState, type ReactNode } from 'react';
import { router } from '@inertiajs/react';
import {
    ArrowUpCircle,
    Check,
    Copy,
    Edit2,
    FolderTree,
    Play,
    PowerOff,
    RotateCw,
    Square,
    X,
} from 'lucide-react';
import { buttonClass } from '@/components/button';
import { cn } from '@/lib/utils';
import type { Project } from '@/types/larakube';

type GroupAction = 'up' | 'start' | 'stop' | 'down';

export default function ProjectGroupSection({
    group,
    projects,
    onRenameGroup,
    onDropProject,
    renderCard,
}: {
    group: string;
    projects: Project[];
    onRenameGroup: (oldName: string, newName: string) => void;
    onDropProject: (projectId: number, targetGroup: string) => void;
    renderCard: (project: Project) => ReactNode;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(group);
    const [isDragOver, setIsDragOver] = useState(false);
    const [copiedHost, setCopiedHost] = useState<string | null>(null);
    const [pendingAction, setPendingAction] = useState<GroupAction | null>(
        null,
    );

    const handleSaveName = () => {
        const trimmed = name.trim();
        if (trimmed && trimmed !== group) {
            onRenameGroup(group, trimmed);
        } else {
            setName(group);
        }
        setIsEditing(false);
    };

    const handleCopyHost = (host: string) => {
        const url = `https://${host}`;
        void navigator.clipboard.writeText(url);
        setCopiedHost(host);
        window.setTimeout(() => setCopiedHost(null), 2000);
    };

    const anyRunning = projects.some((p) => p.localStatus?.state === 'running');

    const runGroupAction = (action: GroupAction) => {
        if (
            action === 'down' &&
            !window.confirm(
                `Take down all ${projects.length} codebases in "${group}"? Their data is kept.`,
            )
        ) {
            return;
        }

        setPendingAction(action);
        router.post(
            `/projects/groups/${encodeURIComponent(group)}/${action}`,
            {},
            {
                preserveScroll: true,
                onFinish: () => setPendingAction(null),
            },
        );
    };

    const groupActions: {
        key: GroupAction;
        label: string;
        hint: string;
        icon: typeof Play;
    }[] = [
        {
            key: 'up',
            label: anyRunning ? 'Rebuild all' : 'Bring all up',
            hint: anyRunning
                ? `Rebuild and restart every codebase in ${group} (larakube up)`
                : `Build and start every codebase in ${group} (larakube up)`,
            icon: ArrowUpCircle,
        },
        {
            key: 'start',
            label: 'Start all',
            hint: `Resume every paused codebase in ${group}`,
            icon: Play,
        },
        {
            key: 'stop',
            label: 'Stop all',
            hint: `Pause every codebase in ${group} to save CPU & RAM`,
            icon: Square,
        },
        {
            key: 'down',
            label: 'Take all down',
            hint: `Tear down every codebase in ${group} (data is kept)`,
            icon: PowerOff,
        },
    ];

    // Filter projects with an active or resolved web domain
    const domainsWithProjects = projects.filter((p) => {
        const host =
            p.webHost ||
            p.localStatus?.domain ||
            p.environments?.local?.webHost;
        return Boolean(host);
    });

    return (
        <section
            onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                const rawId = e.dataTransfer.getData('text/plain');
                if (rawId) {
                    onDropProject(Number(rawId), group);
                }
            }}
            className={cn(
                // backdrop-blur creates a stacking context; lift the section while a card menu inside is open.
                'group/section relative mb-8 rounded-3xl bg-surface/70 p-5 ring-1 ring-line/80 backdrop-blur-xs transition-all duration-200 has-[[data-open=true]]:z-40 has-[details[open]]:z-40',
                isDragOver
                    ? 'bg-brand/5 shadow-md ring-2 ring-brand'
                    : 'hover:ring-faint',
            )}
        >
            {/* Header: Title, Controls, and Partner Domain Chips */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-line/60 pb-4">
                <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand ring-1 ring-brand/20">
                        <FolderTree className="size-5" />
                    </div>

                    {isEditing ? (
                        <div className="flex items-center gap-1.5">
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveName();
                                    if (e.key === 'Escape') {
                                        setName(group);
                                        setIsEditing(false);
                                    }
                                }}
                                autoFocus
                                className="h-8 rounded-lg bg-surface px-2.5 text-base font-semibold text-ink ring-1 ring-brand outline-none"
                            />
                            <button
                                type="button"
                                onClick={handleSaveName}
                                className="rounded-md p-1.5 text-soft hover:bg-surface hover:text-ink"
                                title="Save name"
                            >
                                <Check className="size-4 text-emerald-500" />
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setName(group);
                                    setIsEditing(false);
                                }}
                                className="rounded-md p-1.5 text-soft hover:bg-surface hover:text-ink"
                                title="Cancel"
                            >
                                <X className="size-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-semibold tracking-[-0.015em] text-ink">
                                {group}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setIsEditing(true)}
                                className="rounded p-1 text-faint opacity-0 transition group-hover/section:opacity-100 hover:bg-surface hover:text-ink"
                                title="Rename project group"
                            >
                                <Edit2 className="size-3.5" />
                            </button>
                            <span className="rounded-full bg-badge px-2 py-0.5 text-xs font-medium text-soft ring-1 ring-line/50">
                                {projects.length}{' '}
                                {projects.length === 1
                                    ? 'codebase'
                                    : 'codebases'}
                            </span>
                        </div>
                    )}
                </div>

                {/* Right: Group Lifecycle Actions */}
                <div className="flex flex-wrap items-center gap-2">
                    {groupActions.map(({ key, label, hint, icon: Icon }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => runGroupAction(key)}
                            disabled={pendingAction !== null}
                            className={buttonClass(
                                key === 'down' ? 'danger' : 'secondary',
                                'sm',
                            )}
                            title={hint}
                        >
                            {pendingAction === key ? (
                                <RotateCw className="size-3.5 animate-spin" />
                            ) : (
                                <Icon className="size-3.5" />
                            )}
                            <span>{label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Partner Domain Helper Chips */}
            {domainsWithProjects.length > 1 && (
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-paper/50 px-3.5 py-2 ring-1 ring-line/50">
                    <span className="text-[11px] font-medium tracking-wider text-faint uppercase">
                        Partner URLs:
                    </span>
                    {domainsWithProjects.map((p) => {
                        const host =
                            p.webHost ||
                            p.localStatus?.domain ||
                            p.environments?.local?.webHost;
                        if (!host) return null;
                        const isCopied = copiedHost === host;

                        return (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => handleCopyHost(host)}
                                className="group/chip inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1 font-mono text-xs text-soft ring-1 ring-line/60 transition hover:bg-surface hover:text-ink hover:ring-brand/50"
                                title={`Click to copy https://${host} for .env`}
                            >
                                <span className="font-sans font-medium text-faint">
                                    {p.name}:
                                </span>
                                <span className="max-w-[180px] truncate">
                                    {host}
                                </span>
                                {isCopied ? (
                                    <Check className="size-3 text-emerald-500" />
                                ) : (
                                    <Copy className="size-3 text-faint group-hover/chip:text-brand" />
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Grid of Grouped Project Cards */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
                {projects.map((project) => renderCard(project))}
            </div>
        </section>
    );
}
