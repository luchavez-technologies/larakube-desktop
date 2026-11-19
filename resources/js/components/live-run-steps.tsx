import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';
import { parseRunSteps } from '@/lib/run-steps';
import { cn } from '@/lib/utils';

/**
 * A live checklist of the steps an install's log has announced (the CLI's `▸` lines): every step
 * before the last is done; the last is in progress while the run runs, done when it succeeded, and
 * where it stopped when it failed.
 */
export default function LiveRunSteps({
    output,
    status,
}: {
    output: string;
    status: string;
}) {
    const steps = parseRunSteps(output);

    if (steps.length === 0) {
        return status === 'running' ? (
            <p className="flex items-center gap-2 text-xs text-soft">
                <Loader2 className="size-3.5 animate-spin" />
                <span>Starting…</span>
            </p>
        ) : null;
    }

    return (
        <ol className="space-y-1.5" aria-label="Install progress">
            {steps.map((step, index) => {
                const last = index === steps.length - 1;
                const state = !last
                    ? 'done'
                    : status === 'running'
                      ? 'busy'
                      : status === 'succeeded'
                        ? 'done'
                        : 'failed';

                return (
                    <li
                        key={`${index}-${step}`}
                        className={cn(
                            'flex items-start gap-2 text-xs',
                            state === 'busy'
                                ? 'font-medium text-ink'
                                : 'text-soft',
                            state === 'failed' && 'text-accent',
                        )}
                    >
                        {state === 'done' && (
                            <CheckCircle2 className="mt-px size-3.5 shrink-0 text-ok" />
                        )}
                        {state === 'busy' && (
                            <Loader2 className="mt-px size-3.5 shrink-0 animate-spin text-brand" />
                        )}
                        {state === 'failed' && (
                            <XCircle className="mt-px size-3.5 shrink-0 text-accent" />
                        )}
                        <span>{step}</span>
                    </li>
                );
            })}
            {status === 'running' && (
                <li className="flex items-start gap-2 text-xs text-faint">
                    <Circle className="mt-px size-3.5 shrink-0" />
                    <span>More steps follow as the install goes on</span>
                </li>
            )}
        </ol>
    );
}
