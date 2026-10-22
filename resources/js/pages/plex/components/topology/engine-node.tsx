import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Users } from 'lucide-react';
import ToolLogo from '@/components/tool-logo';
import { cn } from '@/lib/utils';
import type { TopologyEngineNodeData } from './types';

function EngineNodeComponent({
    data,
}: NodeProps & { data: TopologyEngineNodeData }) {
    const {
        driver,
        label,
        categoryLabel,
        port,
        ready,
        tenantsCount,
        isSelected,
    } = data;

    const normalizedDriver = driver.toLowerCase();
    const compMetrics =
        data.podMetrics?.components?.[normalizedDriver] ||
        data.podMetrics?.components?.[normalizedDriver.replace('fs', '')] ||
        (normalizedDriver.includes('chrome') ||
        normalizedDriver.includes('headless')
            ? data.podMetrics?.components?.['headless-shell'] ||
              data.podMetrics?.components?.['chrome']
            : null);

    return (
        <div
            onClick={data.onClick}
            className={cn(
                'group relative flex w-[240px] cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-3 shadow-md backdrop-blur-md transition-all duration-200 select-none',
                isSelected
                    ? 'z-20 scale-102 border-brand bg-surface shadow-xl ring-2 ring-brand/50'
                    : 'border-line bg-surface/95 hover:border-brand/40 hover:shadow-lg',
            )}
        >
            {/* Input Handle for Conduits */}
            <Handle
                type="target"
                position={Position.Left}
                className={cn(
                    '!size-2.5 !border-2 !border-surface transition-colors',
                    isSelected
                        ? '!bg-brand'
                        : '!bg-line group-hover:!bg-brand/60',
                )}
            />

            {/* Engine Brand Logo */}
            <ToolLogo slug={driver} size="md" className="shrink-0 shadow-2xs" />

            {/* Details */}
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs font-bold text-ink">
                        {label}
                    </span>
                    <span
                        className={cn(
                            'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium',
                            ready ? 'bg-ok/10 text-ok' : 'bg-paper text-faint',
                        )}
                    >
                        <span
                            className={cn(
                                'size-1.5 rounded-full',
                                ready ? 'animate-pulse bg-ok' : 'bg-faint',
                            )}
                        />
                        {ready ? 'Ready' : 'Standby'}
                    </span>
                </div>

                <div className="mt-0.5 flex items-center gap-2">
                    <span className="font-mono text-[10px] text-faint">
                        {categoryLabel}
                    </span>
                    {port && (
                        <span className="py-0.2 rounded bg-paper px-1 font-mono text-[9px] text-soft">
                            :{port}
                        </span>
                    )}
                </div>

                {/* Tenants Connected Counter & Resource Metrics */}
                <div className="mt-2 flex items-center justify-between text-[10px] font-medium text-soft">
                    <div className="flex items-center gap-1">
                        <Users className="size-3 text-faint" />
                        <span>
                            {tenantsCount === 1
                                ? '1 consumer'
                                : `${tenantsCount} consumers`}
                        </span>
                    </div>

                    {compMetrics && (
                        <span
                            className="font-mono text-[9px] text-faint"
                            title={`Pod CPU: ${compMetrics.cpu}, Memory: ${compMetrics.memory}`}
                        >
                            {compMetrics.cpu} · {compMetrics.memory}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

export const EngineNode = memo(EngineNodeComponent);
