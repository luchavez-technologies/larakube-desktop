import { router } from '@inertiajs/react';
import ProviderLogo from '@/components/provider-logo';
import Redactable from '@/components/redactable';
import SelectMenu from '@/components/select-menu';
import { serverKindLabel, type ServerKind } from '@/lib/servers';
import { cn } from '@/lib/utils';
import type { Server } from '@/types/larakube';

type Accent = 'brand' | 'servers' | 'tools' | 'setup';

const kindBadgeClasses: Record<ServerKind, string> = {
    VPS: 'bg-servers/10 text-servers ring-1 ring-servers/25',
    Managed: 'bg-brand/10 text-brand ring-1 ring-brand/25',
    Local: 'bg-badge text-soft ring-1 ring-line/80',
    External: 'bg-badge text-soft ring-1 ring-line/80',
};

/**
 * The "Server" dropdown shown atop every per-server section (Tools, Mail,
 * Plex Commons, …) — extracted from Tools' and Mail's own copies, which had
 * drifted to use different navigation helpers (a Wayfinder route function vs
 * a hardcoded URL string) AND different option rendering (only Tools showed
 * the provider icon) for the exact same switch-server action. The provider
 * icon is now always shown — every consumer, including Plex Commons, gets
 * the same look with nothing to opt into.
 */
export default function ServerSwitcher({
    servers,
    value,
    buildHref,
    accent,
}: {
    servers: Server[];
    value: string;
    buildHref: (serverName: string) => string;
    accent?: Accent;
}) {
    return (
        <div className="flex h-9 items-center gap-2.5 rounded-lg bg-surface pl-3 ring-1 ring-line">
            <span className="text-xs text-soft">Server</span>
            <SelectMenu
                value={value}
                accent={accent}
                triggerClassName="h-9 rounded-lg bg-transparent px-2 ring-0 hover:ring-0"
                onChange={(candidate) => router.visit(buildHref(candidate))}
                options={servers.map((candidate) => {
                    const kind = serverKindLabel(candidate);

                    return {
                        value: candidate.name,
                        label: candidate.name,
                        icon: (
                            <ProviderLogo slug={candidate.provider} size="xs" />
                        ),
                        badge: (
                            <span
                                className={cn(
                                    'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] leading-none font-medium',
                                    kindBadgeClasses[kind],
                                )}
                            >
                                {kind}
                            </span>
                        ),
                        description: candidate.ip ? (
                            <Redactable value={candidate.ip} kind="ip" />
                        ) : undefined,
                    };
                })}
            />
        </div>
    );
}
