import { router } from '@inertiajs/react';
import { ArrowUpCircle, Play, PowerOff, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { down, start, stop, up } from '@/routes/projects';
import type { Project } from '@/types/larakube';

/**
 * The four things done to a project's local cluster, as quick buttons for a
 * list: Up builds and starts it, Start resumes a stopped one, Stop pauses it,
 * Down takes it down (its data is kept). Each mirrors what the project page runs.
 */
export default function ProjectActions({
    project,
    className,
    compact = false,
}: {
    project: Project;
    className?: string;
    compact?: boolean;
}) {
    if (!project.exists || !project.initialized) {
        return null;
    }

    const state = project.localStatus?.state;
    const busy = project.activeRun?.status === 'running';

    const canUp = !busy;
    const canStart =
        !busy &&
        (state === undefined || state === 'paused' || state === 'down');
    const canStop =
        !busy &&
        (state === undefined || state === 'running' || state === 'starting');
    const canDown = !busy && state !== 'down';

    const actions = [
        {
            key: 'up',
            label: state === 'running' ? 'Rebuild' : 'Up',
            hint:
                state === 'running'
                    ? 'Re-orchestrate and restart containers on local cluster (larakube up)'
                    : 'Build and start local cluster workloads (larakube up)',
            icon: ArrowUpCircle,
            url: up(project.id).url,
            enabled: canUp,
            hoverClass: 'hover:text-brand',
        },
        {
            key: 'start',
            label: 'Start',
            hint:
                state === 'running'
                    ? 'Workloads are already running'
                    : state === 'down'
                      ? 'Project is down. Run Up first.'
                      : 'Resume paused workloads (larakube start)',
            icon: Play,
            url: start(project.id).url,
            enabled: canStart,
            hoverClass: 'hover:text-emerald-500',
        },
        {
            key: 'stop',
            label: 'Stop',
            hint:
                state === 'paused'
                    ? 'Workloads are already stopped'
                    : state === 'down'
                      ? 'Project is down'
                      : 'Pause workloads to save CPU & RAM (larakube stop)',
            icon: Square,
            url: stop(project.id).url,
            enabled: canStop,
            hoverClass: 'hover:text-amber-500',
        },
        {
            key: 'down',
            label: 'Down',
            hint:
                state === 'down'
                    ? 'Local cluster environment is already down'
                    : 'Tear down local Kubernetes pods and services (larakube down)',
            icon: PowerOff,
            url: down(project.id).url,
            enabled: canDown,
            hoverClass: 'hover:text-rose-500',
        },
    ];

    return (
        <div
            className={cn('flex items-center gap-1', className)}
            role="group"
            aria-label={`Quick actions for ${project.name}`}
        >
            {actions.map(
                ({
                    key,
                    label,
                    hint,
                    icon: Icon,
                    url,
                    enabled,
                    hoverClass,
                }) => (
                    <button
                        key={key}
                        type="button"
                        disabled={busy || !enabled}
                        title={
                            busy
                                ? 'Another action is still running'
                                : `${label}: ${hint}`
                        }
                        aria-label={`${label} ${project.name}`}
                        onClick={() =>
                            router.post(
                                url,
                                { environment: 'local' },
                                { preserveScroll: true, preserveState: true },
                            )
                        }
                        className={cn(
                            'inline-flex h-7 items-center rounded-md text-[11px] font-medium text-soft ring-1 ring-line transition ring-inset',
                            'hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:opacity-40',
                            enabled && hoverClass,
                            compact
                                ? 'size-7 justify-center p-0'
                                : 'gap-1 px-2',
                        )}
                    >
                        <Icon className="size-3.5" />
                        {!compact && <span>{label}</span>}
                    </button>
                ),
            )}
        </div>
    );
}
