import { Link } from '@inertiajs/react';
import {
    Check,
    Database,
    FileImage,
    HardDrive,
    Plus,
    Search,
    Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Card from '@/components/card';
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
    categoryIcon: Icon,
    option,
}: {
    server: string;
    categoryIcon: LucideIcon;
    option: PlexServiceOptionDetail;
}) {
    if (option.enabled) {
        return (
            <span
                className="inline-flex items-center gap-1 rounded-md bg-ok-tint px-2 py-0.5 text-xs font-semibold text-ok ring-1 ring-ok/30 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-500/30"
                title={`Active: ${option.label}`}
            >
                <Check className="size-3 text-ok dark:text-emerald-400" />
                {option.label}
            </span>
        );
    }

    if (!option.ready) {
        return (
            <span
                className="inline-flex items-center gap-1 rounded-md bg-badge/70 px-2 py-0.5 text-xs text-soft ring-1 ring-line/50"
                title={`${option.label} isn't wired up yet — coming soon`}
            >
                <Icon className="size-3 text-soft" />
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
            className="inline-flex items-center gap-1 rounded-md bg-badge/70 px-2 py-0.5 text-xs text-soft ring-1 ring-line/50 transition hover:bg-badge hover:text-ink"
            title={`Add ${option.label} to this Commons`}
        >
            <Plus className="size-3" />
            {option.label}
        </Link>
    );
}

function ServiceCategoryRow({
    server,
    category,
}: {
    server: string;
    category: PlexServiceCategoryDetail;
}) {
    const Icon = CATEGORY_ICON[category.key] ?? Database;
    const active = category.options.find((option) => option.enabled);

    return (
        <div className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="w-28 shrink-0 text-xs font-medium text-soft">
                    {category.label}
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                    {category.options.map((option) => (
                        <ServiceOptionPill
                            key={option.driver}
                            server={server}
                            categoryIcon={Icon}
                            option={option}
                        />
                    ))}
                </div>
            </div>
            {active && active.details.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 pl-[7.5rem] text-[11px] text-soft">
                    {active.details.map((row) => (
                        <span key={row.label}>
                            {row.label}:{' '}
                            <span className="font-mono text-ink">
                                {row.value ?? '••••••••'}
                            </span>
                        </span>
                    ))}
                </div>
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
                <div className="divide-y divide-line">
                    {services.categories.map((category) => (
                        <ServiceCategoryRow
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
