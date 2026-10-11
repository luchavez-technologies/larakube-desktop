import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { usePage } from '@inertiajs/react';
import { cn } from '@/lib/utils';

const PLACEHOLDERS: Record<'ip' | 'account' | 'text', string> = {
    ip: '•••.•••.•••.•••',
    account: '•••••••••••',
    text: '••••••••',
};

/**
 * Masks a value while Demo Mode is on (`usePage().props.demoMode`, shared
 * globally the same way as `hideProjects`/`experimental`) — an IP, an AWS/GCP
 * account identifier, or any other on-screen value a workshop audience
 * shouldn't see. Click to reveal just this one value without turning Demo
 * Mode off everywhere else; the reveal is local state, never persisted.
 *
 * Callers keep their own "no value yet" fallback (`server.ip ?? 'Provisioning…'`)
 * outside this component — it only ever masks a value that's actually there.
 */
export default function Redactable({
    value,
    kind = 'text',
    className,
}: {
    value: string;
    kind?: 'ip' | 'account' | 'text';
    className?: string;
}) {
    const { demoMode } = usePage<{ demoMode?: boolean }>().props;
    const [revealed, setRevealed] = useState(false);

    if (!demoMode) {
        return <>{value}</>;
    }

    if (revealed) {
        return (
            <span className={className}>
                {value}
                <button
                    type="button"
                    onClick={() => setRevealed(false)}
                    title="Hide again"
                    className="ml-1 inline-flex align-middle text-faint hover:text-soft"
                >
                    <EyeOff className="size-3" />
                </button>
            </span>
        );
    }

    return (
        <button
            type="button"
            onClick={() => setRevealed(true)}
            title="Hidden in Demo Mode — click to reveal"
            className={cn(
                'inline-flex items-center gap-1 text-faint hover:text-soft',
                className,
            )}
        >
            <span className="font-mono">{PLACEHOLDERS[kind]}</span>
            <Eye className="size-3" />
        </button>
    );
}
