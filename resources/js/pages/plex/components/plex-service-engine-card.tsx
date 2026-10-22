import { useState } from 'react';
import { Check, Code2, Copy, ExternalLink, Filter, Server } from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import RadialGauge from '@/components/metrics/radial-gauge';
import { brandIcon } from '@/components/tool-logo';
import { ExternalLinkButton } from '@/lib/open-external';
import type {
    CompanionApp,
    PlexServiceCategoryDetail,
    PlexServiceOptionDetail,
    PlexTenant,
    PodMetrics,
} from '@/types/larakube';

/**
 * The companion GUI that makes sense for this engine's driver, if it's
 * installed and running — mirrors the CLI's own driver → companion mapping
 * (ensureProjectCompanions()/companionAccessRows()), so "Open in pgAdmin"
 * only appears where the CLI itself would wire that companion up.
 */
function companionForDriver(
    driver: string,
    companions?: CompanionApp[] | null,
): CompanionApp | null {
    if (!companions || companions.length === 0) return null;

    const d = driver.toLowerCase();
    const find = (slug: string) =>
        companions.find((c) => c.slug === slug && c.installed && c.running) ??
        null;

    if (d.includes('postgres')) return find('pgadmin') ?? find('adminer');
    if (d.includes('mysql') || d.includes('maria')) {
        return find('phpmyadmin') ?? find('adminer');
    }
    if (d.includes('sqlite')) return find('adminer');
    if (d.includes('redis')) return find('redisinsight');
    if (d.includes('mongo')) return find('mongo-express');

    return null;
}

function parseMemoryToMiB(str?: string | null): number {
    if (!str) return 0;
    const clean = str.trim().toLowerCase();
    if (clean.endsWith('gi')) {
        return (parseFloat(clean.replace('gi', '')) || 0) * 1024;
    }
    if (clean.endsWith('mi')) {
        return parseFloat(clean.replace('mi', '')) || 0;
    }
    if (clean.endsWith('ki')) {
        return (parseFloat(clean.replace('ki', '')) || 0) / 1024;
    }
    return parseFloat(clean) || 0;
}

function parseCpuToMilli(str?: string | null): number {
    if (!str) return 0;
    const clean = str.trim().toLowerCase();
    if (clean.endsWith('m')) {
        return parseFloat(clean.replace('m', '')) || 0;
    }
    return (parseFloat(clean) || 0) * 1000;
}

type EngineSpec = {
    memoryLimitMiB: number;
    cpuLimitMilli: number;
    maxCapacity: number;
    capacityLabel: string;
    capacityUnit: string;
};

function getEngineSpec(driver: string): EngineSpec {
    const d = driver.toLowerCase();
    if (d.includes('redis')) {
        return {
            memoryLimitMiB: 256,
            cpuLimitMilli: 250,
            maxCapacity: 16,
            capacityLabel: 'DB Slots',
            capacityUnit: 'slots',
        };
    }
    if (d.includes('postgres') || d.includes('mysql')) {
        return {
            memoryLimitMiB: 512,
            cpuLimitMilli: 500,
            maxCapacity: 100,
            capacityLabel: 'Connections',
            capacityUnit: 'conn',
        };
    }
    if (d.includes('meili')) {
        return {
            memoryLimitMiB: 512,
            cpuLimitMilli: 500,
            maxCapacity: 50,
            capacityLabel: 'Indices',
            capacityUnit: 'idx',
        };
    }
    if (d.includes('seaweed') || d.includes('minio') || d.includes('garage')) {
        return {
            memoryLimitMiB: 512,
            cpuLimitMilli: 500,
            maxCapacity: 100,
            capacityLabel: 'S3 Buckets',
            capacityUnit: 'buckets',
        };
    }
    if (
        d.includes('chrome') ||
        d.includes('render') ||
        d.includes('headless')
    ) {
        return {
            memoryLimitMiB: 512,
            cpuLimitMilli: 500,
            maxCapacity: 5,
            capacityLabel: 'Workers',
            capacityUnit: 'workers',
        };
    }
    return {
        memoryLimitMiB: 512,
        cpuLimitMilli: 500,
        maxCapacity: 50,
        capacityLabel: 'Capacity',
        capacityUnit: 'slots',
    };
}

