import { router } from '@inertiajs/react';
import type { ReactNode } from 'react';
import SelectMenu from '@/components/select-menu';
import type { Server } from '@/types/larakube';

type Accent = 'brand' | 'servers' | 'tools' | 'setup';

/**
 * The "Server" dropdown shown atop every per-server section (Tools, Mail,
 * Plex Commons, …) — extracted from Tools' and Mail's own copies, which had
 * drifted to use different navigation helpers (a Wayfinder route function vs
 * a hardcoded URL string) for the exact same switch-server action.
 */
export default function ServerSwitcher({
    servers,
    value,
    buildHref,
    accent,
    renderIcon,
}: {
    servers: Server[];
    value: string;
    buildHref: (serverName: string) => string;
    accent?: Accent;
    renderIcon?: (candidate: Server) => ReactNode;
}) {
    return (
        <div className="flex h-9 items-center gap-2.5 rounded-lg bg-surface pl-3 ring-1 ring-line">
            <span className="text-xs text-soft">Server</span>
            <SelectMenu
                value={value}
                accent={accent}
                triggerClassName="h-9 rounded-lg bg-transparent px-2 ring-0 hover:ring-0"
                onChange={(candidate) => router.visit(buildHref(candidate))}
                options={servers.map((candidate) => ({
                    value: candidate.name,
                    label: candidate.name,
                    icon: renderIcon?.(candidate),
                }))}
            />
        </div>
    );
}
