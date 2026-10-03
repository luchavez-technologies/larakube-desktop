import { router } from '@inertiajs/react';
import { ArrowDownToLine, Pause, Play, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { down, start, stop, up } from '@/routes/projects';
import type { Project } from '@/types/larakube';

/**
 * The four things done to a project's local cluster, as quick buttons for a
 * list: Up builds and starts it, Start resumes a stopped one, Stop pauses it,
 * Down takes it down (its data is kept). Each is what the project page runs.
 */
export default function ProjectActions({ project }: { project: Project }) {
    if (!project.exists || !project.initialized) {
        return null;
    }

    const state = project.localStatus?.state;
    const busy = project.activeRun?.status === 'running';
    const actions = [
        {
            key: 'up',
            label: 'Up',
            hint: 'Build and start it on your local cluster',
            icon: Rocket,
            url: up(project.id).url,
            enabled: true,
        },
        {
            key: 'start',
            label: 'Start',
            hint: 'Start it again after a stop',
            icon: Play,
            url: start(project.id).url,
            enabled:
                state === undefined || state === 'paused' || state === 'down',
        },
        {
            key: 'stop',
            label: 'Stop',
            hint: 'Stop it but keep it ready to start',
            icon: Pause,
            url: stop(project.id).url,
            enabled:
                state === undefined ||
                state === 'running' ||
                state === 'starting',
        },
        {
            key: 'down',
            label: 'Down',
            hint: 'Take it down. Its data is kept.',
            icon: ArrowDownToLine,
            url: down(project.id).url,
            enabled: state !== 'down',
        },
    ];

    return (
        <div
            className="flex items-center gap-1"
            role="group"
            aria-label={`Quick actions for ${project.name}`}
        >
            {actions.map(({ key, label, hint, icon: Icon, url, enabled }) => (
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
                        'inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-soft ring-1 ring-line transition ring-inset',
                        'hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:opacity-40',
                    )}
                >
                    <Icon className="size-3.5" />
                    <span>{label}</span>
                </button>
            ))}
        </div>
    );
}
