import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const variants = {
    primary: 'bg-accent text-white hover:bg-accent-hover',
    secondary: 'bg-surface text-ink ring-1 ring-line ring-inset hover:bg-paper',
    danger: 'bg-surface text-accent ring-1 ring-accent-line ring-inset hover:bg-accent-tint',
    dangerFill: 'bg-accent text-white hover:bg-accent-hover',
    ghost: 'text-soft hover:bg-badge hover:text-ink',
    dark: 'bg-ink text-white hover:bg-ink/85',
} as const;

export type ButtonVariant = keyof typeof variants;

/** Shared by <Button> and Inertia <Link> so both look identical. */
export function buttonClass(
    variant: ButtonVariant = 'primary',
    size: 'md' | 'sm' = 'md',
    className?: string,
): string {
    return cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
        variants[variant],
        className,
    );
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: 'md' | 'sm';
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
