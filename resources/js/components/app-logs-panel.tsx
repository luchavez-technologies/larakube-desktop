import MergedLogsPanel from '@/components/merged-logs-panel';

/** The merged live logs of an installed app's components. */
export default function AppLogsPanel({
    server,
    tool,
}: {
    server: { name: string };
    tool: { tool: string; host?: string | null };
}) {
    return (
        <MergedLogsPanel
            endpoint={`/servers/${encodeURIComponent(server.name)}/apps/${encodeURIComponent(tool.tool)}/logs`}
            params={{ domain: tool.host ?? '' }}
            failure="Could not read this app’s logs."
        />
    );
}
