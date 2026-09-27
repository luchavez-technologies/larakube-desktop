import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function ListRow({
    children,
    action,
}: {
    children: ReactNode;
    action?: ReactNode;
}) {
    return (
        <div className="flex items-center justify-between gap-4 border-t border-line py-2.5 first-of-type:border-t-0">
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
}: {
    title: ReactNode;
    detail?: ReactNode;
    mono?: boolean;
}) {
    return (
        <>
            <div className="text-sm font-medium">{title}</div>
            {detail && (
                <div
                    className={cn(
                        'truncate text-xs text-soft',
                        mono && 'font-mono',
                    )}
                >
                    {detail}
                </div>
            )}
        </>
    );
}
