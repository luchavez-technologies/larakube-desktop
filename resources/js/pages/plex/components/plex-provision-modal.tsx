import { Form } from '@inertiajs/react';
import { useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import Button from '@/components/button';
import { cn } from '@/lib/utils';
import { provision } from '@/routes/servers/plex';
import type { PlexCommonsServicesReport, Server } from '@/types/larakube';

const DATABASE_DRIVER_PRIORITY = [
    'mysql',
    'mariadb',
    'postgres',
    'mongodb',
    'sqlite',
];
const STORAGE_DRIVER_PRIORITY = ['seaweedfs', 'minio', 'garage'];

function firstActiveOption(
    services: PlexCommonsServicesReport | null | undefined,
    categoryKey: string,
    priority: string[],
): { driver: string; label: string } | null {
    const options =
        services?.categories.find((c) => c.key === categoryKey)?.options ?? [];
    const enabled = new Map(
        options.filter((o) => o.enabled).map((o) => [o.driver, o.label]),
    );

    for (const driver of priority) {
        const label = enabled.get(driver);
        if (label) {
            return { driver, label };
        }
    }

    return null;
}

export default function PlexProvisionModal({
    isOpen,
    onClose,
    server,
    services,
}: {
    isOpen: boolean;
    onClose: () => void;
    server: Server;
    services?: PlexCommonsServicesReport | null;
}) {
    const [selected, setSelected] = useState<string[]>(['db', 'redis', 's3']);
    const [tenant, setTenant] = useState('');

    if (!isOpen) return null;

    const activeDb = firstActiveOption(
        services,
        'database',
        DATABASE_DRIVER_PRIORITY,
    );
    const activeStorage = firstActiveOption(
        services,
        'storage',
        STORAGE_DRIVER_PRIORITY,
    );
    const redisActive = Boolean(
        services?.categories
            .find((c) => c.key === 'cache')
            ?.options.some((o) => o.enabled && o.driver === 'redis'),
    );

    const toggle = (service: string) => {
        setSelected((current) =>
            current.includes(service)
                ? current.filter((s) => s !== service)
                : [...current, service],
        );
    };

    const rows: {
        service: string;
        label: string;
        available: boolean;
    }[] = [
        {
            service: 'db',
            label: activeDb ? `Database (${activeDb.label})` : 'Database',
            available: activeDb !== null,
        },
        {
            service: 'redis',
            label: 'Valkey / Redis Cache & Queue DB',
            available: redisActive,
        },
        {
            service: 's3',
            label: activeStorage
                ? `Object Storage (${activeStorage.label})`
                : 'Object Storage',
            available: activeStorage !== null,
        },
    ];

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-6 backdrop-blur-xs"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-[500px] rounded-2xl bg-surface p-7 shadow-2xl ring-1 ring-line"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-tools/10 text-tools">
                            <KeyRound className="size-5" />
                        </span>
                        <div>
                            <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">
                                Provision Custom Credentials
                            </h2>
                            <p className="mt-0.5 text-xs text-soft">
                                On-demand backing credentials for external pods
                                or sidecars.
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

                {/* Form */}
                <Form
                    action={provision(server.name).url}
                    method="post"
                    className="mt-6 space-y-4"
                >
                    <div>
                        <label className="block text-xs font-semibold text-ink">
                            Tenant identifier
                        </label>
                        <p className="mt-0.5 text-[11px] text-soft">
                            A unique slug identifying this workload (e.g.{' '}
                            <code className="font-mono">analytics-worker</code>
                            ).
                        </p>
                        <input
                            type="text"
                            name="tenant"
                            value={tenant}
                            onChange={(e) =>
                                setTenant(
                                    e.target.value
                                        .toLowerCase()
                                        .replace(/[^a-z0-9_-]/g, ''),
                                )
                            }
                            placeholder="e.g. analytics-worker"
                            required
                            autoFocus
                            className="placeholder:text-muted mt-2 w-full rounded-lg border border-line bg-paper/60 px-3 py-2 font-mono text-sm text-ink transition outline-none focus:border-brand focus:bg-surface focus:ring-1 focus:ring-brand"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-ink">
                            Requested Services
                        </label>
                        <p className="mt-0.5 text-[11px] text-soft">
                            Select which Commons backends this tenant will
                            receive slices for.
                        </p>

                        <div className="mt-2 space-y-2">
                            {rows.map(({ service, label, available }) => (
                                <label
                                    key={service}
                                    className={cn(
                                        'flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-xs transition',
                                        available
                                            ? selected.includes(service)
                                                ? 'border-brand/60 bg-brand/5 text-ink'
                                                : 'border-line bg-paper/40 text-soft hover:bg-paper'
                                            : 'cursor-not-allowed border-line/40 bg-paper/20 text-faint',
                                    )}
                                >
                                    <input
                                        type="checkbox"
                                        name="services[]"
                                        value={service}
                                        checked={
                                            available &&
                                            selected.includes(service)
                                        }
                                        disabled={!available}
                                        onChange={() => toggle(service)}
                                        className="size-4 rounded border-line text-brand focus:ring-brand"
                                    />
                                    <div className="min-w-0">
                                        <span className="font-medium text-ink">
                                            {label}
                                        </span>
                                        {!available && (
                                            <span className="block text-[10px] text-faint">
                                                No active engine in this
                                                category yet.
                                            </span>
                                        )}
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-xl border border-line bg-paper/60 p-3 text-[11px] leading-relaxed text-soft">
                        ⚠️ <strong>Single-Use Credentials:</strong> Generated
                        database passwords and S3 keys are presented once on
                        creation and never stored in plain text.
                    </div>

                    <div className="mt-6 flex justify-end gap-2.5 border-t border-line/60 pt-2">
                        <Button variant="secondary" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            disabled={!tenant || selected.length === 0}
                        >
                            <KeyRound className="size-4" />
                            <span>Provision Credentials</span>
                        </Button>
                    </div>
                </Form>
            </div>
        </div>
    );
}
