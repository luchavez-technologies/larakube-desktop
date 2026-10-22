import { memo } from 'react';
import { BaseEdge, getBezierPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';
import type { TopologyConduitData } from './types';

function getEdgeColor(serviceType: TopologyConduitData['serviceType']) {
    switch (serviceType) {
        case 'database':
            return {
                stroke: '#6366f1',
                bg: 'bg-indigo-500/15 border-indigo-500/30 text-indigo-600 dark:text-indigo-400',
            };
        case 'cache':
            return {
                stroke: '#f43f5e',
                bg: 'bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-400',
            };
        case 'storage':
            return {
                stroke: '#f59e0b',
                bg: 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400',
            };
        case 'render':
            return {
                stroke: '#06b6d4',
                bg: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-600 dark:text-cyan-400',
            };
        case 'search':
            return {
                stroke: '#d946ef',
                bg: 'bg-fuchsia-500/15 border-fuchsia-500/30 text-fuchsia-600 dark:text-fuchsia-400',
            };
        default:
            return {
                stroke: '#3b82f6',
                bg: 'bg-brand/15 border-brand/30 text-brand',
            };
    }
}

/** Staggers badge position along the curve based on service to avoid badge collisions */
function getServiceT(serviceType: TopologyConduitData['serviceType']) {
    switch (serviceType) {
        case 'database':
            return 0.32;
        case 'cache':
            return 0.46;
        case 'storage':
            return 0.6;
        case 'render':
            return 0.74;
        default:
            return 0.5;
    }
}

function getBezierPoint(
    sourceX: number,
    sourceY: number,
    targetX: number,
    targetY: number,
    t: number,
) {
    const dx = Math.abs(targetX - sourceX);
    const cp1x = sourceX + dx * 0.45;
    const cp1y = sourceY;
    const cp2x = targetX - dx * 0.45;
    const cp2y = targetY;

    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = t * t;
    const t3 = t2 * t;

    const x =
        mt3 * sourceX + 3 * mt2 * t * cp1x + 3 * mt * t2 * cp2x + t3 * targetX;
    const y =
        mt3 * sourceY + 3 * mt2 * t * cp1y + 3 * mt * t2 * cp2y + t3 * targetY;

    return { x, y };
}

function ConduitEdgeComponent({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    data,
}: EdgeProps & { data?: TopologyConduitData }) {
    const [edgePath] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    const isSelected = data?.isSelected ?? false;
    const isDimmed = data?.isDimmed ?? false;
    const isActive = data?.isActive ?? true;
    const serviceType = data?.serviceType ?? 'database';
    const visual = getEdgeColor(serviceType);
    const t = getServiceT(serviceType);
    const point = getBezierPoint(sourceX, sourceY, targetX, targetY, t);

    return (
        <g
            className="cursor-pointer"
            onClick={(e) => {
                e.stopPropagation();
                data?.onClick?.();
            }}
        >
            {/* Background Conduit */}
            <BaseEdge
                id={id}
                path={edgePath}
                markerEnd={markerEnd}
                style={{
                    strokeWidth: isSelected ? 4 : 2.5,
                    stroke: isSelected
                        ? visual.stroke
                        : 'var(--color-line, #e4e4e8)',
                    opacity: isSelected ? 1 : isDimmed ? 0.2 : 0.65,
                    transition: 'all 0.25s ease',
                    ...style,
                }}
            />

            {/* Animated Traffic Conduit Flow */}
            {isActive && !isDimmed && (
                <>
                    <path
                        d={edgePath}
                        fill="none"
                        stroke={visual.stroke}
                        strokeWidth={isSelected ? 4 : 2.5}
                        strokeDasharray="6,10"
                        className="animate-[dash_1.5s_linear_infinite]"
                        style={{
                            opacity: isSelected ? 1 : 0.75,
                            filter: isSelected
                                ? 'drop-shadow(0 0 6px currentColor)'
                                : 'none',
                        }}
                    />

                    {/* Animated Pulsing Data Packet */}
                    <circle r={isSelected ? '5' : '3.5'} fill={visual.stroke}>
                        <animateMotion
                            path={edgePath}
                            dur="2s"
                            repeatCount="indefinite"
                            keyPoints="0;1"
                            keyTimes="0;1"
                        />
                    </circle>
                </>
            )}

            {/* Elevated Port Badge (Staggered by service lane to avoid stacking collisions) */}
            {data?.label && !isDimmed && (
                <foreignObject
                    width={100}
                    height={24}
                    x={point.x - 50}
                    y={point.y - 12}
                    className="pointer-events-none overflow-visible"
                >
                    <div className="flex items-center justify-center">
                        <span
                            className={cn(
                                'rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold shadow-xs backdrop-blur-md transition-all duration-150',
                                isSelected
                                    ? 'scale-115 shadow-md ring-2 ring-brand/50'
                                    : 'opacity-85 hover:opacity-100',
                                visual.bg,
                            )}
                        >
                            {data.label}
                        </span>
                    </div>
                </foreignObject>
            )}
        </g>
    );
}

export const ConduitEdge = memo(ConduitEdgeComponent);
