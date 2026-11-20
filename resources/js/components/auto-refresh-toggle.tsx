import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export const AUTO_REFRESH_OPTIONS = [
    { label: 'Off', value: 0 },
    { label: '5s', value: 5 },
    { label: '10s', value: 10 },
    { label: '30s', value: 30 },
];

/**
 * The Off / 5s / 10s / 30s picker for any view of live data (pods, node metrics, logs, queues).
 * Pair it with useAutoRefreshSetting() for the remembered value and useAutoRefresh() for the timer.
 */
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
            {AUTO_REFRESH_OPTIONS.map((option) => (
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

const STORAGE_PREFIX = 'larakube.autoRefresh.';

/**
 * The interval a view's picker is set to, remembered per view under `key` so it survives leaving the
 * page. Falls back to `defaultSeconds` when nothing valid is stored or storage is unavailable.
 */
export function useAutoRefreshSetting(
    key: string,
    defaultSeconds: number,
): [number, (seconds: number) => void] {
    const [seconds, setSeconds] = useState<number>(() => {
        try {
            const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
            const stored = Number(raw);
            return raw !== null &&
                AUTO_REFRESH_OPTIONS.some((option) => option.value === stored)
                ? stored
                : defaultSeconds;
        } catch {
            return defaultSeconds;
        }
    });

    const update = (next: number) => {
        setSeconds(next);
        try {
            window.localStorage.setItem(STORAGE_PREFIX + key, String(next));
        } catch {
            // Storage blocked: the choice still applies for this visit.
        }
    };

    return [seconds, update];
}
