import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import {
    useState,
    type KeyboardEvent,
    type MouseEvent,
    type ReactNode,
} from 'react';
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
 * `copyable` adds a copy icon that copies the real value, revealed or not.
 *
 * Its controls handle their own clicks and stop there, so it works inside a
 * row that is itself clickable (a dropdown option, a table row link).
 *
 * Callers keep their own "no value yet" fallback (`server.ip ?? 'Provisioning…'`)
 * outside this component — it only ever masks a value that's actually there.
 */
export default function Redactable({
    value,
    kind = 'text',
    className,
    copyable = false,
}: {
    value: string;
    kind?: 'ip' | 'account' | 'text';
    className?: string;
    copyable?: boolean;
}) {
    const { demoMode } = usePage<{ demoMode?: boolean }>().props;
    const [revealed, setRevealed] = useState(false);
    const [copied, setCopied] = useState(false);

    const copy = () => {
        void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    const copyControl = copyable && (
        <Control
            onActivate={copy}
            title={copied ? 'Copied' : 'Copy'}
            className="ml-1"
        >
            {copied ? (
                <Check className="size-3 text-ok" />
            ) : (
                <Copy className="size-3" />
            )}
        </Control>
    );

    if (!demoMode) {
        return copyable ? (
            <span className={cn('inline-flex items-center', className)}>
                {value}
                {copyControl}
            </span>
        ) : (
            <>{value}</>
        );
    }

    if (revealed) {
        return (
            <span className={cn('inline-flex items-center', className)}>
                {value}
                <Control
                    onActivate={() => setRevealed(false)}
                    title="Hide again"
                    className="ml-1"
                >
                    <EyeOff className="size-3" />
                </Control>
                {copyControl}
            </span>
        );
    }

    return (
        <span className={cn('inline-flex items-center', className)}>
            <Control
                onActivate={() => setRevealed(true)}
                title="Hidden in Demo Mode — click to reveal"
                className="gap-1"
            >
                <span className="font-mono">{PLACEHOLDERS[kind]}</span>
                <Eye className="size-3" />
            </Control>
            {copyControl}
        </span>
    );
}

/**
 * A small clickable icon that never reaches whatever contains it. A span with a
 * button role, not a <button>, so it may sit inside another button (a dropdown
 * option) without nesting buttons.
 */
function Control({
    onActivate,
    title,
    className,
    children,
}: {
    onActivate: () => void;
    title: string;
    className?: string;
    children: ReactNode;
}) {
    const activate = (event: MouseEvent | KeyboardEvent) => {
        event.preventDefault();
        event.stopPropagation();
        onActivate();
    };

    return (
        <span
            role="button"
            tabIndex={0}
            title={title}
            aria-label={title}
            onClick={activate}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    activate(event);
                }
            }}
            className={cn(
                'inline-flex cursor-pointer items-center text-faint hover:text-soft',
                className,
            )}
        >
            {children}
        </span>
    );
}
