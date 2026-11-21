import type { ReactNode } from 'react';

/**
 * Every page's header: title (with its icon and status badges) and a one-line
 * description on the left, the page's own actions on the right. When both don't
 * fit, the actions wrap below instead of squeezing the title.
 */
export default function PageHeader({
    title,
    subtitle,
    icon,
    badge,
    meta,
    actions,
}: {
    title: ReactNode;
    subtitle?: string;
    icon?: ReactNode;
    badge?: ReactNode;
    meta?: ReactNode;
    actions?: ReactNode;
}) {
    return (
        <header className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    {icon}
                    <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] whitespace-nowrap">
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
                <div className="flex flex-wrap items-center gap-2.5">
                    {actions}
                </div>
            )}
        </header>
    );
}
