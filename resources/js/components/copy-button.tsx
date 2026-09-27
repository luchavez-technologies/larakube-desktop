import { useState } from 'react';
import Button from '@/components/button';

export default function CopyButton({
    value,
    label = 'Copy',
}: {
    value: string;
    label?: string;
}) {
    const [copied, setCopied] = useState(false);

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={() => {
                void navigator.clipboard.writeText(value);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
            }}
        >
            {copied ? 'Copied' : label}
        </Button>
    );
}
