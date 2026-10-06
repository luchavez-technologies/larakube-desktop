import React from 'react';
import { cn } from '@/lib/utils';

type Props = {
    label: string;
    valueStr: string;
    percentage?: number | null;
    subtext?: string | null;
    className?: string;
};

export default function SegmentedMeter({
    label,
    valueStr,
    percentage = null,
    subtext,
    className = '',
}: Props) {
    const safePct =
        percentage !== null ? Math.min(100, Math.max(0, percentage)) : null;

    const toneColor =
        safePct !== null
            ? safePct >= 85
                ? 'bg-rose-500'
                : safePct >= 70
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
            : 'bg-brand';

    return (
        <div className={cn('flex flex-col gap-1.5', className)}>
            <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-ink">{label}</span>
                <span className="font-mono text-soft">{valueStr}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-line/60">
                <div
                    className={cn(
                        'h-full transition-all duration-500 ease-out',
                        toneColor,
                    )}
                    style={{ width: safePct !== null ? `${safePct}%` : '40%' }}
                />
            </div>
            {subtext && (
                <div className="flex justify-end font-mono text-[10px] text-faint">
                    {subtext}
                </div>
            )}
        </div>
    );
}
