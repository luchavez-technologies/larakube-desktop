import { useState } from 'react';
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
}: {
    value: string;
    label?: string;
    copiedLabel?: string;
    variant?: ButtonVariant;
    size?: ButtonSize;
    className?: string;
}) {
    const [copied, setCopied] = useState(false);

    return (
        <Button
            variant={variant}
            size={size}
            className={className}
            onClick={() => {
                void navigator.clipboard.writeText(value);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
            }}
        >
            {copied ? (
                <>
                    <Check className="size-3.5 text-emerald-500" />
                    <span>{copiedLabel}</span>
                </>
            ) : (
                <>
                    <Copy className="size-3.5" />
                    <span>{label}</span>
                </>
            )}
        </Button>
    );
}
