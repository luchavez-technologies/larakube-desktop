import { useState } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { Check, Copy } from 'lucide-react';
import Button, {
    type ButtonSize,
    type ButtonVariant,
} from '@/components/button';

export default function CopyButton({
    value,
    label = 'Copy',
    copiedLabel = 'Copied',
    variant = 'ghost',
    size = 'sm',
    className,
    title = 'Copy',
    ...props
}: {
    value: string;
    label?: string;
    copiedLabel?: string;
    variant?: ButtonVariant;
    size?: ButtonSize;
    className?: string;
    title?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value'>) {
    const [copied, setCopied] = useState(false);

    const activeTitle = copied ? copiedLabel || 'Copied' : title;

    return (
        <Button
            variant={variant}
            size={size}
            className={className}
            title={activeTitle}
            aria-label={activeTitle}
            onClick={(e) => {
                e.stopPropagation();
                void navigator.clipboard.writeText(value);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
            }}
            {...props}
        >
            {copied ? (
                <>
                    <Check className="size-3.5 shrink-0 text-emerald-500" />
                    {copiedLabel ? <span>{copiedLabel}</span> : null}
                </>
            ) : (
                <>
                    <Copy className="size-3.5 shrink-0" />
                    {label ? <span>{label}</span> : null}
                </>
            )}
        </Button>
    );
}
