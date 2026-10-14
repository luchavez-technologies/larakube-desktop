import { Form } from '@inertiajs/react';
import { useState } from 'react';
import { Plus, Server, X } from 'lucide-react';
import Button from '@/components/button';
import { brandIcon } from '@/components/tool-logo';
import { add as addService } from '@/routes/servers/plex/services';
import type {
    PlexCommonsServicesReport,
    PlexServiceOptionDetail,
    Server as ServerType,
} from '@/types/larakube';

export default function PlexAddEngineModal({
    isOpen,
    onClose,
    server,
    services,
}: {
    isOpen: boolean;
    onClose: () => void;
    server: ServerType;
    services?: PlexCommonsServicesReport | null;
}) {
    const [confirmingOption, setConfirmingOption] =
        useState<PlexServiceOptionDetail | null>(null);

    if (!isOpen) return null;

    // Collect all inactive options across all categories
    const categoriesWithAvailable =
        services?.categories
            .map((c) => ({
                ...c,
                availableOptions: c.options.filter((o) => !o.enabled),
            }))
            .filter((c) => c.availableOptions.length > 0) ?? [];

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-6 backdrop-blur-xs"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-[580px] rounded-2xl bg-surface p-7 shadow-2xl ring-1 ring-line"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                            <Plus className="size-5" />
                        </span>
                        <div>
                            <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">
                                Add Backing Engine to Commons
                            </h2>
                            <p className="mt-0.5 text-xs text-soft">
                                Expand this server&apos;s shared infrastructure
                                with secondary engines.
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-faint transition hover:bg-paper hover:text-ink"
                    >
                        <X className="size-5" />
                    </button>
                </div>

                {/* Engine Catalog List */}
                <div className="custom-scrollbar mt-6 max-h-[420px] space-y-5 overflow-y-auto pr-1">
                    {categoriesWithAvailable.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-line p-8 text-center text-xs text-soft">
                            All available Commons engines are already installed
                            on this server!
                        </div>
                    ) : (
                        categoriesWithAvailable.map((category) => (
                            <div key={category.key} className="space-y-2">
                                <h3 className="text-[11px] font-semibold tracking-wider text-soft uppercase">
                                    {category.label}
                                </h3>

                                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                                    {category.availableOptions.map((opt) => {
                                        const mark = brandIcon(opt.driver);

                                        return (
                                            <div
                                                key={opt.driver}
                                                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper/60 p-3 text-xs"
                                            >
                                                <div className="flex min-w-0 items-center gap-2.5">
                                                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface text-ink ring-1 ring-line">
                                                        {mark ?? (
                                                            <Server className="size-4 text-soft" />
                                                        )}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <div className="truncate font-semibold text-ink">
                                                            {opt.label}
                                                        </div>
                                                        <span className="text-[10px] text-soft">
                                                            {opt.ready
                                                                ? 'Ready to install'
                                                                : 'Planned'}
                                                        </span>
                                                    </div>
                                                </div>

                                                {opt.ready ? (
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() =>
                                                            setConfirmingOption(
                                                                opt,
                                                            )
                                                        }
                                                    >
                                                        <Plus className="size-3.5" />
                                                        <span>Add</span>
                                                    </Button>
                                                ) : (
                                                    <span className="text-[10px] font-medium text-faint">
                                                        Coming Soon
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="mt-6 flex justify-end border-t border-line/60 pt-4">
                    <Button variant="secondary" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </div>

            {/* Confirm Dialog */}
            {confirmingOption && (
                <div
                    className="fixed inset-0 z-60 flex items-center justify-center bg-ink/60 p-6 backdrop-blur-xs"
                    onClick={() => setConfirmingOption(null)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        className="w-full max-w-[440px] rounded-2xl bg-surface p-7 shadow-2xl ring-1 ring-line"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">
                            Add {confirmingOption.label}?
                        </h2>
                        <p className="mt-2 text-sm leading-relaxed text-soft">
                            Deploys a new shared {confirmingOption.label}{' '}
                            instance that runs continuously for every tenant on
                            this server — extra CPU, memory, and disk, on top of
                            what&apos;s already running.
                        </p>
                        <div className="mt-6 flex justify-end gap-2.5">
                            <Button
                                variant="secondary"
                                onClick={() => setConfirmingOption(null)}
                            >
                                Cancel
                            </Button>
                            <Form
                                action={addService(server.name).url}
                                method="post"
                            >
                                <input
                                    type="hidden"
                                    name="driver"
                                    value={confirmingOption.driver}
                                />
                                <Button type="submit" variant="primary">
                                    <Plus className="size-4" />
                                    <span>Add {confirmingOption.label}</span>
                                </Button>
                            </Form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
