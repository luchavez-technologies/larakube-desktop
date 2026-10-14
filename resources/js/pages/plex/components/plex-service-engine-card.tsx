import { useState } from 'react';
import {
    Activity,
    Check,
    Code2,
    Copy,
    ExternalLink,
    Filter,
    Server,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import { brandIcon } from '@/components/tool-logo';
import type {
    PlexServiceCategoryDetail,
    PlexServiceOptionDetail,
    PlexTenant,
    PodMetrics,
} from '@/types/larakube';

export default function PlexServiceEngineCard({
    category,
    option,
    podMetrics,
    tenants,
    onFilterByEngine,
    onQuickConnect,
}: {
    category: PlexServiceCategoryDetail;
    option: PlexServiceOptionDetail;
    podMetrics?: PodMetrics | null;
    tenants: PlexTenant[];
    onFilterByEngine: (driver: string) => void;
    onQuickConnect: (driver: string) => void;
}) {
    const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

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

                {/* Telemetry Chips */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    {componentMetrics ? (
                        <div className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper/70 px-2.5 py-1 font-mono text-[11px] text-ink">
                            <Activity className="size-3 text-soft" />
                            <span>{componentMetrics.memory}</span>
                            <span className="text-line">/</span>
                            <span>{componentMetrics.cpu}</span>
                            {componentMetrics.podCount > 1 && (
                                <span className="text-soft">
                                    (×{componentMetrics.podCount})
                                </span>
                            )}
                        </div>
                    ) : (
                        <div className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper/50 px-2.5 py-1 text-[11px] text-soft">
                            <Activity className="size-3 text-faint" />
                            <span>Workload Ready</span>
                        </div>
                    )}

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
            <div className="mt-5 flex items-center justify-between gap-2 border-t border-line/60 pt-3.5">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onQuickConnect(option.driver)}
                    className="text-soft hover:text-ink"
                >
                    <Code2 className="size-3.5" />
                    <span>Quick Connect</span>
                </Button>

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
        </Card>
    );
}
