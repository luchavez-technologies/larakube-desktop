import { Form } from '@inertiajs/react';
import { useState } from 'react';
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
import Button from '@/components/button';
import Card from '@/components/card';
import { brandIcon } from '@/components/tool-logo';
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
    categoryIcon: Icon,
    option,
    onRequestAdd,
}: {
    categoryIcon: LucideIcon;
    option: PlexServiceOptionDetail;
    onRequestAdd: (option: PlexServiceOptionDetail) => void;
}) {
    const mark = brandIcon(option.driver);

    if (option.enabled) {
        return (
            <span
                className="inline-flex items-center gap-1 rounded-md bg-ok-tint px-2 py-0.5 text-xs font-semibold text-ok ring-1 ring-ok/30 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-500/30"
                title={`Active: ${option.label}`}
            >
                <Check className="size-3 text-ok dark:text-emerald-400" />
                {mark}
                {option.label}
            </span>
        );
    }

    if (!option.ready) {
        return (
            <span
                className="inline-flex items-center gap-1 rounded-md bg-badge/70 px-2 py-0.5 text-xs text-soft opacity-60 ring-1 ring-line/50 grayscale"
                title={`${option.label} isn't wired up yet — coming soon`}
            >
                {mark ?? <Icon className="size-3 text-soft" />}
                {option.label}
            </span>
        );
    }

    return (
        <button
            type="button"
            onClick={() => onRequestAdd(option)}
            className="inline-flex items-center gap-1 rounded-md bg-badge/70 px-2 py-0.5 text-xs text-soft ring-1 ring-line/50 transition hover:bg-badge hover:text-ink"
            title={`Add ${option.label} to this Commons`}
        >
            <Plus className="size-3" />
            {mark}
            {option.label}
        </button>
    );
}

function AddServiceConfirmDialog({
    server,
    option,
    onCancel,
}: {
    server: string;
    option: PlexServiceOptionDetail;
    onCancel: () => void;
}) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-6"
            onClick={onCancel}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-[440px] rounded-2xl bg-surface p-7 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <h2 className="text-xl font-semibold tracking-[-0.02em]">
                    Add {option.label} to this Commons?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-soft">
                    Deploys a new shared {option.label} instance that runs
                    continuously for every tenant on this server — extra CPU,
                    memory, and disk, on top of what&apos;s already running.
                    Worth checking the server has room, especially on a smaller
                    instance.
                </p>
                <div className="mt-5 flex justify-end gap-2.5">
                    <Button variant="secondary" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Form action={addService(server).url} method="post">
                        <input
                            type="hidden"
                            name="driver"
                            value={option.driver}
                        />
                        <Button type="submit" variant="primary">
                            <Plus className="h-4 w-4" />
                            Add {option.label}
                        </Button>
                    </Form>
                </div>
            </div>
        </div>
    );
}

function ServiceCategoryRow({
    category,
    onRequestAdd,
}: {
    category: PlexServiceCategoryDetail;
    onRequestAdd: (option: PlexServiceOptionDetail) => void;
}) {
    const Icon = CATEGORY_ICON[category.key] ?? Database;
    // plex:init --services= is additive — a category can legitimately have
    // more than one engine active at once (e.g. Postgres AND MySQL running
    // side by side). Show every active one's details, not just the first.
    const activeOptions = category.options.filter((option) => option.enabled);

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
                            categoryIcon={Icon}
                            option={option}
                            onRequestAdd={onRequestAdd}
                        />
                    ))}
                </div>
            </div>
            {activeOptions.some((option) => option.details.length > 0) && (
                <div className="mt-1.5 space-y-0.5 pl-[7.5rem] text-[11px] text-soft">
                    {activeOptions
                        .filter((option) => option.details.length > 0)
                        .map((option) => (
                            <div
                                key={option.driver}
                                className="flex flex-wrap gap-x-4 gap-y-0.5"
                            >
                                {activeOptions.length > 1 && (
                                    <span className="font-medium text-ink">
                                        {option.label}:
                                    </span>
                                )}
                                {option.details.map((row) => (
                                    <span key={row.label}>
                                        {row.label}:{' '}
                                        <span className="font-mono text-ink">
                                            {row.value ?? '••••••••'}
                                        </span>
                                    </span>
                                ))}
                            </div>
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
    const [pendingAdd, setPendingAdd] =
        useState<PlexServiceOptionDetail | null>(null);

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
                            category={category}
                            onRequestAdd={setPendingAdd}
                        />
                    ))}
                </div>
            )}
            {pendingAdd && (
                <AddServiceConfirmDialog
                    server={server}
                    option={pendingAdd}
                    onCancel={() => setPendingAdd(null)}
                />
            )}
        </Card>
    );
}
