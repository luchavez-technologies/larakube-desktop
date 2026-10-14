import {
    Activity,
    Database,
    HardDrive,
    Layers,
    Server,
    Zap,
} from 'lucide-react';
import Card from '@/components/card';
import { brandIcon } from '@/components/tool-logo';
import type {
    PlexCommonsServicesReport,
    PlexStatus,
    PodMetrics,
} from '@/types/larakube';

export default function PlexHeroKpiBar({
    plex,
    services,
    podMetrics,
}: {
    plex: PlexStatus;
    services?: PlexCommonsServicesReport | null;
    podMetrics?: PodMetrics | null;
}) {
    const toolTenants = plex.tenants?.tool ?? [];
    const projectTenants = plex.tenants?.project ?? [];
    const customTenants = plex.tenants?.custom ?? [];
    const allTenants = [...toolTenants, ...projectTenants, ...customTenants];

    // Compute active engines and unique drivers
    const allOptions = services?.categories.flatMap((c) => c.options) ?? [];
    const activeOptions = allOptions.filter((o) => o.enabled);
    const activeEnginesCount = activeOptions.length;
    const totalEnginesCount = allOptions.length;

    // Compute resource allocations across all tenants
    const dbCount = allTenants.filter((t) => Boolean(t.database)).length;
    const redisCount = allTenants.filter(
        (t) => t.redisIndex !== null && t.redisIndex !== undefined,
    ).length;
    const s3Count = allTenants.filter((t) => Boolean(t.s3Bucket)).length;
    const totalSlices = dbCount + redisCount + s3Count;

    // Compute live footprint from pod metrics
    const components = podMetrics?.components
        ? Object.entries(podMetrics.components)
        : [];
    const hasMetrics = podMetrics?.available && components.length > 0;

    let totalCpuMilli = 0;
    let totalMemoryMiB = 0;
    for (const [, stat] of components) {
        if (stat.cpu) {
            const m = parseInt(stat.cpu.replace('m', ''), 10);
            if (!isNaN(m)) totalCpuMilli += m;
        }
        if (stat.memory) {
            const mem = stat.memory.toLowerCase();
            if (mem.endsWith('mi')) {
                const val = parseFloat(mem.replace('mi', ''));
                if (!isNaN(val)) totalMemoryMiB += val;
            } else if (mem.endsWith('gi')) {
                const val = parseFloat(mem.replace('gi', ''));
                if (!isNaN(val)) totalMemoryMiB += val * 1024;
            }
        }
    }

    const formattedCpu = totalCpuMilli > 0 ? `${totalCpuMilli}m` : null;
    const formattedMem =
        totalMemoryMiB > 0 ? `${Math.round(totalMemoryMiB)} MiB` : null;

    return (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. Active Engines */}
            <Card className="flex flex-col justify-between p-4.5">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium tracking-[0.06em] text-soft uppercase">
                        Backing Engines
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                        Healthy
                    </span>
                </div>
                <div className="mt-3">
                    <div className="flex items-baseline gap-2">
                        <span className="font-mono text-2xl font-bold tracking-tight text-ink">
                            {activeEnginesCount}
                        </span>
                        <span className="text-xs text-soft">
                            of {totalEnginesCount} catalog engines
                        </span>
                    </div>
                    <div className="mt-2.5 flex items-center gap-1.5 overflow-hidden">
                        {activeOptions.map((opt) => (
                            <span
                                key={opt.driver}
                                className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-paper text-ink ring-1 ring-line/60"
                                title={opt.label}
                            >
                                {brandIcon(opt.driver) ?? (
                                    <Server className="size-3 text-soft" />
                                )}
                            </span>
                        ))}
                    </div>
                </div>
            </Card>

            {/* 2. Connected Tenants */}
            <Card className="flex flex-col justify-between p-4.5">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium tracking-[0.06em] text-soft uppercase">
                        Connected Tenants
                    </span>
                    <Layers className="size-4 text-tools" />
                </div>
                <div className="mt-3">
                    <div className="flex items-baseline gap-2">
                        <span className="font-mono text-2xl font-bold tracking-tight text-ink">
                            {allTenants.length}
                        </span>
                        <span className="text-xs text-soft">
                            active consumers
                        </span>
                    </div>
                    <p className="mt-2 text-xs text-soft">
                        {toolTenants.length} Tools · {projectTenants.length}{' '}
                        Apps · {customTenants.length} Custom
                    </p>
                </div>
            </Card>

            {/* 3. Allocated Slices */}
            <Card className="flex flex-col justify-between p-4.5">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium tracking-[0.06em] text-soft uppercase">
                        Resource Slices
                    </span>
                    <div className="flex items-center gap-1 text-soft">
                        <Database className="size-3" />
                        <Zap className="size-3" />
                        <HardDrive className="size-3" />
                    </div>
                </div>
                <div className="mt-3">
                    <div className="flex items-baseline gap-2">
                        <span className="font-mono text-2xl font-bold tracking-tight text-ink">
                            {totalSlices}
                        </span>
                        <span className="text-xs text-soft">
                            slices provisioned
                        </span>
                    </div>
                    <p className="mt-2 truncate text-xs text-soft">
                        {dbCount} DBs · {redisCount} Redis · {s3Count} S3
                    </p>
                </div>
            </Card>

            {/* 4. Live Footprint */}
            <Card className="flex flex-col justify-between p-4.5">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium tracking-[0.06em] text-soft uppercase">
                        Live Footprint
                    </span>
                    <Activity className="size-4 text-brand" />
                </div>
                <div className="mt-3">
                    {hasMetrics ? (
                        <>
                            <div className="flex items-baseline gap-2">
                                <span className="font-mono text-2xl font-bold tracking-tight text-ink">
                                    {formattedMem ?? '—'}
                                </span>
                                <span className="font-mono text-xs text-soft">
                                    {formattedCpu ? `/ ${formattedCpu}` : ''}
                                </span>
                            </div>
                            <p className="mt-2 text-xs text-soft">
                                Across {components.length} Commons workloads
                            </p>
                        </>
                    ) : (
                        <>
                            <div className="flex items-baseline gap-2">
                                <span className="text-base font-medium text-ink">
                                    Active Workloads
                                </span>
                            </div>
                            <p className="mt-2 text-xs text-soft">
                                Pod metrics streaming in real-time
                            </p>
                        </>
                    )}
                </div>
            </Card>
        </div>
    );
}
