import { router, usePage } from '@inertiajs/react';
import ProviderLogo from '@/components/provider-logo';
import SelectMenu from '@/components/select-menu';
import { serverOptions } from '@/components/server-switcher';
import { NativeEvents, useNativeEventReload } from '@/lib/native-events';
import type { Server } from '@/types/larakube';

type WorkspaceServer = Pick<
    Server,
    'name' | 'provider' | 'region' | 'ip' | 'kind'
>;

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
    onExpand,
}: {
    workspace: Workspace;
    collapsed: boolean;
    onExpand: () => void;
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

    if (collapsed) {
        return (
            <button
                type="button"
                onClick={onExpand}
                className="mx-auto mb-3 flex size-10 cursor-pointer items-center justify-center rounded-lg ring-1 ring-line transition hover:bg-paper"
                title={`Server: ${current.name} (expand to switch)`}
                aria-label={`Server: ${current.name}`}
            >
                <ProviderLogo slug={current.provider} size="xs" />
            </button>
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
