import { useEffect } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

const OPTIONS = [
    { label: 'Off', value: 0 },
    { label: '5s', value: 5 },
    { label: '10s', value: 10 },
    { label: '30s', value: 30 },
];

/** The Off / 5s / 10s / 30s picker shared by every live card (pods, node metrics). */
export default function AutoRefreshToggle({
    value,
    onChange,
    title,
}: {
    value: number;
    onChange: (seconds: number) => void;
    title: string;
}) {
    return (
        <div
            className="flex items-center rounded-lg border border-line bg-surface/80 p-0.5 shadow-2xs"
            title={title}
        >
            <div className="flex items-center gap-1 px-1.5 text-[10px] font-semibold tracking-wider text-soft uppercase">
                <Clock className="size-3 text-soft" />
                <span className="hidden sm:inline-block">Auto</span>
            </div>
            {OPTIONS.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange(option.value)}
                    className={cn(
                        'rounded-md px-2 py-0.5 text-[11px] font-medium transition',
                        value === option.value
                            ? 'bg-brand/15 font-semibold text-brand shadow-2xs'
                            : 'text-soft hover:text-ink',
                    )}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

/**
 * Runs `reload` every `seconds` while the window is visible and `paused` is
 * false. 0 turns it off.
 */
export function useAutoRefresh(
    seconds: number,
    reload: () => void,
    paused = false,
): void {
    useEffect(() => {
        if (seconds <= 0) return;

        const timer = setInterval(() => {
            if (
                paused ||
                (typeof document !== 'undefined' && document.hidden)
            ) {
                return;
            }

            reload();
        }, seconds * 1000);

        return () => clearInterval(timer);
    }, [seconds, reload, paused]);
}
