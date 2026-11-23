import { router, usePage } from '@inertiajs/react';
import ProviderLogo from '@/components/provider-logo';
import SelectMenu from '@/components/select-menu';
import Redactable from '@/components/redactable';
import { kindBadgeClasses, serverOptions } from '@/components/server-switcher';
import { serverKindLabel } from '@/lib/servers';
import { cn } from '@/lib/utils';
import { NativeEvents, useNativeEventReload } from '@/lib/native-events';
import type { Server } from '@/types/larakube';

type WorkspaceServer = Pick<
    Server,
    'name' | 'provider' | 'region' | 'ip' | 'kind'
>;

const PROVIDER_NAMES: Record<string, string> = {
    digitalocean: 'DigitalOcean',
    hetzner: 'Hetzner',
    gcp: 'Google Cloud',
    aws: 'AWS',
    azure: 'Azure',
    vultr: 'Vultr',
    linode: 'Linode',
};

/** "digitalocean" → "DigitalOcean"; an unknown provider as it is, capitalised. */
function providerName(provider: string | null | undefined): string {
    const slug = (provider ?? '').toLowerCase();

    return (
        PROVIDER_NAMES[slug] ??
        (slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : 'Cluster')
    );
}

export type Workspace = {
    servers: WorkspaceServer[];
    current: string | null;
};

/** The per-server pages, whose address carries the server: /servers/{name}/{section}. */
const SECTION =
    /^\/servers\/([^/]+)\/(apps|tools|plex|mail|drive|sso|openbao|backups)(?=[/?]|$)/;

/**
 * The one place to choose the server you're working with. It shows only on the
 * per-server pages, and switching reopens the same page for the new server;
 * fleet-wide pages (Dashboard, Servers, Activity...) span every server.
 */
export default function SidebarServerPicker({
    workspace,
    collapsed,
}: {
    workspace: Workspace;
    collapsed: boolean;
}) {
    const { url } = usePage();
    useNativeEventReload(NativeEvents.serversSynced, ['workspace']);

    const match = SECTION.exec(url);
    const current = match
        ? workspace.servers.find((s) => s.name === decodeURIComponent(match[1]))
        : undefined;
    if (!match || !current) return null;

    const section = match[2];
    const choose = (name: string) => {
        if (name !== current.name) {
            router.visit(`/servers/${encodeURIComponent(name)}/${section}`);
        }
    };

    // Collapsed: the provider's logo as a tile the size of the nav icons, the
    // server's details on hover, and the same server list opening beside it,
    // so switching never needs the sidebar expanded.
    if (collapsed) {
        const kind = serverKindLabel(current);

        return (
            <div className="group relative mx-auto mb-3">
                <SelectMenu
                    value={current.name}
                    accent="servers"
                    aria-label={`Server: ${current.name}`}
                    triggerClassName="size-9 justify-center rounded-[10px] bg-transparent p-0 ring-0 hover:bg-paper"
                    trigger={
                        <ProviderLogo
                            slug={current.provider}
                            size="xs"
                            className="size-6.5 rounded-md p-0.5 shadow-xs [&_svg]:size-5"
                        />
                    }
                    side="right"
                    panelLabel="Server"
                    options={serverOptions(workspace.servers)}
                    onChange={choose}
                />

                <div
                    role="tooltip"
                    className="pointer-events-none absolute top-0 left-full z-40 ml-2 hidden w-56 rounded-xl bg-surface p-3 shadow-xl ring-1 ring-line group-hover:block group-has-[[aria-expanded=true]]:hidden"
                >
                    <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-ink">
                            {current.name}
                        </span>
                        <span
                            className={cn(
                                'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                                kindBadgeClasses[kind],
                            )}
                        >
                            {kind}
                        </span>
                    </div>
                    <p className="mt-1 text-xs text-soft">
                        {providerName(current.provider)}
                        {current.region ? ` · ${current.region}` : ''}
                    </p>
                    {current.ip && (
                        <p className="mt-1 font-mono text-[11px] text-soft">
                            <Redactable value={current.ip} kind="ip" />
                        </p>
                    )}
                    <p className="mt-2 border-t border-line/60 pt-2 text-[11px] text-faint">
                        Click to switch server
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="mb-3 px-1">
            <span className="mb-1 block px-1 text-[10px] font-semibold tracking-wider text-faint uppercase">
                Server
            </span>
            <SelectMenu
                value={current.name}
                accent="servers"
                aria-label="Server"
                className="w-full"
                triggerClassName="h-9 w-full rounded-lg px-2"
                triggerBadge={false}
                options={serverOptions(workspace.servers)}
                onChange={choose}
            />
        </div>
    );
}
