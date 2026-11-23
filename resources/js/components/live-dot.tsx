import { cn } from '@/lib/utils';

/**
 * A "something is running" dot: a solid dot with a pulse ringing out of it.
 * The box is twice the dot's size so the pulse stays inside it and is never
 * cut off by a parent that hides overflow (a truncated label, a select).
 */
export default function LiveDot({
    size = 'md',
    className,
}: {
    size?: 'sm' | 'md';
    className?: string;
}) {
    const dot = size === 'sm' ? 'size-1.5' : 'size-2';

    return (
        <span
            aria-hidden="true"
            className={cn(
                'relative inline-flex shrink-0 items-center justify-center',
                size === 'sm' ? 'size-3' : 'size-4',
                className,
            )}
        >
            <span
                className={cn(
                    'absolute animate-ping rounded-full bg-brand opacity-75',
                    dot,
                )}
            />
            <span className={cn('relative rounded-full bg-brand', dot)} />
        </span>
    );
}
