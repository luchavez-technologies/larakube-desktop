import type { ReactNode } from 'react';
import Card from '@/components/card';
import { cn } from '@/lib/utils';
import type { BackingService, BackingServices } from '@/types/larakube';

const MODE_LABEL: Record<BackingService['mode'], string> = {
    commons: 'Plex Commons',
    managed: 'Cloud managed',
    pod: 'Own pod',
    file: 'Local file',
    none: 'Not used',
};

/**
 * Where a project's or a tool's database, cache and storage run, and how it
 * reaches them. `footer` holds what only that page can do: reveal secrets and
 * join or leave the Commons for a project, a note for a tool.
 */
export default function BackingServicesCard({
    label,
    services,
    hasCommons,
    footer,
}: {
    label: string;
    /** undefined while loading, null when it could not be read. */
    services?: BackingServices | null;
    hasCommons: boolean;
    footer?: ReactNode;
}) {
    return (
        <Card
            label={label}
            action={
                hasCommons ? (
                    <span className="inline-flex items-center gap-1 rounded bg-tools-tint px-2 py-0.5 font-mono text-[11px] font-medium text-tools ring-1 ring-tools/20">
                        🟣 Plex Commons Active
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-line/60 px-2 py-0.5 font-mono text-[11px] text-soft">
                        Standalone Services
                    </span>
                )
            }
        >
            <div className="space-y-4">
                {services === undefined ? (
                    <div className="h-32 animate-pulse rounded-xl bg-paper" />
                ) : services === null ? (
                    <p className="text-xs text-warn">
                        This LaraKube CLI can&apos;t describe the services yet.
                        Update it from Setup.
                    </p>
                ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {services.services.map((service) => (
                            <div
                                key={service.kind}
                                className="rounded-xl border border-line bg-paper/60 p-3"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <span className="text-[11px] font-medium tracking-wider text-soft uppercase">
                                            {service.label}
                                        </span>
                                        <div className="mt-1 text-xs font-semibold text-ink">
                                            {service.name ?? 'None'}
                                        </div>
                                    </div>
                                    <span
                                        className={cn(
                                            'shrink-0 rounded px-2 py-0.5 font-mono text-[11px] ring-1 ring-inset',
                                            service.mode === 'commons'
                                                ? 'bg-tools-tint text-tools ring-tools/20'
                                                : 'bg-paper text-soft ring-line',
                                        )}
                                    >
                                        {MODE_LABEL[service.mode]}
                                    </span>
                                </div>
                                {service.details.length > 0 && (
                                    <dl className="mt-3 space-y-1 text-[11px]">
                                        {service.details.map((row) => (
                                            <div
                                                key={row.label}
                                                className="flex justify-between gap-3"
                                            >
                                                <dt className="shrink-0 text-soft">
                                                    {row.label}
                                                </dt>
                                                <dd className="min-w-0 truncate font-mono text-ink">
                                                    {row.value ?? '••••••••'}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                )}
                            </div>
                        ))}
                    </div>
                )}
                {footer}
            </div>
        </Card>
    );
}
