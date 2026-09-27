import { cn } from '@/lib/utils';

/** The LaraKube logo as flat squares: a blue tower over red, teal and purple cubes. */
export default function LogoMark({ className }: { className?: string }) {
    const cells: [number, number, string][] = [
        [0, 0, '#cfdff8'],
        [0, 1, '#5683e0'],
        [0, 2, '#4169c9'],
        [0, 3, '#d6412d'],
        [1, 3, '#2c9fc0'],
        [2, 3, '#8457e0'],
    ];

    return (
        <svg
            viewBox="0 0 24 24"
            className={cn('size-6', className)}
            aria-hidden="true"
        >
            {cells.map(([x, y, fill]) => (
                <rect
                    key={`${x}-${y}`}
                    x={x * 6}
                    y={y * 6}
                    width="5"
                    height="5"
                    rx="1"
                    fill={fill}
                />
            ))}
        </svg>
    );
}
