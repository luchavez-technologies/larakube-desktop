import { Link } from '@inertiajs/react';
import {
    Database,
    FileImage,
    HardDrive,
    Plus,
    Search,
    Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Card from '@/components/card';
import ToolLogo from '@/components/tool-logo';
import { cn } from '@/lib/utils';
import type {
    PlexCommonsServicesReport,
    PlexServiceCategoryDetail,
    PlexServiceOptionDetail,
} from '@/types/larakube';
import { add as addService } from '@/routes/servers/plex/services';

const CATEGORY_ICON: Record<string, LucideIcon> = {
    database: Database,
    cache: Zap,
    storage: HardDrive,
    search: Search,
    render: FileImage,
};

function ServiceOptionPill({
    server,
    option,
}: {
    server: string;
    option: PlexServiceOptionDetail;
}) {
    if (option.enabled) {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-ok-tint px-2.5 py-1 text-xs font-semibold text-ok ring-1 ring-ok/30 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-500/30">
                <ToolLogo slug={option.driver} size="sm" />
                {option.label}
            </span>
        );
    }

    if (!option.ready) {
        return (
            <span
                className="inline-flex items-center gap-1.5 rounded-lg bg-badge/50 px-2.5 py-1 text-xs text-faint ring-1 ring-line/40"
                title={`${option.label} isn't wired up yet — coming soon`}
            >
                {option.label}
            </span>
        );
    }

    return (
        <Link
            href={addService(server).url}
            method="post"
            data={{ driver: option.driver }}
            as="button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-paper px-2.5 py-1 text-xs text-soft ring-1 ring-line transition hover:bg-badge hover:text-ink"
            title={`Add ${option.label} to this Commons`}
        >
            <Plus className="size-3.5" />
            {option.label}
        </Link>
    );
}

function ServiceCategorySection({
    server,
    category,
}: {
    server: string;
    category: PlexServiceCategoryDetail;
}) {
    const Icon = CATEGORY_ICON[category.key] ?? Database;
    const active = category.options.find((option) => option.enabled);

    return (
        <div>
            <div className="mb-1.5 flex items-center gap-1.5">
                <Icon className="size-3.5 text-faint" />
                <span className="text-[11px] font-medium tracking-wider text-faint uppercase">
                    {category.label}
                </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                {category.options.map((option) => (
                    <ServiceOptionPill
                        key={option.driver}
                        server={server}
                        option={option}
                    />
                ))}
            </div>
            {active && active.details.length > 0 && (
                <dl className="mt-2 space-y-0.5 text-[11px]">
                    {active.details.map((row) => (
                        <div key={row.label} className="flex gap-2">
                            <dt className="shrink-0 text-soft">{row.label}:</dt>
                            <dd className="min-w-0 truncate font-mono text-ink">
                                {row.value ?? '••••••••'}
                            </dd>
                        </div>
                    ))}
                </dl>
            )}
        </div>
    );
}

export default function PlexCommonsServicesCard({
    server,
    services,
    className,
}: {
    server: string;
    services?: PlexCommonsServicesReport | null;
    className?: string;
}) {
    return (
        <Card label="Commons Services" className={cn(className)}>
            {services === undefined ? (
                <div className="h-32 animate-pulse rounded-xl bg-paper" />
            ) : services === null ? (
                <p className="text-xs text-warn">
                    This LaraKube CLI can&apos;t describe the services yet.
                    Update it from Setup.
                </p>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {services.categories.map((category) => (
                        <ServiceCategorySection
                            key={category.key}
                            server={server}
                            category={category}
                        />
                    ))}
                </div>
            )}
        </Card>
    );
}
