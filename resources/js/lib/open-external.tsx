import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { sendJson } from '@/lib/http';

/**
 * Opens an external URL in the default desktop browser via a background JSON
 * request to /open. This prevents Inertia page visits and avoids wiping out
 * active form inputs or component state.
 */
export async function openExternalUrl(url?: string | null): Promise<boolean> {
    if (!url) {
        return false;
    }

    try {
        const res = await sendJson<{ ok: boolean }>('/open', 'POST', { url });
        return res.ok;
    } catch {
        return false;
    }
}

export type ExternalLinkButtonProps = {
    url: string;
    children: ReactNode;
    showIcon?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>;

/**
 * A button that opens a URL in the external browser without triggering an Inertia visit.
 */
export function ExternalLinkButton({
    url,
    children,
    className,
    showIcon = false,
    ...rest
}: ExternalLinkButtonProps) {
    return (
        <button
            type="button"
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void openExternalUrl(url);
            }}
            className={className}
            {...rest}
        >
            {children}
            {showIcon && <ExternalLinkIcon className="size-3.5 shrink-0" />}
        </button>
    );
}
