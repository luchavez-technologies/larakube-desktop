import React, { useState } from 'react';

type Props = {
    data: number[];
    unit?: string;
    height?: number;
    width?: number;
    className?: string;
    type?: 'line' | 'bar';
};

export default function Sparkline({
    data,
    unit = '',
    height = 26,
    width = 110,
    className = '',
    type = 'line',
}: Props) {
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

    if (!data || data.length === 0) {
        return (
            <div
                className={`flex items-center justify-center font-mono text-[10px] text-faint ${className}`}
                style={{ height, width }}
            >
                No data
            </div>
        );
    }

    const min = Math.min(...data);
    const max = Math.max(...data, 1);
    const range = max - min || 1;
    const padding = 2;
    const innerHeight = height - padding * 2;
    const innerWidth = width - padding * 2;

    if (type === 'bar') {
        const barWidth = Math.max(3, Math.floor(innerWidth / data.length) - 2);
        return (
            <div className={`relative flex items-end gap-1 ${className}`}>
                <svg width={width} height={height} className="overflow-visible">
                    {data.map((val, idx) => {
                        const barHeight = Math.max(
                            3,
                            Math.round((val / max) * innerHeight),
                        );
                        const x =
                            padding +
                            idx * (innerWidth / Math.max(1, data.length - 1));
                        const y = height - padding - barHeight;
                        const isHovered = hoveredIdx === idx;

                        return (
                            <rect
                                key={idx}
                                x={x}
                                y={y}
                                width={barWidth}
                                height={barHeight}
                                rx={1.5}
                                className={
                                    isHovered
                                        ? 'fill-brand'
                                        : 'fill-brand/40 transition-colors hover:fill-brand/80'
                                }
                                onMouseEnter={() => setHoveredIdx(idx)}
                                onMouseLeave={() => setHoveredIdx(null)}
                            />
                        );
                    })}
                </svg>
                {hoveredIdx !== null && (
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-ink px-1.5 py-0.5 font-mono text-[9px] text-paper shadow-xs">
                        {data[hoveredIdx]}
                        {unit}
                    </div>
                )}
            </div>
        );
    }

    // Line / Area sparkline
    const points = data.map((val, idx) => {
        const x = padding + (idx / Math.max(1, data.length - 1)) * innerWidth;
        const y = height - padding - ((val - min) / range) * innerHeight;
        return [x, y];
    });

    const pathD = points.reduce(
        (acc, [x, y], i) => (i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`),
        '',
    );

    const activePoint = hoveredIdx !== null ? points[hoveredIdx] : null;

    return (
        <div className={`relative inline-flex items-center ${className}`}>
            <svg
                width={width}
                height={height}
                className="overflow-visible"
                onMouseLeave={() => setHoveredIdx(null)}
            >
                <path
                    d={pathD}
                    fill="none"
                    className="stroke-brand transition-all"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                {points.map(([x, y], idx) => (
                    <circle
                        key={idx}
                        cx={x}
                        cy={y}
                        r={hoveredIdx === idx ? 3.5 : 2}
                        className={
                            hoveredIdx === idx
                                ? 'fill-brand stroke-paper stroke-2'
                                : 'fill-brand/60'
                        }
                        onMouseEnter={() => setHoveredIdx(idx)}
                    />
                ))}
            </svg>
            {activePoint && hoveredIdx !== null && (
                <div
                    className="pointer-events-none absolute -top-5 rounded bg-ink px-1 py-0.5 font-mono text-[9px] text-paper shadow-xs"
                    style={{
                        left: `${activePoint[0]}px`,
                        transform: 'translateX(-50%)',
                    }}
                >
                    {data[hoveredIdx]}
                    {unit}
                </div>
            )}
        </div>
    );
}
