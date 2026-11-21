import { router, usePage } from '@inertiajs/react';
import ProviderLogo from '@/components/provider-logo';
import SelectMenu from '@/components/select-menu';
import { serverOptions } from '@/components/server-switcher';
import { NativeEvents, useNativeEventReload } from '@/lib/native-events';
import { update as rememberServer } from '@/routes/current-server';
import type { Server } from '@/types/larakube';

type WorkspaceServer = Pick<
    Server,
    'name' | 'provider' | 'region' | 'ip' | 'kind'
>;

export type Workspace = {
    servers: WorkspaceServer[];
    current: string | null;
};

/** The per-server sections whose address carries the server: /servers/{name}/{section}. */
const SECTION =
    /^\/servers\/[^/]+\/(apps|tools|plex|mail|drive|sso|openbao|backups)(?=[/?]|$)/;

/**
 * The one place to choose the server you're working with. On a per-server page
 * it reopens that page for the new server; anywhere else it is remembered, so
 * the next per-server page opens on it.
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

    const current = workspace.servers.find((s) => s.name === workspace.current);
    if (!current) return null;

    const choose = (name: string) => {
        if (name === current.name) return;

        const section = SECTION.exec(url)?.[1];
        if (section) {
            router.visit(`/servers/${encodeURIComponent(name)}/${section}`);
            return;
        }

        router.post(
            rememberServer().url,
            { server: name },
            { preserveScroll: true, preserveState: true },
        );
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
                options={serverOptions(workspace.servers)}
                onChange={choose}
            />
        </div>
    );
}
