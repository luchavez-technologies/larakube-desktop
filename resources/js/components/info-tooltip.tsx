import { Info } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = {
    children: ReactNode;
    className?: string;
    /** Which edge of the trigger the panel hangs from — pick 'right' when the trigger sits near a right-hand edge (a drawer, a narrow column) so the panel only grows leftward. */
    align?: 'center' | 'right';
    /** Which side of the trigger the panel opens toward. Pick 'bottom' when the trigger sits near the top of its scroll area (a page heading, a list's first row) so the panel has room to grow without covering content above it. */
    side?: 'top' | 'bottom';
};

const panelAlign: Record<NonNullable<Props['align']>, string> = {
    center: 'left-1/2 -translate-x-1/2',
    right: 'right-0',
};

const panelSide: Record<NonNullable<Props['side']>, string> = {
    top: 'bottom-full mb-1.5',
    bottom: 'top-full mt-1.5',
};

/**
 * A small "?" info affordance for explaining a badge or label inline, without
 * needing a real nested <button> (so it's safe inside already-clickable rows).
 */
export default function InfoTooltip({
    children,
    className,
    align = 'center',
    side = 'top',
}: Props) {
    const [open, setOpen] = useState(false);

    return (
        <span
            className={cn('relative inline-flex', className)}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            onClick={(event) => event.stopPropagation()}
        >
            <span
                tabIndex={0}
                role="button"
                aria-label="More information"
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                className="inline-flex size-3.5 cursor-help items-center justify-center rounded-full text-faint outline-none hover:text-soft"
            >
                <Info className="size-3.5" />
            </span>

            {open && (
                <div
                    role="tooltip"
                    className={cn(
                        'animate-in fade-in zoom-in-95 pointer-events-none absolute z-50 w-52 rounded-xl bg-ink px-3 py-2 text-[11px] leading-relaxed text-surface shadow-2xl duration-100',
                        panelAlign[align],
                        panelSide[side],
                    )}
                >
                    {children}
                </div>
            )}
        </span>
    );
}
