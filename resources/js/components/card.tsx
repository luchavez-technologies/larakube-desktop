import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const tones = {
    default: 'bg-surface ring-line',
    danger: 'bg-surface ring-accent-line',
    error: 'bg-accent-tint ring-accent-line',
    warn: 'bg-warn-tint ring-warn-line',
} as const;

const labelTones = {
    default: 'text-soft',
    danger: 'text-accent',
    error: 'text-accent',
    warn: 'text-warn',
} as const;

export default function Card({
    label,
    action,
    tone = 'default',
    className,
    children,
}: {
    label?: string;
    action?: ReactNode;
    tone?: keyof typeof tones;
    className?: string;
    children: ReactNode;
}) {
    return (
        <section
            className={cn(
                'rounded-2xl px-5.5 py-4 ring-1 ring-inset',
                tones[tone],
                className,
            )}
        >
            {(label || action) && (
                <div className="mb-2 flex items-center justify-between gap-3">
                    {label ? (
                        <h2
                            className={cn(
                                'text-[11px] font-medium tracking-[0.06em] uppercase',
                                labelTones[tone],
                            )}
                        >
                            {label}
                        </h2>
                    ) : (
                        <div />
                    )}
                    {action}
                </div>
            )}
            {children}
        </section>
    );
}
