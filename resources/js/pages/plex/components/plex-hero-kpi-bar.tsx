import {
    Activity,
    Database,
    HardDrive,
    Layers,
    Server,
    Zap,
} from 'lucide-react';
import Card from '@/components/card';
import RadialGauge from '@/components/metrics/radial-gauge';
import { brandIcon } from '@/components/tool-logo';
import type {
    NodeMetrics,
    PlexCommonsServicesReport,
    PlexStatus,
    PodMetrics,
} from '@/types/larakube';

export default function PlexHeroKpiBar({
    plex,
    services,
    podMetrics,
    nodeMetrics,
}: {
    plex: PlexStatus;
    services?: PlexCommonsServicesReport | null;
    podMetrics?: PodMetrics | null;
    nodeMetrics?: NodeMetrics | null;
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
    const activePercentage = Math.round(
        (activeEnginesCount / (totalEnginesCount || 1)) * 100,
    );

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
    const memoryPercent =
        nodeMetrics?.memoryPercent ??
        (hasMetrics ? Math.min(100, Math.round(totalMemoryMiB / 10)) : 0);

    return (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. Active Engines */}
            <Card className="flex items-center justify-between p-4">
                <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium tracking-[0.06em] text-soft uppercase">
                            Backing Engines
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                            Healthy
                        </span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="font-mono text-2xl font-bold tracking-tight text-ink">
                            {activeEnginesCount}
                        </span>
                        <span className="text-xs text-soft">
                            of {totalEnginesCount} catalog engines
                        </span>
                    </div>
                    <div className="mt-2.5 flex items-center gap-1 overflow-hidden">
                        {activeOptions.map((opt) => (
                            <span
                                key={opt.driver}
                                className="inline-flex size-5.5 shrink-0 items-center justify-center rounded-md bg-paper text-ink ring-1 ring-line/60"
                                title={opt.label}
                            >
                                {brandIcon(opt.driver) ?? (
                                    <Server className="size-2.5 text-soft" />
                                )}
                            </span>
                        ))}
                    </div>
                </div>
                <RadialGauge
                    value={activePercentage}
                    displayValue={`${activePercentage}%`}
                    label=""
                    size="sm"
                    tone="ok"
                    className="shrink-0 p-0"
                />
            </Card>

            {/* 2. Connected Tenants */}
            <Card className="flex flex-col justify-between p-4">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium tracking-[0.06em] text-soft uppercase">
                        Connected Tenants
                    </span>
                    <span className="flex size-6 items-center justify-center rounded-md bg-tools/10 text-tools">
                        <Layers className="size-3.5" />
                    </span>
                </div>
                <div className="mt-1">
                    <div className="flex items-baseline gap-1.5">
                        <span className="font-mono text-2xl font-bold tracking-tight text-ink">
                            {allTenants.length}
                        </span>
                        <span className="text-xs text-soft">
                            active consumers
                        </span>
                    </div>
                    <div className="mt-2.5 flex items-center gap-1.5 font-mono text-[11px] text-soft">
                        <span className="rounded bg-paper px-1.5 py-0.5 text-ink ring-1 ring-line/50">
                            {toolTenants.length} Tools
                        </span>
                        <span>·</span>
                        <span className="rounded bg-paper px-1.5 py-0.5 text-ink ring-1 ring-line/50">
                            {projectTenants.length} Apps
                        </span>
                        {customTenants.length > 0 && (
                            <>
                                <span>·</span>
                                <span className="rounded bg-paper px-1.5 py-0.5 text-ink ring-1 ring-line/50">
                                    {customTenants.length} Custom
                                </span>
                            </>
                        )}
                    </div>
                </div>
            </Card>

            {/* 3. Allocated Slices */}
            <Card className="flex flex-col justify-between p-4">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium tracking-[0.06em] text-soft uppercase">
                        Resource Slices
                    </span>
                    <div className="flex items-center gap-1 text-soft">
                        <Database className="size-3 text-brand" />
                        <Zap className="size-3 text-amber-500" />
                        <HardDrive className="size-3 text-emerald-500" />
                    </div>
                </div>
                <div className="mt-1">
                    <div className="flex items-baseline gap-1.5">
                        <span className="font-mono text-2xl font-bold tracking-tight text-ink">
                            {totalSlices}
                        </span>
                        <span className="text-xs text-soft">
                            slices provisioned
                        </span>
                    </div>
                    <div className="mt-2.5 flex items-center gap-2 font-mono text-[11px] text-soft">
                        <span className="flex items-center gap-1">
                            <span className="size-1.5 rounded-full bg-brand" />
                            {dbCount} DBs
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                            <span className="size-1.5 rounded-full bg-amber-500" />
                            {redisCount} Redis
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                            <span className="size-1.5 rounded-full bg-emerald-500" />
                            {s3Count} S3
                        </span>
                    </div>
                </div>
            </Card>

            {/* 4. Live Footprint */}
            <Card className="flex items-center justify-between p-4">
                <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium tracking-[0.06em] text-soft uppercase">
                            Live Footprint
                        </span>
                        <Activity className="size-3.5 text-brand" />
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="font-mono text-2xl font-bold tracking-tight text-ink">
                            {formattedMem ?? nodeMetrics?.memoryUsage ?? '—'}
                        </span>
                        {formattedCpu && (
                            <span className="font-mono text-xs text-soft">
                                / {formattedCpu}
                            </span>
                        )}
                    </div>
                    <p className="mt-2.5 truncate text-xs text-soft">
                        {hasMetrics
                            ? `Across ${components.length} Commons workloads`
                            : nodeMetrics?.memoryPercent !== null &&
                                nodeMetrics?.memoryPercent !== undefined
                              ? `${nodeMetrics.memoryPercent}% RAM load on cluster`
                              : 'Pod metrics streaming live'}
                    </p>
                </div>
                <RadialGauge
                    value={memoryPercent}
                    displayValue={
                        nodeMetrics?.memoryPercent
                            ? `${nodeMetrics.memoryPercent}%`
                            : formattedMem
                              ? `${Math.round(totalMemoryMiB)}M`
                              : '—'
                    }
                    label=""
                    size="sm"
                    tone="auto"
                    direction="lower-is-better"
                    className="shrink-0 p-0"
                />
            </Card>
        </div>
    );
}
