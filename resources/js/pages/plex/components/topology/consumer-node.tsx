import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Database, Globe, HardDrive, Layers, Zap } from 'lucide-react';
import FrameworkLogo from '@/components/framework-logo';
import ToolLogo from '@/components/tool-logo';
import { cn } from '@/lib/utils';
import type { TopologyConsumerNodeData } from './types';

function ConsumerNodeComponent({
    data,
}: NodeProps & { data: TopologyConsumerNodeData }) {
    const { consumer, isSelected, connectedCount, onClick } = data;
    const isApp = consumer.kind === 'app';
    const isTool = consumer.kind === 'tool';
    const isCustom = consumer.kind === 'custom';

    const displayName = isApp
        ? consumer.project.name
        : isTool
          ? consumer.tool.name
          : consumer.tenant.name;

    const displaySubtitle = isApp
        ? consumer.project.webHost || `${consumer.project.name}.dev.test`
        : isTool
          ? consumer.tool.tagline || 'Cluster Companion Tool'
          : 'External Custom Workload';

    return (
        <div
            onClick={onClick}
            className={cn(
                'group relative flex w-[240px] cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-3 shadow-md backdrop-blur-md transition-all duration-200 select-none',
                isSelected
                    ? 'z-20 scale-102 border-brand bg-surface shadow-xl ring-2 ring-brand/50'
                    : isTool
                      ? 'border-line/80 bg-surface/95 hover:border-tools/40 hover:shadow-lg'
                      : isCustom
                        ? 'border-line/80 bg-surface/95 hover:border-emerald-500/40 hover:shadow-lg'
                        : 'border-line bg-surface/95 hover:border-brand/40 hover:shadow-lg',
            )}
        >
            {/* Logo Avatar */}
            <div className="shrink-0">
                {isApp ? (
                    <FrameworkLogo
                        slug={consumer.project.framework}
                        size="sm"
                    />
                ) : isTool ? (
                    <ToolLogo
                        tool={
                            consumer.tool.clusterTool ?? {
                                tool: consumer.tool.slug,
                            }
                        }
                        size="sm"
                    />
                ) : (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/25 dark:text-emerald-400">
                        <Layers className="size-4" />
                    </span>
                )}
            </div>

            {/* Consumer Info */}
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs font-bold text-ink">
                        {displayName}
                    </span>
                    <span
                        className={cn(
                            'rounded-md px-1.5 py-0.5 font-mono text-[9px] font-semibold',
                            isTool
                                ? 'bg-tools/10 text-tools'
                                : isCustom
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : connectedCount > 0
                                    ? 'bg-brand/10 text-brand'
                                    : 'bg-paper text-faint',
                        )}
                    >
                        {isTool
                            ? 'Tool'
                            : isCustom
                              ? 'Custom'
                              : connectedCount > 0
                                ? `${connectedCount} Commons`
                                : 'Standalone'}
                    </span>
                </div>

                <div className="mt-0.5 truncate font-mono text-[10px] text-faint">
                    {displaySubtitle}
                </div>

                {/* Backing Badges Row */}
                <div className="mt-2 flex items-center gap-1.5 overflow-hidden">
                    {/* Database badge */}
                    {((isApp &&
                        consumer.project.database &&
                        consumer.project.database !== 'sqlite') ||
                        (isTool && consumer.tool.databases.length > 0) ||
                        (isCustom && Boolean(consumer.tenant.database))) && (
                        <span
                            className="inline-flex items-center gap-0.5 rounded bg-tools/10 px-1 py-0.5 font-mono text-[8.5px] font-medium text-tools"
                            title="Connected to Database"
                        >
                            <Database className="size-2.5" />
                            <span>DB</span>
                        </span>
                    )}

                    {/* Redis badge */}
                    {((isApp &&
                        (consumer.project.cache === 'redis' ||
                            consumer.project.plex.includes('redis'))) ||
                        (isTool && consumer.tool.redisIndexes.length > 0) ||
                        (isCustom &&
                            consumer.tenant.redisIndex !== null &&
                            consumer.tenant.redisIndex !== undefined)) && (
                        <span
                            className="inline-flex items-center gap-0.5 rounded bg-rose-500/10 px-1 py-0.5 font-mono text-[8.5px] font-medium text-rose-600 dark:text-rose-400"
                            title="Connected to Redis"
                        >
                            <Zap className="size-2.5" />
                            <span>REDIS</span>
                        </span>
                    )}

                    {/* S3 Storage badge */}
                    {((isApp &&
                        (consumer.project.objectStorage ||
                            consumer.project.plex.includes('s3'))) ||
                        (isTool && consumer.tool.s3Buckets.length > 0) ||
                        (isCustom && Boolean(consumer.tenant.s3Bucket))) && (
                        <span
                            className="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1 py-0.5 font-mono text-[8.5px] font-medium text-amber-600 dark:text-amber-400"
                            title="Connected to Object Storage"
                        >
                            <HardDrive className="size-2.5" />
                            <span>S3</span>
                        </span>
                    )}

                    {/* Headless Chrome / Render badge */}
                    {((isApp &&
                        (consumer.project.plex.includes('headless-chrome') ||
                            consumer.project.plex.includes('chrome') ||
                            consumer.project.plex.includes('render'))) ||
                        (isTool && consumer.tool.usesRender)) && (
                        <span
                            className="inline-flex items-center gap-0.5 rounded bg-cyan-500/10 px-1 py-0.5 font-mono text-[8.5px] font-medium text-cyan-600 dark:text-cyan-400"
                            title="Connected to Headless Chrome (CDP PDF Rendering)"
                        >
                            <Globe className="size-2.5" />
                            <span>RENDER</span>
                        </span>
                    )}

                    {connectedCount === 0 && isApp && (
                        <span className="text-[9px] text-faint italic">
                            No database socket
                        </span>
                    )}
                </div>
            </div>

            {/* Output Source Handle for Conduits */}
            <Handle
                type="source"
                position={Position.Right}
                className={cn(
                    '!size-2.5 !border-2 !border-surface transition-colors',
                    isSelected
                        ? '!bg-brand'
                        : '!bg-line group-hover:!bg-brand/60',
                )}
            />
        </div>
    );
}

export const ConsumerNode = memo(ConsumerNodeComponent);
