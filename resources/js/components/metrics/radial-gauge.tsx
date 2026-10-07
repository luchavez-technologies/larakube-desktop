import React from 'react';
import { cn } from '@/lib/utils';

type Props = {
    value: number | null;
    label: string;
    subtext?: string | null;
    size?: 'sm' | 'md' | 'lg';
    tone?: 'ok' | 'warn' | 'bad' | 'auto';
    unit?: string;
    direction?: 'higher-is-better' | 'lower-is-better';
};

export default function RadialGauge({
    value,
    label,
    subtext,
    size = 'md',
    tone = 'auto',
    unit = '%',
    direction = 'lower-is-better',
}: Props) {
    const isWarmingUp = value === null || isNaN(value);
    const safeValue = isWarmingUp ? 0 : Math.min(100, Math.max(0, value));

    const dimensions = {
        sm: { size: 68, stroke: 6, radius: 26, fontSize: 'text-xs' },
        md: { size: 92, stroke: 8, radius: 36, fontSize: 'text-base' },
        lg: { size: 120, stroke: 10, radius: 48, fontSize: 'text-xl' },
    }[size];

    const circumference = 2 * Math.PI * dimensions.radius;
    const strokeDashoffset = circumference - (safeValue / 100) * circumference;

    const resolvedTone =
        tone === 'auto'
            ? direction === 'higher-is-better'
                ? safeValue >= 80
                    ? 'ok'
                    : safeValue >= 60
                      ? 'warn'
                      : 'bad'
                : safeValue >= 85
                  ? 'bad'
                  : safeValue >= 70
                    ? 'warn'
                    : 'ok'
            : tone;

    const strokeColor = isWarmingUp
        ? 'stroke-line'
        : resolvedTone === 'bad'
          ? 'stroke-rose-500 dark:stroke-rose-400'
          : resolvedTone === 'warn'
            ? 'stroke-amber-500 dark:stroke-amber-400'
            : 'stroke-emerald-500 dark:stroke-emerald-400';

    return (
        <div className="flex flex-col items-center justify-center p-3 text-center">
            <div
                className="relative flex items-center justify-center"
                style={{ width: dimensions.size, height: dimensions.size }}
            >
                <svg
                    width={dimensions.size}
                    height={dimensions.size}
                    className="-rotate-90 transform"
                >
                    {/* Background Track */}
                    <circle
                        cx={dimensions.size / 2}
                        cy={dimensions.size / 2}
                        r={dimensions.radius}
                        className="fill-transparent stroke-line/50"
                        strokeWidth={dimensions.stroke}
                    />
                    {/* Active Value Ring */}
                    <circle
                        cx={dimensions.size / 2}
                        cy={dimensions.size / 2}
                        r={dimensions.radius}
                        className={cn(
                            'fill-transparent transition-all duration-700 ease-out',
                            strokeColor,
                        )}
                        strokeWidth={dimensions.stroke}
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                    />
                </svg>

                {/* Inner Text Value */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span
                        className={cn(
                            'font-mono font-semibold tracking-tight text-ink',
                            dimensions.fontSize,
                        )}
                    >
                        {isWarmingUp ? '—' : `${safeValue}${unit}`}
                    </span>
                </div>
            </div>

            <p className="mt-2 text-xs font-medium text-ink">{label}</p>
            {subtext && (
                <p className="font-mono text-[11px] text-faint">{subtext}</p>
            )}
        </div>
    );
}
