import { router } from '@inertiajs/react';
import { ArrowDownToLine, Pause, Play, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { operate } from '@/routes/devboxes';
import type { DevBoxProject } from '@/types/larakube';

/** Up, Start, Stop and Down for an app on a dev box, run there over SSH. */
export default function BoxProjectActions({
    box,
    project,
    className,
    compact = false,
}: {
    box: string;
    project: DevBoxProject;
    className?: string;
    compact?: boolean;
}) {
    const running = project.local === 'running';
    const actions = [
        { key: 'up', label: 'Up', Icon: Rocket, enabled: true },
        { key: 'start', label: 'Start', Icon: Play, enabled: !running },
        { key: 'stop', label: 'Stop', Icon: Pause, enabled: running },
        { key: 'down', label: 'Down', Icon: ArrowDownToLine, enabled: true },
    ] as const;

    return (
        <div
            className={cn('flex items-center gap-1', className)}
            role="group"
            aria-label={`Quick actions for ${project.name}`}
        >
            {actions.map(({ key, label, Icon, enabled }) => (
                <button
                    key={key}
                    type="button"
                    disabled={!enabled}
                    title={`${label} ${project.name} on ${box}`}
                    onClick={() =>
                        router.post(
                            operate({ box, project: project.name, action: key })
                                .url,
                        )
                    }
                    className={cn(
                        'inline-flex h-7 items-center rounded-md text-[11px] font-medium text-soft ring-1 ring-line transition ring-inset',
                        'hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:opacity-40',
                        compact ? 'size-7 justify-center p-0' : 'gap-1 px-2',
                    )}
                >
                    <Icon className="size-3.5" />
                    {!compact && <span>{label}</span>}
                </button>
            ))}
        </div>
    );
}
