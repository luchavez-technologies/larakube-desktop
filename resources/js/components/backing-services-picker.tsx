import {
    AlertTriangle,
    Box,
    Database,
    HardDrive,
    Layers,
    Search,
    Share2,
    Cloud,
} from 'lucide-react';
import Button from '@/components/button';
import { cn } from '@/lib/utils';
import type { Project } from '@/types/larakube';

export type EligibleBackingService = {
    slug: string;
    category: string;
    label: string;
    kind: 'database' | 'cache' | 'storage' | 'search';
};

export type ServerPlexSummary = {
    initialized: boolean;
    services: string[];
};

const DATABASE_SERVICES: Record<string, string> = {
    postgres: 'PostgreSQL',
    mysql: 'MySQL',
    mariadb: 'MariaDB',
};

const CACHE_SERVICES: Record<string, string> = {
    redis: 'Redis / Valkey',
};

const STORAGE_SERVICES: Record<string, string> = {
    seaweedfs: 'SeaweedFS',
    garage: 'Garage',
};

const SEARCH_SERVICES: Record<string, string> = {
    meilisearch: 'Meilisearch',
};

export function eligibleBackingServices(
    project: Pick<
        Project,
        'database' | 'cacheDriver' | 'objectStorage' | 'scoutDriver'
    >,
): EligibleBackingService[] {
    const list: EligibleBackingService[] = [];

    if (project.database && DATABASE_SERVICES[project.database]) {
        list.push({
            slug: project.database,
            category: 'Database',
            label: DATABASE_SERVICES[project.database],
            kind: 'database',
        });
    }

    if (project.cacheDriver && CACHE_SERVICES[project.cacheDriver]) {
        list.push({
            slug: project.cacheDriver,
            category: 'Cache & Queues',
            label: CACHE_SERVICES[project.cacheDriver],
            kind: 'cache',
        });
    }

    if (project.objectStorage && STORAGE_SERVICES[project.objectStorage]) {
        list.push({
            slug: project.objectStorage,
            category: 'Object Storage',
            label: STORAGE_SERVICES[project.objectStorage],
            kind: 'storage',
        });
    }

    if (project.scoutDriver && SEARCH_SERVICES[project.scoutDriver]) {
        list.push({
            slug: project.scoutDriver,
            category: 'Search',
            label: SEARCH_SERVICES[project.scoutDriver],
            kind: 'search',
        });
    }

    return list;
}

function ServiceIcon({ kind }: { kind: EligibleBackingService['kind'] }) {
    switch (kind) {
        case 'database':
            return <Database className="size-3.5 text-brand" />;
        case 'cache':
            return <Layers className="size-3.5 text-brand" />;
        case 'storage':
            return <HardDrive className="size-3.5 text-brand" />;
        case 'search':
            return <Search className="size-3.5 text-brand" />;
    }
}

