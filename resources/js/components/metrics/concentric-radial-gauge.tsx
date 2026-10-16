import React from 'react';
import { cn } from '@/lib/utils';

export type ConcentricRing = {
    value: number | null;
    label: string;
    tone?: 'emerald' | 'cyan' | 'violet' | 'auto';
    displayValue?: string;
    usageText?: string;
};

type Props = {
    rings: [ConcentricRing, ConcentricRing, ConcentricRing];
    size?: number;
    className?: string;
    children?: React.ReactNode;
    title?: string;
};

function getRingColor(
    val: number | null,
    defaultColor: 'emerald' | 'sky' | 'violet',
): string {
    if (val === null || isNaN(val)) {
        return 'stroke-line/40';
    }
    const safe = Math.min(100, Math.max(0, val));
    if (safe >= 85) {
        return 'stroke-rose-500 dark:stroke-rose-400';
    }
    if (safe >= 70) {
        return 'stroke-amber-500 dark:stroke-amber-400';
    }
    if (defaultColor === 'sky') {
        return 'stroke-sky-500 dark:stroke-sky-400';
    }
    if (defaultColor === 'violet') {
        return 'stroke-violet-500 dark:stroke-violet-400';
    }
    return 'stroke-emerald-500 dark:stroke-emerald-400';
}

export default function ConcentricRadialGauge({
    rings,
    size = 42,
    className,
    children,
    title,
}: Props) {
    const [ring1, ring2, ring3] = rings;

    // Outer ring (RAM)
    const r1 = 17;
    const c1 = 2 * Math.PI * r1;
    const val1 =
        ring1.value === null ? 0 : Math.min(100, Math.max(0, ring1.value));
    const offset1 = ring1.value === null ? c1 : c1 - (val1 / 100) * c1;
    const stroke1 = getRingColor(ring1.value, 'emerald');

    // Middle ring (CPU)
    const r2 = 12.5;
    const c2 = 2 * Math.PI * r2;
    const val2 =
        ring2.value === null ? 0 : Math.min(100, Math.max(0, ring2.value));
    const offset2 = ring2.value === null ? c2 : c2 - (val2 / 100) * c2;
    const stroke2 = getRingColor(ring2.value, 'sky');

    // Inner ring (Capacity / Connections)
    const r3 = 8;
    const c3 = 2 * Math.PI * r3;
    const val3 =
        ring3.value === null ? 0 : Math.min(100, Math.max(0, ring3.value));
    const offset3 = ring3.value === null ? c3 : c3 - (val3 / 100) * c3;
    const stroke3 = getRingColor(ring3.value, 'violet');

    return (
        <div
            className={cn(
                'relative flex shrink-0 items-center justify-center',
                className,
            )}
            style={{ width: size, height: size }}
            title={title}
        >
            <svg
                width={size}
                height={size}
                viewBox="0 0 42 42"
                className="-rotate-90 transform"
            >
                {/* Ring 1 (RAM) Track */}
                <circle
                    cx="21"
                    cy="21"
                    r={r1}
                    className="fill-transparent stroke-line/30 dark:stroke-line/40"
                    strokeWidth="2.7"
                />
                {/* Ring 1 (RAM) Active */}
                <circle
                    cx="21"
                    cy="21"
                    r={r1}
                    className={cn(
                        'fill-transparent transition-all duration-700 ease-out',
                        stroke1,
                    )}
                    strokeWidth="2.7"
                    strokeDasharray={c1}
                    strokeDashoffset={offset1}
                    strokeLinecap="round"
                />

                {/* Ring 2 (CPU) Track */}
                <circle
                    cx="21"
                    cy="21"
                    r={r2}
                    className="fill-transparent stroke-line/30 dark:stroke-line/40"
                    strokeWidth="2.6"
                />
                {/* Ring 2 (CPU) Active */}
                <circle
                    cx="21"
                    cy="21"
                    r={r2}
                    className={cn(
                        'fill-transparent transition-all duration-700 ease-out',
                        stroke2,
                    )}
                    strokeWidth="2.6"
                    strokeDasharray={c2}
                    strokeDashoffset={offset2}
                    strokeLinecap="round"
                />

                {/* Ring 3 (Capacity) Track */}
                <circle
                    cx="21"
                    cy="21"
                    r={r3}
                    className="fill-transparent stroke-line/30 dark:stroke-line/40"
                    strokeWidth="2.4"
                />
                {/* Ring 3 (Capacity) Active */}
                <circle
                    cx="21"
                    cy="21"
                    r={r3}
                    className={cn(
                        'fill-transparent transition-all duration-700 ease-out',
                        stroke3,
                    )}
                    strokeWidth="2.4"
                    strokeDasharray={c3}
                    strokeDashoffset={offset3}
                    strokeLinecap="round"
                />
            </svg>

            {/* Center Core Slot */}
            <div className="absolute inset-0 flex items-center justify-center">
                {children}
            </div>
        </div>
    );
}
