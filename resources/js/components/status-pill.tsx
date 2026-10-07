import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const tones = {
    ok: 'bg-ok-tint text-ok',
    warn: 'bg-warn-tint text-warn',
    bad: 'bg-accent-tint text-accent',
    busy: 'bg-busy-tint text-busy',
    muted: 'bg-badge text-soft',
} as const;

export type Tone = keyof typeof tones;

export default function StatusPill({
    tone,
    children,
}: {
    tone: Tone;
    children: ReactNode;
}) {
    const dot = tone === 'ok' || tone === 'bad' || tone === 'busy';

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
                tones[tone],
            )}
        >
            {dot && (
                <span
                    className={cn(
                        'size-1.5 rounded-full bg-current',
                        tone === 'busy' && 'animate-pulse',
                    )}
                />
            )}
            {children}
        </span>
    );
}
