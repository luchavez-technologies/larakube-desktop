import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function ListRow({
    children,
    action,
    stack = false,
    className,
}: {
    children: ReactNode;
    action?: ReactNode;
    /** Puts the action row below the content instead of beside it, so a long value (a kubectl context, an SSH command) doesn't get squeezed and truncated. */
    stack?: boolean;
    className?: string;
}) {
    if (stack) {
        return (
            <div
                className={cn(
                    'border-t border-line py-2.5 first-of-type:border-t-0',
                    className,
                )}
            >
                <div className="min-w-0">{children}</div>
                {action && (
                    <div className="mt-2 flex items-center gap-2.5">
                        {action}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div
            className={cn(
                'flex items-center justify-between gap-4 border-t border-line py-2.5 first-of-type:border-t-0',
                className,
            )}
        >
            <div className="min-w-0">{children}</div>
            {action && (
                <div className="flex shrink-0 items-center gap-2.5">
                    {action}
                </div>
            )}
        </div>
    );
}

export function TwoLine({
    title,
    detail,
    mono = false,
    truncate = true,
}: {
    title: ReactNode;
    detail?: ReactNode;
    mono?: boolean;
    /** Set false to let a long value (a kubectl context, an SSH command) wrap instead of being cut off with an ellipsis. */
    truncate?: boolean;
}) {
    return (
        <>
            <div className="text-sm font-medium">{title}</div>
            {detail && (
                <div
                    className={cn(
                        'text-xs text-soft',
                        truncate ? 'truncate' : 'break-all',
                        mono && 'font-mono',
                    )}
                >
                    {detail}
                </div>
            )}
        </>
    );
}
