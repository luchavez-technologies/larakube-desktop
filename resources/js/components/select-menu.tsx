import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type SelectMenuOption = {
    value: string;
    label: ReactNode;
    description?: ReactNode;
    badge?: ReactNode;
    icon?: ReactNode;
    disabled?: boolean;
    /** Options sharing a group render under one heading — pre-sort so same-group rows are adjacent. */
    group?: string;
};

type Accent = 'brand' | 'servers' | 'tools' | 'setup';

const accentRing: Record<Accent, { open: string; hover: string }> = {
    brand: {
        open: 'ring-2 ring-brand',
        hover: 'ring-line hover:ring-brand/50',
    },
    servers: {
        open: 'ring-2 ring-servers',
        hover: 'ring-line hover:ring-servers/50',
    },
    tools: {
        open: 'ring-2 ring-tools',
        hover: 'ring-line hover:ring-tools/50',
    },
    setup: {
        open: 'ring-2 ring-setup',
        hover: 'ring-line hover:ring-setup/50',
    },
};

type Props = {
    value: string;
    options: SelectMenuOption[];
    onChange: (value: string) => void;
    placeholder?: string;
    /** Small uppercase heading inside the panel, e.g. "CLUSTER DOMAINS & ZONES". */
    panelLabel?: string;
    /** Extra row(s) rendered after the options, below a divider — e.g. "+ Enter custom domain…". */
    footer?: ReactNode;
    accent?: Accent;
    /** Mirrors the selection into a hidden input, so this still participates in an Inertia <Form> POST by name. */
    name?: string;
    disabled?: boolean;
    className?: string;
    triggerClassName?: string;
    panelClassName?: string;
    align?: 'left' | 'right';
    'aria-label'?: string;
};

/**
 * A custom dropdown matching the app's own visual language (rounded rows,
 * checkmark for the selected one, optional badges) instead of the browser's
 * native <select> styling. Generalizes the bespoke domain-picker pattern
 * first built for the Quick Launch wizard.
 */
export default function SelectMenu({
    value,
    options,
    onChange,
    placeholder = 'Select…',
    panelLabel,
    footer,
    accent = 'brand',
    name,
    disabled = false,
    className,
    triggerClassName,
    panelClassName,
    align = 'left',
    ...rest
}: Props) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) {
            return;
        }

        function onPointerDown(event: MouseEvent) {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setOpen(false);
            }
        }
        function onKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        }

        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const selected = options.find((option) => option.value === value);
    const ring = accentRing[accent];
    let lastGroup: string | undefined;

    return (
        <div ref={ref} className={cn('relative', className)}>
            {name && <input type="hidden" name={name} value={value} />}

            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen((prev) => !prev)}
                aria-label={rest['aria-label']}
                className={cn(
                    'flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-left text-sm ring-1 transition outline-none disabled:cursor-not-allowed disabled:opacity-45',
                    open ? ring.open : ring.hover,
                    triggerClassName,
                )}
            >
                <span className="flex min-w-0 items-center gap-1.5 truncate">
                    {selected ? (
                        <>
                            {selected.icon}
                            <span className="truncate">{selected.label}</span>
                            {selected.badge}
                        </>
                    ) : (
                        <span className="text-faint">{placeholder}</span>
                    )}
                </span>
                <ChevronDown
                    className={cn(
                        'size-3.5 shrink-0 text-soft transition-transform duration-200',
                        open && 'rotate-180',
                    )}
                />
            </button>

            {open && (
                <div
                    className={cn(
                        'absolute top-full z-50 mt-1.5 max-h-80 w-full min-w-max overflow-y-auto rounded-2xl bg-surface p-1.5 shadow-2xl ring-1 ring-line',
                        align === 'right' ? 'right-0' : 'left-0',
                        panelClassName,
                    )}
                >
                    {panelLabel && (
                        <div className="px-2.5 py-1.5 text-[10px] font-semibold tracking-wider text-faint uppercase">
                            {panelLabel}
                        </div>
                    )}

                    <div className="flex flex-col gap-0.5">
                        {options.map((option) => {
                            const showGroupHeader =
                                option.group !== undefined &&
                                option.group !== lastGroup;
                            lastGroup = option.group;
                            const isSelected = option.value === value;

                            return (
                                <div key={option.value}>
                                    {showGroupHeader && (
                                        <div className="mt-1 px-2.5 py-1 text-[10px] font-semibold tracking-wider text-faint uppercase first:mt-0">
                                            {option.group}
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        disabled={option.disabled}
                                        onClick={() => {
                                            if (option.disabled) {
                                                return;
                                            }
                                            onChange(option.value);
                                            setOpen(false);
                                        }}
                                        className={cn(
                                            'flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-40',
                                            isSelected
                                                ? 'bg-brand/10 font-semibold text-brand'
                                                : 'text-ink hover:bg-badge/60',
                                        )}
                                    >
                                        <div className="flex min-w-0 items-center gap-2">
                                            {option.icon}
                                            <span className="truncate">
                                                {option.label}
                                            </span>
                                            {option.badge}
                                        </div>
                                        {isSelected && (
                                            <Check className="size-3.5 shrink-0 text-brand" />
                                        )}
                                    </button>
                                    {option.description && (
                                        <div className="px-2.5 pb-1 text-[10px] text-faint">
                                            {option.description}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {footer && (
                        <>
                            <div className="my-1 border-t border-line/60" />
                            {footer}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
