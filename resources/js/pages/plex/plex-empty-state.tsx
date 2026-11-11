import { router } from '@inertiajs/react';
import { useId, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
    Check,
    CheckCircle2,
    Cpu,
    Database,
    HardDrive,
    Layers,
    RotateCw,
    Search,
    Server as ServerIcon,
    Sparkles,
    Terminal,
    XCircle,
    Zap,
} from 'lucide-react';
import Button from '@/components/button';
import ToolLogo from '@/components/tool-logo';
import { cn } from '@/lib/utils';
import type {
    CompatibilityToolItem,
    PlexDatabaseSummary,
    Server,
} from '@/types/larakube';

type DbEngine = 'postgres' | 'mysql' | 'mariadb';
type StorageEngine = 'seaweedfs' | 'minio' | 'none';

type Preset = 'modern' | 'laravel-classic' | 'minimal' | 'full' | 'custom';

const DB_ENGINES: readonly DbEngine[] = ['postgres', 'mysql', 'mariadb'];

export default function PlexEmptyState({
    server,
    databaseMatrix,
    compatibilityTools = [],
}: {
    server: Server;
    databaseMatrix?: Record<string, PlexDatabaseSummary>;
    compatibilityTools?: CompatibilityToolItem[];
}) {
    const headingId = useId();

    // Configuration state
    const [dbEngine, setDbEngine] = useState<DbEngine>('postgres');
    const [plannedAppSlugs, setPlannedAppSlugs] = useState<string[]>([]);
    const [plannedAppQuery, setPlannedAppQuery] = useState('');
    const [enableRedis, setEnableRedis] = useState(true);
    const [storageEngine, setStorageEngine] =
        useState<StorageEngine>('seaweedfs');
    const [enableMeilisearch, setEnableMeilisearch] = useState(false);
    const [enableChrome, setEnableChrome] = useState(false);
    const [processing, setProcessing] = useState(false);

    // Compute active services list for CLI --services= argument
    const selectedServices = useMemo(() => {
        const list: string[] = [];
        if (dbEngine) list.push(dbEngine);
        if (enableRedis) list.push('redis');
        if (storageEngine !== 'none') list.push(storageEngine);
        if (enableMeilisearch) list.push('meilisearch');
        if (enableChrome) list.push('headless-shell');
        return list;
    }, [dbEngine, enableRedis, storageEngine, enableMeilisearch, enableChrome]);

    // Detect active preset based on current selections
    const activePreset: Preset = useMemo(() => {
        if (
            dbEngine === 'postgres' &&
            enableRedis &&
            storageEngine === 'seaweedfs' &&
            !enableMeilisearch &&
            !enableChrome
        ) {
            return 'modern';
        }
        if (
            dbEngine === 'mysql' &&
            enableRedis &&
            storageEngine === 'seaweedfs' &&
            !enableMeilisearch &&
            !enableChrome
        ) {
            return 'laravel-classic';
        }
        if (
            dbEngine === 'postgres' &&
            enableRedis &&
            storageEngine === 'none' &&
            !enableMeilisearch &&
            !enableChrome
        ) {
            return 'minimal';
        }
        if (
            dbEngine === 'postgres' &&
            enableRedis &&
            storageEngine === 'seaweedfs' &&
            enableMeilisearch &&
            enableChrome
        ) {
            return 'full';
        }
        return 'custom';
    }, [dbEngine, enableRedis, storageEngine, enableMeilisearch, enableChrome]);

    const applyPreset = (preset: Exclude<Preset, 'custom'>) => {
        switch (preset) {
            case 'modern':
                setDbEngine('postgres');
                setEnableRedis(true);
                setStorageEngine('seaweedfs');
                setEnableMeilisearch(false);
                setEnableChrome(false);
                break;
            case 'laravel-classic':
                setDbEngine('mysql');
                setEnableRedis(true);
                setStorageEngine('seaweedfs');
                setEnableMeilisearch(false);
                setEnableChrome(false);
                break;
            case 'minimal':
                setDbEngine('postgres');
                setEnableRedis(true);
                setStorageEngine('none');
                setEnableMeilisearch(false);
                setEnableChrome(false);
                break;
            case 'full':
                setDbEngine('postgres');
                setEnableRedis(true);
                setStorageEngine('seaweedfs');
                setEnableMeilisearch(true);
                setEnableChrome(true);
                break;
        }
    };

    const togglePlannedApp = (slug: string) => {
        setPlannedAppSlugs((current) =>
            current.includes(slug)
                ? current.filter((item) => item !== slug)
                : [...current, slug],
        );
    };

    const filteredCompatibilityTools = useMemo(() => {
        const needle = plannedAppQuery.trim().toLowerCase();
        const matches = needle
            ? compatibilityTools.filter(
                  (tool) =>
                      tool.name.toLowerCase().includes(needle) ||
                      tool.slug.toLowerCase().includes(needle),
              )
            : compatibilityTools;

        return matches.slice(0, 18);
    }, [compatibilityTools, plannedAppQuery]);

    const selectedPlannedTools = useMemo(
        () =>
            compatibilityTools.filter((tool) =>
                plannedAppSlugs.includes(tool.slug),
            ),
        [compatibilityTools, plannedAppSlugs],
    );

    const plannedCompatibility = useMemo(() => {
        const byEngine: Record<
            DbEngine,
            {
                matched: number;
                total: number;
                incompatibleNames: string[];
                standaloneFallbackNames: string[];
            }
        > = {
            postgres: {
                matched: 0,
                total: selectedPlannedTools.length,
                incompatibleNames: [],
                standaloneFallbackNames: [],
            },
            mysql: {
                matched: 0,
                total: selectedPlannedTools.length,
                incompatibleNames: [],
                standaloneFallbackNames: [],
            },
            mariadb: {
                matched: 0,
                total: selectedPlannedTools.length,
                incompatibleNames: [],
                standaloneFallbackNames: [],
            },
        };

        for (const engine of DB_ENGINES) {
            for (const tool of selectedPlannedTools) {
                const matchesEngine =
                    tool.plexDatabases.includes(engine) ||
                    (engine === 'postgres' &&
                        tool.plexDatabases.includes('postgresql'));
                if (matchesEngine) {
                    byEngine[engine].matched += 1;
                } else if (tool.supportsNoPlex || tool.supportsSqlite) {
                    byEngine[engine].standaloneFallbackNames.push(tool.name);
                } else {
                    byEngine[engine].incompatibleNames.push(tool.name);
                }
            }
        }

        let bestFit: DbEngine | null = null;
        if (selectedPlannedTools.length > 0) {
            let bestScore = -1;
            for (const engine of DB_ENGINES) {
                const score =
                    byEngine[engine].matched * 100 +
                    (databaseMatrix?.[engine]?.counts.total ?? 0);
                if (byEngine[engine].matched > 0 && score > bestScore) {
                    bestScore = score;
                    bestFit = engine;
                }
            }
        }

        return { byEngine, bestFit };
    }, [selectedPlannedTools, databaseMatrix]);

    // Estimated memory footprint
    const estimatedMemory = useMemo(() => {
        let mb = 0;
        if (dbEngine === 'postgres' || dbEngine === 'mysql') mb += 512;
        if (dbEngine === 'mariadb') mb += 450;
        if (enableRedis) mb += 128;
        if (storageEngine === 'seaweedfs') mb += 256;
        if (storageEngine === 'minio') mb += 512;
        if (enableMeilisearch) mb += 256;
        if (enableChrome) mb += 512;

        if (mb >= 1024) {
            return `~${(mb / 1024).toFixed(1)} GB RAM`;
        }
        return `~${mb} MB RAM`;
    }, [dbEngine, enableRedis, storageEngine, enableMeilisearch, enableChrome]);

    const contextName = server.context || server.name;
    const commandPreview = `larakube plex:init --context=${contextName} --services=${selectedServices.join(',')}`;

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (selectedServices.length === 0) return;

        setProcessing(true);
        router.post(
            `/servers/${server.name}/plex/init`,
            {
                services: selectedServices,
            },
            {
                onFinish: () => setProcessing(false),
            },
        );
    };

    return (
        <div className="space-y-6">
            {/* 1. Hero Header Banner */}
            <div className="rounded-2xl border border-line bg-surface/60 p-6 backdrop-blur-xs md:p-8">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="max-w-2xl">
                        <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-tools-tint text-tools ring-1 ring-tools/20">
                            <Layers className="h-5 w-5" />
                        </div>
                        <h2
                            id={headingId}
                            className="text-xl font-semibold tracking-tight text-ink"
                        >
                            Initialize Plex Commons on {server.name}
                        </h2>
                        <p className="mt-1.5 text-[14px] leading-relaxed text-soft">
                            Configure the cluster-wide backing engines
                            (database, cache, and S3 object storage) that all
                            tenant applications and companion tools will share.
                            Select exactly what services your workloads require.
                        </p>
                    </div>

                    {/* Preset Picker Pills */}
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface p-1.5">
                        <span className="px-2 text-[11px] font-medium tracking-wider text-soft uppercase">
                            Presets:
                        </span>
                        <button
                            type="button"
                            onClick={() => applyPreset('modern')}
                            className={cn(
                                'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition',
                                activePreset === 'modern'
                                    ? 'bg-tools text-white shadow-xs'
                                    : 'text-soft hover:bg-line/40 hover:text-ink',
                            )}
                        >
                            <Sparkles className="size-3.5" />
                            Modern (Postgres)
                        </button>
                        <button
                            type="button"
                            onClick={() => applyPreset('laravel-classic')}
                            className={cn(
                                'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition',
                                activePreset === 'laravel-classic'
                                    ? 'bg-tools text-white shadow-xs'
                                    : 'text-soft hover:bg-line/40 hover:text-ink',
                            )}
                        >
                            <Database className="size-3.5" />
                            Laravel Classic (MySQL)
                        </button>
                        <button
                            type="button"
                            onClick={() => applyPreset('minimal')}
                            className={cn(
                                'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition',
                                activePreset === 'minimal'
                                    ? 'bg-tools text-white shadow-xs'
                                    : 'text-soft hover:bg-line/40 hover:text-ink',
                            )}
                        >
                            <Cpu className="size-3.5" />
                            Lean (No S3)
                        </button>
                        <button
                            type="button"
                            onClick={() => applyPreset('full')}
                            className={cn(
                                'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition',
                                activePreset === 'full'
                                    ? 'bg-tools text-white shadow-xs'
                                    : 'text-soft hover:bg-line/40 hover:text-ink',
                            )}
                        >
                            <Zap className="size-3.5" />
                            All Engines
                        </button>
                    </div>
                </div>
            </div>

            {/* 2. Interactive Setup Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Step 1: Database Engine Selection */}
                <div className="rounded-2xl border border-line bg-surface/70 p-6 backdrop-blur-xs">
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2">
                                <Database className="size-4 text-tools" />
                                <h3 className="text-sm font-semibold tracking-tight text-ink">
                                    1. Primary Relational Database
                                </h3>
                                <span className="rounded-md bg-tools-tint px-2 py-0.5 text-[10px] font-semibold tracking-wide text-tools uppercase">
                                    Required
                                </span>
                            </div>
                            <p className="mt-1 text-xs text-soft">
                                Shared relational database instance. Tenants
                                receive isolated databases and credentials on
                                join.
                            </p>
                        </div>
                    </div>

                    {compatibilityTools.length > 0 && (
                        <div className="mb-4 rounded-xl border border-line bg-paper/70 p-3.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <div className="text-xs font-semibold text-ink">
                                        Plan apps you expect to install
                                    </div>
                                    <p className="text-[11px] text-soft">
                                        Select Cluster Apps to highlight the
                                        most compatible relational database
                                        engine.
                                    </p>
                                </div>
                                {plannedAppSlugs.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setPlannedAppSlugs([])}
                                        className="text-[11px] font-medium text-soft underline-offset-2 hover:text-ink hover:underline"
                                    >
                                        Clear ({plannedAppSlugs.length})
                                    </button>
                                )}
                            </div>
                            <div className="relative mt-2.5">
                                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-soft" />
                                <input
                                    type="search"
                                    value={plannedAppQuery}
                                    onChange={(e) =>
                                        setPlannedAppQuery(e.target.value)
                                    }
                                    placeholder="Filter apps (e.g. n8n, ghost, wordpress)..."
                                    className="w-full rounded-lg border border-line bg-surface py-1.5 pr-3 pl-8 text-xs text-ink placeholder:text-faint focus:border-tools focus:outline-none"
                                />
                            </div>
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                                {filteredCompatibilityTools.map((tool) => {
                                    const active = plannedAppSlugs.includes(
                                        tool.slug,
                                    );

                                    return (
                                        <button
                                            key={tool.slug}
                                            type="button"
                                            onClick={() =>
                                                togglePlannedApp(tool.slug)
                                            }
                                            className={cn(
                                                'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ring-1 transition',
                                                active
                                                    ? 'bg-tools-tint text-tools ring-tools/40'
                                                    : 'bg-surface text-soft ring-line hover:text-ink',
                                            )}
                                        >
                                            {active && (
                                                <Check className="size-3" />
                                            )}
                                            <span>{tool.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-3">
                        {(
                            [
                                {
                                    engine: 'postgres' as const,
                                    title: 'PostgreSQL 16',
                                    badge: 'Recommended',
                                    badgeClass:
                                        'bg-sky-500/10 text-sky-600 dark:text-sky-400',
                                    description:
                                        'Enterprise ACID database with pgvector, JSONB, and high concurrency. Port 5432.',
                                },
                                {
                                    engine: 'mysql' as const,
                                    title: 'MySQL 8.4',
                                    badge: 'Laravel Standard',
                                    badgeClass:
                                        'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                                    description:
                                        'The standard for classical Laravel schemas, WordPress, and legacy stacks. Port 3306.',
                                },
                                {
                                    engine: 'mariadb' as const,
                                    title: 'MariaDB 11',
                                    badge: 'Open Source',
                                    badgeClass:
                                        'bg-teal-500/10 text-teal-600 dark:text-teal-400',
                                    description:
                                        'Community-driven drop-in MySQL replacement with thread pool concurrency. Port 3306.',
                                },
                            ] as const
                        ).map((card) => {
                            const matrixEntry = databaseMatrix?.[card.engine];
                            const planned =
                                plannedCompatibility.byEngine[card.engine];
                            const isBestFit =
                                plannedCompatibility.bestFit === card.engine;

                            return (
                                <div
                                    key={card.engine}
                                    onClick={() => setDbEngine(card.engine)}
                                    className={cn(
                                        'group relative flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition',
                                        dbEngine === card.engine
                                            ? 'border-tools bg-tools-tint/30 ring-1 ring-tools'
                                            : isBestFit
                                              ? 'border-emerald-500/50 bg-emerald-500/[0.04] hover:border-tools/40'
                                              : 'border-line bg-surface hover:border-tools/40 hover:bg-paper',
                                    )}
                                >
                                    <div>
                                        <div className="flex items-start justify-between">
                                            <ToolLogo
                                                slug={card.engine}
                                                size="sm"
                                            />
                                            {dbEngine === card.engine ? (
                                                <CheckCircle2 className="size-4 text-tools" />
                                            ) : (
                                                <div className="size-4 rounded-full border border-line" />
                                            )}
                                        </div>
                                        <div className="mt-3">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="text-sm font-semibold text-ink">
                                                    {card.title}
                                                </span>
                                                <span
                                                    className={cn(
                                                        'rounded px-1.5 py-0.5 text-[10px] font-medium',
                                                        card.badgeClass,
                                                    )}
                                                >
                                                    {card.badge}
                                                </span>
                                                {isBestFit && (
                                                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                                                        Best Fit
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-1 text-xs leading-relaxed text-soft">
                                                {card.description}
                                            </p>
                                        </div>
                                    </div>

                                    {(planned.total > 0 || matrixEntry) && (
                                        <div className="mt-3 border-t border-line/70 pt-2.5 text-[11px]">
                                            {planned.total > 0 ? (
                                                <div className="space-y-1">
                                                    <div
                                                        className={cn(
                                                            'font-medium',
                                                            planned.matched ===
                                                                planned.total
                                                                ? 'text-emerald-700 dark:text-emerald-300'
                                                                : planned.matched >
                                                                    0
                                                                  ? 'text-ink'
                                                                  : 'text-soft',
                                                        )}
                                                    >
                                                        Matches{' '}
                                                        {planned.matched}/
                                                        {planned.total} planned
                                                    </div>
                                                    {planned
                                                        .standaloneFallbackNames
                                                        .length > 0 && (
                                                        <div className="text-[10px] text-soft">
                                                            Standalone SQLite
                                                            fallback:{' '}
                                                            {planned.standaloneFallbackNames.join(
                                                                ', ',
                                                            )}
                                                        </div>
                                                    )}
                                                    {planned.incompatibleNames
                                                        .length > 0 && (
                                                        <div className="text-[10px] text-amber-600 dark:text-amber-400">
                                                            Incompatible:{' '}
                                                            {planned.incompatibleNames.join(
                                                                ', ',
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                matrixEntry && (
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center justify-between text-soft">
                                                            <span>
                                                                Supports{' '}
                                                                <strong className="font-semibold text-ink">
                                                                    {
                                                                        matrixEntry
                                                                            .counts
                                                                            .total
                                                                    }
                                                                </strong>{' '}
                                                                apps
                                                            </span>
                                                            {matrixEntry.counts
                                                                .community >
                                                                0 && (
                                                                <span className="text-[10px]">
                                                                    {
                                                                        matrixEntry
                                                                            .counts
                                                                            .official
                                                                    }{' '}
                                                                    official ·{' '}
                                                                    {
                                                                        matrixEntry
                                                                            .counts
                                                                            .community
                                                                    }{' '}
                                                                    community
                                                                </span>
                                                            )}
                                                        </div>
                                                        {matrixEntry.highlights
                                                            .length > 0 && (
                                                            <div className="flex flex-wrap gap-1">
                                                                {matrixEntry.highlights
                                                                    .slice(0, 4)
                                                                    .map(
                                                                        (
                                                                            app,
                                                                        ) => (
                                                                            <span
                                                                                key={
                                                                                    app.slug
                                                                                }
                                                                                className="rounded bg-badge px-1.5 py-0.5 text-[10px] text-soft"
                                                                            >
                                                                                {
                                                                                    app.name
                                                                                }
                                                                            </span>
                                                                        ),
                                                                    )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Step 2: Cache & In-Memory Store */}
                <div className="rounded-2xl border border-line bg-surface/70 p-6 backdrop-blur-xs">
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2">
                                <Zap className="size-4 text-tools" />
                                <h3 className="text-sm font-semibold tracking-tight text-ink">
                                    2. In-Memory Cache & Message Broker
                                </h3>
                                <span className="rounded-md bg-tools-tint px-2 py-0.5 text-[10px] font-semibold tracking-wide text-tools uppercase">
                                    Recommended
                                </span>
                            </div>
                            <p className="mt-1 text-xs text-soft">
                                Shared Valkey 8.0 instance (100% drop-in Redis
                                replacement). Tenants receive isolated database
                                indexes (DB 0–15) or key prefixes.
                            </p>
                        </div>
                    </div>

                    <div
                        onClick={() => setEnableRedis(!enableRedis)}
                        className={cn(
                            'group relative flex cursor-pointer items-start justify-between rounded-xl border p-4 transition',
                            enableRedis
                                ? 'border-tools bg-tools-tint/30 ring-1 ring-tools'
                                : 'border-line bg-surface hover:border-tools/40 hover:bg-paper',
                        )}
                    >
                        <div className="flex items-start gap-3.5">
                            <ToolLogo slug="valkey" size="sm" />
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-semibold text-ink">
                                        Valkey 8.0
                                    </span>
                                    <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">
                                        Redis-Compatible
                                    </span>
                                    <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-400">
                                        Port 6379
                                    </span>
                                </div>
                                <p className="mt-1 text-xs text-soft">
                                    The Linux Foundation's high-performance,
                                    open-source Redis fork. Wire-compatible with
                                    all Laravel Redis drivers, cache, session
                                    storage, and Horizon queues.
                                </p>
                            </div>
                        </div>

                        <div className="shrink-0 pt-1">
                            {enableRedis ? (
                                <div className="flex size-5 items-center justify-center rounded-md bg-tools text-white">
                                    <Check className="size-3.5" />
                                </div>
                            ) : (
                                <div className="size-5 rounded-md border border-line" />
                            )}
                        </div>
                    </div>
                </div>

                {/* Step 3: S3 Object Storage */}
                <div className="rounded-2xl border border-line bg-surface/70 p-6 backdrop-blur-xs">
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2">
                                <HardDrive className="size-4 text-tools" />
                                <h3 className="text-sm font-semibold tracking-tight text-ink">
                                    3. S3-Compatible Object Storage
                                </h3>
                                <span className="rounded-md bg-line px-2 py-0.5 text-[10px] font-medium tracking-wide text-soft uppercase">
                                    Optional
                                </span>
                            </div>
                            <p className="mt-1 text-xs text-soft">
                                Shared blob storage. Tenants get dedicated S3
                                buckets without spinning up redundant MinIO
                                pods.
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        {/* SeaweedFS */}
                        <div
                            onClick={() => setStorageEngine('seaweedfs')}
                            className={cn(
                                'group relative cursor-pointer rounded-xl border p-4 transition',
                                storageEngine === 'seaweedfs'
                                    ? 'border-tools bg-tools-tint/30 ring-1 ring-tools'
                                    : 'border-line bg-surface hover:border-tools/40 hover:bg-paper',
                            )}
                        >
                            <div className="flex items-start justify-between">
                                <ToolLogo slug="seaweedfs" size="sm" />
                                {storageEngine === 'seaweedfs' ? (
                                    <CheckCircle2 className="size-4 text-tools" />
                                ) : (
                                    <div className="size-4 rounded-full border border-line" />
                                )}
                            </div>
                            <div className="mt-3">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-semibold text-ink">
                                        SeaweedFS
                                    </span>
                                    <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                        Fast & Lean
                                    </span>
                                </div>
                                <p className="mt-1 text-xs leading-relaxed text-soft">
                                    High-performance S3 storage with minimal RAM
                                    usage (~256MB). Recommended for VPS.
                                </p>
                            </div>
                        </div>

                        {/* MinIO */}
                        <div
                            onClick={() => setStorageEngine('minio')}
                            className={cn(
                                'group relative cursor-pointer rounded-xl border p-4 transition',
                                storageEngine === 'minio'
                                    ? 'border-tools bg-tools-tint/30 ring-1 ring-tools'
                                    : 'border-line bg-surface hover:border-tools/40 hover:bg-paper',
                            )}
                        >
                            <div className="flex items-start justify-between">
                                <ToolLogo slug="minio" size="sm" />
                                {storageEngine === 'minio' ? (
                                    <CheckCircle2 className="size-4 text-tools" />
                                ) : (
                                    <div className="size-4 rounded-full border border-line" />
                                )}
                            </div>
                            <div className="mt-3">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-semibold text-ink">
                                        MinIO
                                    </span>
                                    <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-400">
                                        Standard S3
                                    </span>
                                </div>
                                <p className="mt-1 text-xs leading-relaxed text-soft">
                                    Full AWS S3 API fidelity with integrated web
                                    console. Higher memory usage (~512MB).
                                </p>
                            </div>
                        </div>

                        {/* None / Skip */}
                        <div
                            onClick={() => setStorageEngine('none')}
                            className={cn(
                                'group relative cursor-pointer rounded-xl border p-4 transition',
                                storageEngine === 'none'
                                    ? 'border-tools bg-tools-tint/30 ring-1 ring-tools'
                                    : 'border-line bg-surface hover:border-tools/40 hover:bg-paper',
                            )}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex size-8 items-center justify-center rounded-lg bg-line/60 text-soft">
                                    <XCircle className="size-4" />
                                </div>
                                {storageEngine === 'none' ? (
                                    <CheckCircle2 className="size-4 text-tools" />
                                ) : (
                                    <div className="size-4 rounded-full border border-line" />
                                )}
                            </div>
                            <div className="mt-3">
                                <span className="text-sm font-semibold text-ink">
                                    No Shared S3
                                </span>
                                <p className="mt-1 text-xs leading-relaxed text-soft">
                                    Skip object storage on Commons. Tenants will
                                    use external cloud S3 (AWS or Cloudflare
                                    R2).
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Step 4: Companion Acceleration Engines */}
                <div className="rounded-2xl border border-line bg-surface/70 p-6 backdrop-blur-xs">
                    <div className="mb-4">
                        <div className="flex items-center gap-2">
                            <ServerIcon className="size-4 text-tools" />
                            <h3 className="text-sm font-semibold tracking-tight text-ink">
                                4. Optional Companion Acceleration Engines
                            </h3>
                            <span className="rounded-md bg-line px-2 py-0.5 text-[10px] font-medium tracking-wide text-soft uppercase">
                                Opt-in
                            </span>
                        </div>
                        <p className="mt-1 text-xs text-soft">
                            Specialized services shared by all applications on
                            this cluster. You can also add these later anytime.
                        </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        {/* Meilisearch */}
                        <div
                            onClick={() =>
                                setEnableMeilisearch(!enableMeilisearch)
                            }
                            className={cn(
                                'group relative flex cursor-pointer items-start justify-between rounded-xl border p-4 transition',
                                enableMeilisearch
                                    ? 'border-tools bg-tools-tint/30 ring-1 ring-tools'
                                    : 'border-line bg-surface hover:border-tools/40 hover:bg-paper',
                            )}
                        >
                            <div className="flex items-start gap-3">
                                <ToolLogo slug="meilisearch" size="sm" />
                                <div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm font-semibold text-ink">
                                            Meilisearch Search Engine
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-soft">
                                        Typo-tolerant, lightning-fast full-text
                                        search for Laravel Scout. Port 7700.
                                    </p>
                                </div>
                            </div>
                            <div className="shrink-0 pt-1">
                                {enableMeilisearch ? (
                                    <div className="flex size-5 items-center justify-center rounded-md bg-tools text-white">
                                        <Check className="size-3.5" />
                                    </div>
                                ) : (
                                    <div className="size-5 rounded-md border border-line" />
                                )}
                            </div>
                        </div>

                        {/* Headless Chrome */}
                        <div
                            onClick={() => setEnableChrome(!enableChrome)}
                            className={cn(
                                'group relative flex cursor-pointer items-start justify-between rounded-xl border p-4 transition',
                                enableChrome
                                    ? 'border-tools bg-tools-tint/30 ring-1 ring-tools'
                                    : 'border-line bg-surface hover:border-tools/40 hover:bg-paper',
                            )}
                        >
                            <div className="flex items-start gap-3">
                                <ToolLogo slug="headless-shell" size="sm" />
                                <div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm font-semibold text-ink">
                                            Headless Chrome (Renderer)
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-soft">
                                        Chromium rendering container for PDF
                                        generation, Puppeteer, and Browsershot.
                                        Port 9222.
                                    </p>
                                </div>
                            </div>
                            <div className="shrink-0 pt-1">
                                {enableChrome ? (
                                    <div className="flex size-5 items-center justify-center rounded-md bg-tools text-white">
                                        <Check className="size-3.5" />
                                    </div>
                                ) : (
                                    <div className="size-5 rounded-md border border-line" />
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Review & Launch Action Bar */}
                <div className="rounded-2xl border border-line bg-paper/60 p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold tracking-wider text-ink uppercase">
                                    Configured Engines (
                                    {selectedServices.length}
                                    ):
                                </span>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {selectedServices.map((service) => (
                                        <span
                                            key={service}
                                            className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-0.5 text-xs font-medium text-ink"
                                        >
                                            <span className="size-1.5 rounded-full bg-emerald-500" />
                                            {service}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center gap-3 text-xs text-soft">
                                <span className="flex items-center gap-1">
                                    <Cpu className="size-3.5 text-tools" />
                                    Estimated Memory: {estimatedMemory}
                                </span>
                                <span>•</span>
                                <span>Cluster Namespace: larakube-plex</span>
                            </div>

                            {/* CLI Equivalent Preview */}
                            <div className="flex items-center gap-2 font-mono text-[11px] text-soft">
                                <Terminal className="size-3.5 shrink-0 text-soft" />
                                <span className="truncate">
                                    {commandPreview}
                                </span>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex shrink-0 items-center gap-2.5">
                            <Button
                                type="button"
                                variant="secondary"
                                size="md"
                                onClick={() => applyPreset('modern')}
                                disabled={processing}
                            >
                                <RotateCw className="size-4" />
                                <span>Reset Defaults</span>
                            </Button>

                            <Button
                                type="submit"
                                variant="tools"
                                size="md"
                                disabled={
                                    processing || selectedServices.length === 0
                                }
                            >
                                {processing ? (
                                    <RotateCw className="size-4 animate-spin" />
                                ) : (
                                    <Layers className="size-4" />
                                )}
                                <span>
                                    {processing
                                        ? 'Launching Commons…'
                                        : `Initialize Plex Commons (${selectedServices.length} Services)`}
                                </span>
                            </Button>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
}
