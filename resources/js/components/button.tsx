import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const variants = {
    primary: 'bg-ink text-white hover:bg-ink/90 active:bg-ink/95 shadow-xs',
    secondary: 'bg-surface text-ink ring-1 ring-line ring-inset hover:bg-paper',
    danger: 'bg-surface text-accent ring-1 ring-accent-line ring-inset hover:bg-accent-tint',
    dangerFill: 'bg-accent text-white hover:bg-accent-hover',
    ghost: 'text-soft hover:bg-badge hover:text-ink',
    dark: 'bg-ink text-white hover:bg-ink/85',
    tools: 'bg-tools text-white hover:bg-tools/90 active:bg-tools/95 shadow-xs font-medium',
} as const;

export type ButtonVariant = keyof typeof variants;

const sizes = {
    sm: 'h-8 px-2.5 text-xs gap-1.5',
    md: 'h-9 px-3.5 text-[13px] gap-2',
    lg: 'h-10 px-4 text-sm gap-2',
} as const;

export type ButtonSize = keyof typeof sizes;

/** Shared by <Button> and Inertia <Link> so both look identical. */
export function buttonClass(
    variant: ButtonVariant = 'primary',
    size: ButtonSize = 'md',
    className?: string,
): string {
    return cn(
        'inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-45',
        sizes[size],
        variants[variant],
        className,
    );
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
};

export default function Button({
    variant = 'primary',
    size = 'md',
    className,
    type = 'button',
    ...props
}: Props) {
    return (
        <button
            type={type}
            className={buttonClass(variant, size, className)}
            {...props}
        />
    );
}
