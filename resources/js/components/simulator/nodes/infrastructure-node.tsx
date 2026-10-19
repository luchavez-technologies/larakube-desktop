import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import {
    Laptop,
    Shield,
    Network,
    Layers,
    Cpu,
    Database,
    AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SimulatorHop } from '../types';

export type InfrastructureNodeData = {
    hop: SimulatorHop;
    isActive: boolean;
    isVisited: boolean;
    isFailed?: boolean;
    onClick?: () => void;
};

const ICON_MAP = {
    Laptop,
    Shield,
    Network,
    Layers,
    Cpu,
    Database,
    AlertTriangle,
};

function InfrastructureNodeComponent({
    data,
}: NodeProps & { data: InfrastructureNodeData }) {
    const { hop, isActive, isVisited, isFailed } = data;
    const IconComponent = ICON_MAP[hop.icon as keyof typeof ICON_MAP] ?? Layers;

    return (
        <div
            onClick={data.onClick}
            className={cn(
                'group relative flex min-w-[210px] cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-3 shadow-md backdrop-blur-md transition-all duration-300',
                isActive
                    ? 'z-10 scale-105 border-brand bg-surface shadow-xl ring-2 ring-brand/40'
                    : isFailed
                      ? 'border-rose-500/80 bg-rose-500/10 ring-1 ring-rose-500/30'
                      : isVisited
                        ? 'border-ok/50 bg-surface/90 hover:border-brand/60'
                        : 'border-line bg-surface/70 hover:border-soft/40',
            )}
        >
            {/* Input Port */}
            <Handle
                type="target"
                position={Position.Left}
                className={cn(
                    '!size-2.5 !border-2 !border-surface transition-colors',
                    isActive ? '!bg-brand' : isVisited ? '!bg-ok' : '!bg-line',
                )}
            />

            {/* Icon Avatar with Active Ping */}
            <div className="relative flex shrink-0 items-center justify-center">
                {isActive && (
                    <span className="absolute inline-flex size-full animate-ping rounded-xl bg-brand opacity-60" />
                )}
                <div
                    className={cn(
                        'flex size-10 items-center justify-center rounded-xl transition-colors',
                        isActive
                            ? 'bg-brand text-white shadow-sm'
                            : isFailed
                              ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                              : isVisited
                                ? 'bg-ok/15 text-ok'
                                : 'bg-badge text-soft group-hover:text-ink',
                    )}
                >
                    <IconComponent className="size-5" />
                </div>
            </div>

            {/* Text Information */}
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-semibold tracking-wider text-soft uppercase">
                        {hop.layer.split('•')[0]?.trim()}
                    </span>
                    <span
                        className={cn(
                            'py-0.2 rounded-full px-1.5 font-mono text-[9px] leading-tight',
                            isFailed
                                ? 'bg-rose-500/15 font-semibold text-rose-600 dark:text-rose-400'
                                : isActive
                                  ? 'bg-brand/15 font-semibold text-brand'
                                  : isVisited
                                    ? 'bg-ok/15 text-ok'
                                    : 'bg-paper text-faint',
                        )}
                    >
                        {hop.badge}
                    </span>
                </div>

                <div className="mt-0.5 truncate text-xs font-semibold text-ink group-hover:text-brand">
                    {hop.title}
                </div>
                <div className="truncate font-mono text-[9.5px] text-soft">
                    {hop.subtitle}
                </div>
            </div>

            {/* Output Port */}
            <Handle
                type="source"
                position={Position.Right}
                className={cn(
                    '!size-2.5 !border-2 !border-surface transition-colors',
                    isActive ? '!bg-brand' : isVisited ? '!bg-ok' : '!bg-line',
                )}
            />
        </div>
    );
}

export const InfrastructureNode = memo(InfrastructureNodeComponent);
