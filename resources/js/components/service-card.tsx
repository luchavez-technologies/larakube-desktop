import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The card for something that runs on a cluster: a Commons engine, a dev
 * companion. One frame so they all read the same way:
 *
 * - header: logo, name, kind, status, and a line under the name;
 * - body: what the card is about (gauges, a description);
 * - info panel: where it runs (its image, its addresses);
 * - footer: links on the left, actions on the right, always at the bottom,
 *   so cards in a row line up whatever their content.
 */
export default function ServiceCard({
    logo,
    title,
    tag,
    subtitle,
    status,
    badge,
    info,
    links,
    actions,
    highlighted = false,
    className,
    children,
}: {
    logo: ReactNode;
    title: ReactNode;
    /** Its kind, e.g. "Database". */
    tag?: ReactNode;
    /** One line under the name, e.g. "12 databases". */
    subtitle?: ReactNode;
    /** A status pill: Active, Paused, Available… */
    status?: ReactNode;
    /** Extra context under the name, e.g. "Matches project PostgreSQL". */
    badge?: ReactNode;
    /** Rows for the inset panel: the image, addresses. Empty rows are dropped. */
    info?: ReactNode[];
    links?: ReactNode;
    actions?: ReactNode;
    /** A tinted frame for something running that wants attention. */
    highlighted?: boolean;
    className?: string;
    children?: ReactNode;
}) {
    const rows = (info ?? []).filter(Boolean);

    return (
        <section
            className={cn(
                'flex h-full flex-col rounded-2xl p-5 ring-1 transition ring-inset',
                highlighted
                    ? 'bg-emerald-500/5 ring-emerald-500/30'
                    : 'bg-surface ring-line hover:ring-brand/40',
                className,
            )}
        >
            <div className="flex-1">
                <header className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center">
                            {logo}
                        </span>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <h3 className="text-sm font-semibold text-ink">
                                    {title}
                                </h3>
                                {tag && (
                                    <span className="rounded bg-paper px-1.5 py-0.5 text-[10px] font-medium tracking-wider text-soft uppercase ring-1 ring-line/60">
                                        {tag}
                                    </span>
                                )}
                            </div>
                            {subtitle && (
                                <p className="mt-0.5 text-xs text-soft">
                                    {subtitle}
                                </p>
                            )}
                        </div>
                    </div>
                    {status && <div className="shrink-0">{status}</div>}
                </header>

                {badge && <div className="mt-2.5">{badge}</div>}

                {children && <div className="mt-4">{children}</div>}

                {rows.length > 0 && (
                    <div className="mt-4 space-y-2 rounded-xl bg-paper/60 p-3 ring-1 ring-line/70">
                        {rows.map((row, index) => (
                            <div key={index} className="min-w-0">
                                {row}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {(links || actions) && (
                <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3">
                    <div className="flex flex-wrap items-center gap-1">
                        {links}
                    </div>
                    <div className="ml-auto flex flex-wrap items-center gap-1.5">
                        {actions}
                    </div>
                </footer>
            )}
        </section>
    );
}
