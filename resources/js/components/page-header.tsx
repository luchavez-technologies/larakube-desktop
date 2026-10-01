import type { ReactNode } from 'react';

export default function PageHeader({
    title,
    subtitle,
    badge,
    meta,
    actions,
}: {
    title: ReactNode;
    subtitle?: string;
    badge?: ReactNode;
    meta?: ReactNode;
    actions?: ReactNode;
}) {
    return (
        <header className="mb-5 flex items-center justify-between gap-6">
            <div className="min-w-0">
                <div className="flex items-center gap-3">
                    <h1 className="truncate text-[28px] leading-tight font-semibold tracking-[-0.03em]">
                        {title}
                    </h1>
                    {badge}
                </div>
                {subtitle && (
                    <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-soft">
                        {subtitle}
                    </p>
                )}
                {meta && (
                    <div className="mt-2 flex flex-wrap items-center gap-4 font-mono text-xs text-soft">
                        {meta}
                    </div>
                )}
            </div>
            {actions && (
                <div className="flex shrink-0 items-center gap-2.5">
                    {actions}
                </div>
            )}
        </header>
    );
}
