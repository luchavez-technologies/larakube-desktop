import { cn } from '@/lib/utils';

const tones = {
    ok: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    warn: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    bad: 'bg-setup-50 text-setup-500 ring-setup-500/20',
    busy: 'bg-brand-50 text-brand-700 ring-brand-600/20',
    muted: 'bg-slate-100 text-slate-600 ring-slate-500/20',
} as const;

export default function StatusPill({
    tone,
    children,
}: {
    tone: keyof typeof tones;
    children: string;
}) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
                tones[tone],
            )}
        >
            {tone === 'busy' && (
                <span className="size-1.5 animate-pulse rounded-full bg-brand-500" />
            )}
            {children}
        </span>
    );
}