export default function PlexServiceEngineCard({
    category,
    option,
    podMetrics,
    tenants,
    onFilterByEngine,
    onQuickConnect,
    companions,
}: {
    category: PlexServiceCategoryDetail;
    option: PlexServiceOptionDetail;
    podMetrics?: PodMetrics | null;
    tenants: PlexTenant[];
    onFilterByEngine: (driver: string) => void;
    onQuickConnect: (driver: string) => void;
    companions?: CompanionApp[] | null;
}) {
    const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
    const companion = companionForDriver(option.driver, companions);

    const mark = brandIcon(option.driver);

    // Look up telemetry for this component
    const normalizedDriver = option.driver.toLowerCase();
    const componentMetrics =
        podMetrics?.components?.[normalizedDriver] ||
        podMetrics?.components?.[normalizedDriver.replace('fs', '')] ||
        (normalizedDriver.includes('chrome') ||
        normalizedDriver.includes('render')
            ? podMetrics?.components?.['headless-shell'] ||
              podMetrics?.components?.['chrome']
            : null);

    // Calculate tenant / slice footprint for this engine
    let allocationDetail = '';
    let allocationCount = 0;
    if (category.key === 'database') {
        const dbs = tenants.filter(
            (t) =>
                Boolean(t.database) &&
                (!t.databaseService || t.databaseService === option.driver),
        );
        allocationCount = dbs.length;
        allocationDetail = `${allocationCount} ${allocationCount === 1 ? 'Database' : 'Databases'}`;
    } else if (category.key === 'cache') {
        const redisTenants = tenants.filter(
            (t) => t.redisIndex !== null && t.redisIndex !== undefined,
        );
        allocationCount = redisTenants.length;
        allocationDetail = `${allocationCount} Redis DB ${allocationCount === 1 ? 'Index' : 'Indices'}`;
    } else if (category.key === 'storage') {
        const s3Tenants = tenants.filter((t) => Boolean(t.s3Bucket));
        allocationCount = s3Tenants.length;
        allocationDetail = `${allocationCount} S3 ${allocationCount === 1 ? 'Bucket' : 'Buckets'}`;
    } else {
        allocationDetail = 'Dedicated Service';
    }

    const spec = getEngineSpec(option.driver);

    // RAM calculation
    const usedMemMiB = parseMemoryToMiB(componentMetrics?.memory);
    const ramPercent = componentMetrics?.memory
        ? Math.min(100, Math.round((usedMemMiB / spec.memoryLimitMiB) * 100))
        : null;
    const memRemainingMiB = Math.max(
        0,
        spec.memoryLimitMiB - Math.round(usedMemMiB),
    );
    const ramTone =
        ramPercent === null
            ? 'auto'
            : ramPercent >= 85
              ? 'bad'
              : ramPercent >= 70
                ? 'warn'
                : 'ok';

    // CPU calculation
    const usedCpuMilli = parseCpuToMilli(componentMetrics?.cpu);
    const cpuPercent = componentMetrics?.cpu
        ? Math.min(100, Math.round((usedCpuMilli / spec.cpuLimitMilli) * 100))
        : null;
    const cpuRemainingMilli = Math.max(
        0,
        spec.cpuLimitMilli - Math.round(usedCpuMilli),
    );
    const cpuTone =
        cpuPercent === null
            ? 'auto'
            : cpuPercent >= 85
              ? 'bad'
              : cpuPercent >= 70
                ? 'warn'
                : 'ok';

    // Capacity / Connections calculation
    const isChrome =
        option.driver.toLowerCase().includes('chrome') ||
        option.driver.toLowerCase().includes('render');
    const usedCapacity = isChrome ? 1 : allocationCount;
    const capPercent = Math.min(
        100,
        Math.round((usedCapacity / spec.maxCapacity) * 100),
    );
    const capRemaining = Math.max(0, spec.maxCapacity - usedCapacity);
    const capTone =
        capPercent >= 85 ? 'bad' : capPercent >= 70 ? 'warn' : 'tools';

    const copyToClipboard = (text: string, label: string) => {
        void navigator.clipboard.writeText(text);
        setCopiedLabel(label);
        setTimeout(() => setCopiedLabel(null), 2000);
    };

    const internalDetail = option.details.find((d) => d.label === 'Internal');
    const publicDetail = option.details.find(
        (d) => d.label === 'Public' || d.label === 'Console',
    );

    return (
        <Card className="flex flex-col justify-between p-5 transition hover:border-brand/40">
            <div>
                {/* Header: Logo, Name, Category & Health Pulse */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-paper text-ink shadow-xs ring-1 ring-line/80">
                            {mark ?? <Server className="size-5 text-soft" />}
                        </span>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-semibold text-ink">
                                    {option.label}
                                </h3>
                                <span className="rounded bg-paper px-1.5 py-0.5 text-[10px] font-medium tracking-wider text-soft uppercase">
                                    {category.label}
                                </span>
                            </div>
                            <p className="mt-0.5 font-mono text-xs text-soft">
                                {allocationDetail}
                            </p>
                        </div>
                    </div>

                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                        Active
                    </span>
                </div>

                {/* Commons Limits & Health Radial Gauges */}
                <div className="mt-4 grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-paper/40 py-2.5 shadow-2xs">
                    {/* 1. RAM Radial */}
                    <div className="flex flex-col items-center justify-center px-1 text-center">
                        <RadialGauge
                            value={ramPercent}
                            displayValue={
                                ramPercent !== null ? `${ramPercent}%` : '—'
                            }
                            size="xs"
                            tone={ramTone}
                            className="p-0"
                        />
                        <span className="mt-1.5 text-[9.5px] font-semibold tracking-wider text-soft uppercase">
                            RAM
                        </span>
                        <span className="font-mono text-[9px] font-medium text-ink">
                            {usedMemMiB > 0
                                ? `${Math.round(usedMemMiB)}Mi`
                                : '—'}
                        </span>
                        <span className="text-[8.5px] text-faint">
                            {usedMemMiB > 0
                                ? `${memRemainingMiB}Mi left`
                                : 'Optimal'}
                        </span>
                    </div>

                    {/* 2. CPU Radial */}
                    <div className="flex flex-col items-center justify-center px-1 text-center">
                        <RadialGauge
                            value={cpuPercent}
                            displayValue={
                                cpuPercent !== null ? `${cpuPercent}%` : '—'
                            }
                            size="xs"
                            tone={cpuTone}
                            className="p-0"
                        />
                        <span className="mt-1.5 text-[9.5px] font-semibold tracking-wider text-soft uppercase">
                            CPU
                        </span>
                        <span className="font-mono text-[9px] font-medium text-ink">
                            {usedCpuMilli > 0
                                ? `${Math.round(usedCpuMilli)}m`
                                : '—'}
                        </span>
                        <span className="text-[8.5px] text-faint">
                            {usedCpuMilli > 0
                                ? `${cpuRemainingMilli}m left`
                                : 'Optimal'}
                        </span>
                    </div>

                    {/* 3. Capacity / Connections Radial */}
                    <div className="flex flex-col items-center justify-center px-1 text-center">
                        <RadialGauge
                            value={capPercent}
                            displayValue={`${usedCapacity}`}
                            size="xs"
                            tone={capTone}
                            className="p-0"
                        />
                        <span className="mt-1.5 truncate text-[9.5px] font-semibold tracking-wider text-soft uppercase">
                            {spec.capacityLabel}
                        </span>
                        <span className="font-mono text-[9px] font-medium text-ink">
                            {usedCapacity} / {spec.maxCapacity}
                        </span>
                        <span className="text-[8.5px] text-faint">
                            {capRemaining} left
                        </span>
                    </div>
                </div>

                {/* Connection Address & Links */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    {internalDetail && (
                        <button
                            type="button"
                            onClick={() =>
                                copyToClipboard(
                                    internalDetail.value || '',
                                    'internal',
                                )
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper/70 px-2.5 py-1 text-[11px] text-soft transition hover:border-brand hover:text-ink"
                            title="Click to copy cluster-internal address"
                        >
                            {copiedLabel === 'internal' ? (
                                <Check className="size-3 text-emerald-500" />
                            ) : (
                                <Copy className="size-3 text-faint" />
                            )}
                            <span className="max-w-[170px] truncate font-mono">
                                {internalDetail.value}
                            </span>
                        </button>
                    )}

                    {publicDetail && publicDetail.value && (
                        <a
                            href={publicDetail.value}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper/70 px-2.5 py-1 text-[11px] text-soft transition hover:border-brand hover:text-ink"
                            title="Open web console"
                        >
                            <ExternalLink className="size-3 text-faint" />
                            <span>{publicDetail.label}</span>
                        </a>
                    )}
                </div>
            </div>

            {/* Bottom Actions Bar */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3.5">
                <div className="flex flex-wrap items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onQuickConnect(option.driver)}
                        className="text-soft hover:text-ink"
                    >
                        <Code2 className="size-3.5" />
                        <span>Quick Connect</span>
                    </Button>

                    {companion?.url && (
                        <ExternalLinkButton
                            url={companion.url}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-soft transition hover:bg-paper hover:text-brand"
                            title={`Opens the shared ${companion.name} tool — it has no connection preset. Add one using your project's own host/user/password, shown on your project's page under "Local Dev Companions".`}
                        >
                            <ExternalLink className="size-3.5" />
                            <span>Open in {companion.name}</span>
                        </ExternalLinkButton>
                    )}
                </div>

                {allocationCount > 0 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onFilterByEngine(option.driver)}
                        className="text-soft hover:text-brand"
                    >
                        <Filter className="size-3.5" />
                        <span>Filter {allocationCount} Tenants</span>
                    </Button>
                )}
            </div>

            {companion?.url && (
                <p className="mt-2 text-[10px] leading-snug text-faint">
                    {companion.name} opens with no connection set up — each
                    tenant has its own credentials. Find yours on your
                    project&apos;s page, under{' '}
                    <span className="font-medium text-soft">
                        Local Dev Companions
                    </span>
                    .
                </p>
            )}
        </Card>
    );
}