export default function BackingServicesPicker({
    project,
    environment,
    selected,
    onChange,
    serverName,
    serverPlex,
    connectedPlex = [],
    pendingPlex = [],
    externalManaged = [],
    external,
    onExternalChange,
    disabled = false,
}: {
    project: Pick<
        Project,
        'name' | 'database' | 'cacheDriver' | 'objectStorage' | 'scoutDriver'
    >;
    environment: string;
    selected: string[];
    onChange: (next: string[]) => void;
    serverName?: string | null;
    serverPlex?: ServerPlexSummary | null;
    connectedPlex?: string[];
    pendingPlex?: string[];
    externalManaged?: string[];
    /** Services hosted outside the cluster (e.g. AWS RDS); shows a third "External" option when set. */
    external?: string[];
    onExternalChange?: (next: string[]) => void;
    disabled?: boolean;
}) {
    const eligible = eligibleBackingServices(project);

    if (eligible.length === 0) {
        return null;
    }

    const envLabel = environment.trim() || 'this environment';
    const namespaceLabel = `${project.name}-${envLabel}`;

    const setServiceMode = (
        slug: string,
        mode: 'pod' | 'commons' | 'external',
    ) => {
        if (disabled) return;
        if (onExternalChange) {
            const others = (external ?? []).filter((item) => item !== slug);
            onExternalChange(mode === 'external' ? [...others, slug] : others);
        }
        if (mode === 'commons') {
            if (!selected.includes(slug)) {
                onChange([...selected, slug]);
            }
        } else {
            onChange(selected.filter((item) => item !== slug));
        }
    };

    const disconnectedLiveServices = connectedPlex.filter(
        (slug) => !selected.includes(slug),
    );

    return (
        <div className="space-y-3">
            <input type="hidden" name="plex_configured" value="1" />
            {selected.map((slug) => (
                <input key={slug} type="hidden" name="plex[]" value={slug} />
            ))}
            {onExternalChange && (
                <input type="hidden" name="managed_configured" value="1" />
            )}
            {(external ?? []).map((slug) => (
                <input key={slug} type="hidden" name="managed[]" value={slug} />
            ))}

            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                <p className="text-xs leading-relaxed text-soft">
                    Choose whether each service deploys its own pod inside{' '}
                    <code className="rounded bg-paper px-1 py-0.5 font-mono text-[11px] text-ink">
                        {namespaceLabel}
                    </code>{' '}
                    or reuses{' '}
                    {serverName ? (
                        <strong className="font-medium text-ink">
                            {serverName}
                        </strong>
                    ) : (
                        'the server'
                    )}
                    &rsquo;s shared Plex Commons.
                </p>

                {eligible.length > 1 && (
                    <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={disabled}
                            onClick={() =>
                                onChange(eligible.map((item) => item.slug))
                            }
                            className="h-7 gap-1 px-2 text-[11px]"
                        >
                            <Share2 className="size-3" />
                            <span>Use Plex Commons</span>
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={disabled}
                            onClick={() => onChange([])}
                            className="h-7 gap-1 px-2 text-[11px]"
                        >
                            <Box className="size-3" />
                            <span>Use Own Pods</span>
                        </Button>
                    </div>
                )}
            </div>

            <div className="space-y-2">
                {eligible.map((service) => {
                    const isExternal = (external ?? []).includes(service.slug);
                    const isCommons =
                        !isExternal && selected.includes(service.slug);
                    const isConnected = connectedPlex.includes(service.slug);
                    const isPending = pendingPlex.includes(service.slug);
                    const isExternalManaged = externalManaged.includes(
                        service.slug,
                    );
                    const activeOnServer = Boolean(
                        serverPlex?.initialized &&
                        serverPlex.services.includes(service.slug),
                    );

                    return (
                        <div
                            key={service.slug}
                            className="flex flex-col gap-2.5 rounded-xl border border-line/80 bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                            <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <ServiceIcon kind={service.kind} />
                                    <span className="text-xs font-semibold text-ink">
                                        {service.label}
                                    </span>
                                    <span className="text-[11px] text-soft">
                                        · {service.category}
                                    </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                    {isConnected && (
                                        <span className="rounded bg-tools-tint px-1.5 py-0.5 font-medium text-tools ring-1 ring-tools/20">
                                            Connected on cluster
                                        </span>
                                    )}
                                    {!isConnected && isPending && (
                                        <span className="rounded bg-warn/10 px-1.5 py-0.5 font-medium text-warn ring-1 ring-warn/25">
                                            Pending deploy
                                        </span>
                                    )}
                                    {!isConnected &&
                                        !isPending &&
                                        isExternalManaged && (
                                            <span className="rounded bg-line/60 px-1.5 py-0.5 font-medium text-soft">
                                                Cloud managed
                                            </span>
                                        )}
                                    {serverPlex &&
                                        (activeOnServer ? (
                                            <span className="rounded bg-ok/10 px-1.5 py-0.5 font-medium text-ok">
                                                Active on{' '}
                                                {serverName ?? 'server'}
                                            </span>
                                        ) : serverPlex.initialized ? (
                                            <span className="rounded bg-paper px-1.5 py-0.5 text-soft ring-1 ring-line">
                                                {isCommons
                                                    ? 'Will enable on deploy'
                                                    : 'Not enabled in Commons'}
                                            </span>
                                        ) : (
                                            <span className="rounded bg-paper px-1.5 py-0.5 text-soft ring-1 ring-line">
                                                {isCommons
                                                    ? 'Commons initializes on deploy'
                                                    : 'Commons not installed'}
                                            </span>
                                        ))}
                                </div>
                            </div>

                            <div
                                role="group"
                                aria-label={`${service.label} placement`}
                                className="inline-flex shrink-0 rounded-lg border border-line bg-paper p-0.5"
                            >
                                <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={() =>
                                        setServiceMode(service.slug, 'pod')
                                    }
                                    className={cn(
                                        'inline-flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-60',
                                        !isCommons && !isExternal
                                            ? 'bg-surface text-ink shadow-2xs ring-1 ring-line/60'
                                            : 'text-soft hover:text-ink',
                                    )}
                                >
                                    <Box className="size-3" />
                                    <span>Own pod</span>
                                </button>
                                <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={() =>
                                        setServiceMode(service.slug, 'commons')
                                    }
                                    className={cn(
                                        'inline-flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-60',
                                        isCommons
                                            ? 'bg-tools-tint text-tools shadow-2xs ring-1 ring-tools/25'
                                            : 'text-soft hover:text-ink',
                                    )}
                                >
                                    <Share2 className="size-3" />
                                    <span>Plex Commons</span>
                                </button>
                                {onExternalChange && (
                                    <button
                                        type="button"
                                        disabled={disabled}
                                        onClick={() =>
                                            setServiceMode(
                                                service.slug,
                                                'external',
                                            )
                                        }
                                        title="Hosted outside the cluster, e.g. AWS RDS. You fill in its connection details in the environment's .env."
                                        className={cn(
                                            'inline-flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-60',
                                            isExternal
                                                ? 'bg-surface text-ink shadow-2xs ring-1 ring-line/60'
                                                : 'text-soft hover:text-ink',
                                        )}
                                    >
                                        <Cloud className="size-3" />
                                        <span>External</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {disconnectedLiveServices.length > 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2.5 text-[11px] leading-relaxed text-ink">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" />
                    <p>
                        Switching{' '}
                        <strong className="font-semibold">
                            {disconnectedLiveServices.join(', ')}
                        </strong>{' '}
                        to Own pod updates the blueprint and manifests so
                        self-hosted pods return on next deploy. Existing Plex
                        Commons data is kept untouched until you run{' '}
                        <code className="rounded bg-surface px-1 py-0.5 font-mono text-[10px]">
                            Disconnect Commons
                        </code>{' '}
                        or{' '}
                        <code className="rounded bg-surface px-1 py-0.5 font-mono text-[10px]">
                            larakube plex:leave {envLabel} --restore
                        </code>
                        .
                    </p>
                </div>
            )}
        </div>
    );
}

export type HostService = { slug: string; label: string };

/**
 * Services that get their own public address in a cloud environment, passed to the LaraKube CLI
 * as `--host=<slug>=<hostname>`. Mirrors the CLI's HasPromptableHosts (LaravelFeature::REVERB,
 * StorageDriver SEAWEEDFS/GARAGE); keep both lists in step.
 */
export function promptableHostServices(
    project: Pick<Project, 'features' | 'objectStorage'>,
): HostService[] {
    const list: HostService[] = [];

    if (project.features?.includes('reverb')) {
        list.push({ slug: 'reverb', label: 'Reverb WebSocket' });
    }

    if (project.objectStorage === 'seaweedfs') {
        list.push({ slug: 's3', label: 'SeaweedFS S3 API' });
    } else if (project.objectStorage === 'garage') {
        list.push({ slug: 's3', label: 'Garage S3 API' });
    }

    return list;
}
