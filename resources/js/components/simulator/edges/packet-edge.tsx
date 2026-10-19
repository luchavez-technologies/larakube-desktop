import { memo } from 'react';
import { BaseEdge, getBezierPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';

export type PacketEdgeData = {
    isActive: boolean;
    isReturn: boolean;
    isFailed?: boolean;
    label?: string;
};

function PacketEdgeComponent({
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
}: EdgeProps & { data?: PacketEdgeData }) {
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    const isActive = data?.isActive ?? false;
    const isReturn = data?.isReturn ?? false;
    const isFailed = data?.isFailed ?? false;

    return (
        <>
            {/* Background Base Conduit */}
            <BaseEdge
                id={id}
                path={edgePath}
                markerEnd={markerEnd}
                style={{
                    strokeWidth: 3,
                    stroke: isActive
                        ? isFailed
                            ? '#f43f5e'
                            : isReturn
                              ? '#10b981'
                              : '#3b82f6'
                        : 'var(--color-line, #e4e4e8)',
                    opacity: isActive ? 1 : 0.6,
                    transition: 'all 0.3s ease',
                    ...style,
                }}
            />

            {/* Animated Traffic Conduit Pulses */}
            {isActive && (
                <>
                    <path
                        d={edgePath}
                        fill="none"
                        stroke={
                            isFailed
                                ? '#f43f5e'
                                : isReturn
                                  ? '#10b981'
                                  : '#3b82f6'
                        }
                        strokeWidth={5}
                        strokeDasharray="8,12"
                        className="animate-[dash_1s_linear_infinite]"
                        style={{
                            opacity: 0.8,
                            filter: 'drop-shadow(0 0 4px currentColor)',
                        }}
                    />

                    {/* Moving Glowing Packet Dot */}
                    <circle
                        r="5"
                        fill={
                            isFailed
                                ? '#ef4444'
                                : isReturn
                                  ? '#10b981'
                                  : '#38bdf8'
                        }
                    >
                        <animateMotion
                            path={edgePath}
                            dur={isReturn ? '0.8s' : '1.2s'}
                            repeatCount="indefinite"
                            keyPoints={isReturn ? '1;0' : '0;1'}
                            keyTimes="0;1"
                        />
                    </circle>
                </>
            )}

            {/* Edge Status Chip (if label exists) */}
            {data?.label && (
                <foreignObject
                    width={100}
                    height={24}
                    x={labelX - 50}
                    y={labelY - 12}
                    className="pointer-events-none overflow-visible"
                >
                    <div className="flex items-center justify-center">
                        <span
                            className={cn(
                                'rounded-full border px-2 py-0.5 font-mono text-[9px] font-medium shadow-xs backdrop-blur-md',
                                isActive
                                    ? isFailed
                                        ? 'border-rose-500/30 bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                        : isReturn
                                          ? 'border-ok/30 bg-ok/15 text-ok'
                                          : 'border-brand/30 bg-brand/15 text-brand'
                                    : 'border-line bg-surface/80 text-faint',
                            )}
                        >
                            {data.label}
                        </span>
                    </div>
                </foreignObject>
            )}
        </>
    );
}

export const PacketEdge = memo(PacketEdgeComponent);
