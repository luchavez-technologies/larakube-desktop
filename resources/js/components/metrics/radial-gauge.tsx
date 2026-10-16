import React from 'react';
import { cn } from '@/lib/utils';

type Props = {
    value: number | null;
    label?: string;
    subtext?: string | null;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    tone?: 'ok' | 'warn' | 'bad' | 'tools' | 'brand' | 'auto';
    unit?: string;
    displayValue?: string | React.ReactNode;
    direction?: 'higher-is-better' | 'lower-is-better';
    className?: string;
};

export default function RadialGauge({
    value,
    label,
    subtext,
    size = 'md',
    tone = 'auto',
    unit = '%',
    displayValue,
    direction = 'lower-is-better',
    className,
}: Props) {
    const isWarmingUp = value === null || isNaN(value);
    const safeValue = isWarmingUp ? 0 : Math.min(100, Math.max(0, value));

    const dimensions = {
        xs: { size: 44, stroke: 4, radius: 16, fontSize: 'text-[10px]' },
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
        : resolvedTone === 'tools'
          ? 'stroke-tools'
          : resolvedTone === 'brand'
            ? 'stroke-brand'
            : resolvedTone === 'bad'
              ? 'stroke-rose-500 dark:stroke-rose-400'
              : resolvedTone === 'warn'
                ? 'stroke-amber-500 dark:stroke-amber-400'
                : 'stroke-emerald-500 dark:stroke-emerald-400';

    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center p-3 text-center',
                className,
            )}
        >
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
                        {isWarmingUp
                            ? '—'
                            : (displayValue ?? `${safeValue}${unit}`)}
                    </span>
                </div>
            </div>

            {label && (
                <p className="mt-2 text-xs font-medium text-ink">{label}</p>
            )}
            {subtext && (
                <p className="font-mono text-[11px] text-faint">{subtext}</p>
            )}
        </div>
    );
}
