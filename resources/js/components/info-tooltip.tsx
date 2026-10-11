import { Info } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

type Props = {
    children: ReactNode;
    className?: string;
    /** What's hovered/focused to reveal the panel. Defaults to a small "i" icon — pass a bigger element (a badge, an icon) to make that itself the trigger, instead of adding a separate "i" next to it. */
    trigger?: ReactNode;
    /** Which edge of the trigger the panel hangs from when `side` is 'top' or 'bottom' — pick 'right' when the trigger sits near a right-hand edge (a drawer, a narrow column) so the panel only grows leftward. Ignored when `side` is 'left' or 'right', since those already pick a horizontal direction. */
    align?: 'center' | 'right';
    /** Which side of the trigger the panel opens toward. Pick 'bottom' when the trigger sits near the top of its scroll area (a page heading, a list's first row). Pick 'right' or 'left' when the trigger sits in a column too narrow for the panel's own width (a sidebar), so it opens into the wider area beside the column instead of clipping within it. */
    side?: 'top' | 'bottom' | 'right' | 'left';
};

const GAP = 6;

/** Fixed-position coordinates for the panel, computed from the trigger's own live screen position — not CSS relative/absolute positioning, which a narrow or `overflow`/stacking-context ancestor (a sidebar, a sticky header) can clip or bury behind itself regardless of z-index. */
function place(
    rect: DOMRect,
    side: NonNullable<Props['side']>,
    align: NonNullable<Props['align']>,
): { top: number; left: number; transform: string } {
    switch (side) {
        case 'right':
            return {
                top: rect.top + rect.height / 2,
                left: rect.right + GAP,
                transform: 'translateY(-50%)',
            };
        case 'left':
            return {
                top: rect.top + rect.height / 2,
                left: rect.left - GAP,
                transform: 'translate(-100%, -50%)',
            };
        case 'bottom':
            return {
                top: rect.bottom + GAP,
                left:
                    align === 'right' ? rect.right : rect.left + rect.width / 2,
                transform:
                    align === 'right'
                        ? 'translateX(-100%)'
                        : 'translateX(-50%)',
            };
        case 'top':
        default:
            return {
                top: rect.top - GAP,
                left:
                    align === 'right' ? rect.right : rect.left + rect.width / 2,
                transform:
                    align === 'right'
                        ? 'translate(-100%, -100%)'
                        : 'translate(-50%, -100%)',
            };
    }
}

/**
 * A small "?" info affordance for explaining a badge or label inline, without
 * needing a real nested <button> (so it's safe inside already-clickable rows).
 * The panel itself renders through a portal at a fixed, measured position —
 * never nested CSS-relative inside the trigger — so it's never clipped by a
 * narrow or `overflow` ancestor and always paints above a sticky sibling
 * (e.g. a filter bar), regardless of either one's stacking context.
 */
export default function InfoTooltip({
    children,
    trigger,
    className,
    align = 'center',
    side = 'top',
}: Props) {
    const [open, setOpen] = useState(false);
    const anchorRef = useRef<HTMLSpanElement>(null);
    const [position, setPosition] = useState<{
        top: number;
        left: number;
        transform: string;
    } | null>(null);

    useEffect(() => {
        if (!open || !anchorRef.current) {
            setPosition(null);
            return;
        }
        setPosition(
            place(anchorRef.current.getBoundingClientRect(), side, align),
        );
    }, [open, side, align]);

    return (
        <span
            className={cn('relative inline-flex', className)}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            onClick={(event) => event.stopPropagation()}
        >
            <span
                ref={anchorRef}
                tabIndex={0}
                role="button"
                aria-label="More information"
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                className={cn(
                    'inline-flex cursor-help items-center outline-none',
                    trigger
                        ? undefined
                        : 'size-3.5 justify-center rounded-full text-faint hover:text-soft',
                )}
            >
                {trigger ?? <Info className="size-3.5" />}
            </span>

            {open &&
                position &&
                createPortal(
                    <div
                        role="tooltip"
                        style={{
                            top: position.top,
                            left: position.left,
                            transform: position.transform,
                        }}
                        className="animate-in fade-in zoom-in-95 pointer-events-none fixed z-[100] w-52 rounded-xl bg-ink px-3 py-2 text-[11px] leading-relaxed whitespace-normal text-surface shadow-2xl duration-100"
                    >
                        {children}
                    </div>,
                    document.body,
                )}
        </span>
    );
}
