import { cn } from '@/lib/utils';
import type { RunStatus } from '@/types/larakube';

/**
 * cloud:create's phases, each marked done when its closing CLI message shows up
 * in the log. Matches log text, so it degrades to "unknown progress" rather than
 * breaking if a message changes.
 */
const STEPS: { label: string; done: RegExp }[] = [
    { label: 'Provision', done: /Apply complete!/ },
    { label: 'Wait for SSH', done: /SSH is up/ },
    { label: 'Harden', done: /Hardened:/ },
    { label: 'Install k3s', done: /K3s installed\.|k3s is ready\./ },
    { label: 'Kubeconfig', done: /Kubeconfig synced/ },
    { label: 'Traefik', done: /Traefik deployed|Traefik is already installed/ },
];

export default function RunSteps({
    output,
    status,
}: {
    output: string;
    status: RunStatus;
}) {
    const doneCount =
        status === 'succeeded'
            ? STEPS.length
            : STEPS.findIndex((step) => !step.done.test(output));
    const reached = doneCount === -1 ? STEPS.length : doneCount;
    const currentState = {
        running: 'busy',
        failed: 'bad',
        cancelled: 'cancel',
        succeeded: 'done',
    }[status];

    return (
        <ol className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-surface px-4.5 py-3.5 ring-1 ring-line ring-inset">
            {STEPS.map((step, index) => {
                const state =
                    index < reached
                        ? 'done'
                        : index === reached
                          ? currentState
                          : 'todo';

                return (
                    <li key={step.label} className="flex items-center gap-2">
                        <span
                            className={cn(
                                'flex size-5.5 items-center justify-center rounded-full text-[11px] font-semibold',
                                state === 'done' && 'bg-ok text-white',
                                state === 'busy' && 'bg-busy-tint text-busy',
                                state === 'bad' && 'bg-accent text-white',
                                state === 'cancel' && 'bg-warn-tint text-warn',
                                state === 'todo' && 'bg-badge text-faint',
                            )}
                        >
                            {state === 'done'
                                ? '✓'
                                : state === 'bad'
                                  ? '!'
                                  : state === 'cancel'
                                    ? '■'
                                    : index + 1}
                        </span>
                        <span
                            className={cn(
                                'text-[13px] font-medium',
                                state === 'todo' ? 'text-faint' : 'text-ink',
                            )}
                        >
                            {step.label}
                        </span>
                        {index < STEPS.length - 1 && (
                            <span className="ml-1 h-px w-4.5 bg-line" />
                        )}
                    </li>
                );
            })}
        </ol>
    );
}
