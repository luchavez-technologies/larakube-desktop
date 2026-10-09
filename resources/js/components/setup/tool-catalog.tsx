import { Link } from '@inertiajs/react';
import { Download, RefreshCw, ArrowUpCircle } from 'lucide-react';
import { buttonClass } from '@/components/button';
import { ListRow, TwoLine } from '@/components/list-row';
import StatusPill from '@/components/status-pill';
import { install } from '@/routes/setup/tools';
import { useToolStatus } from '@/lib/tool-status';
import type { Tool } from '@/types/larakube';

export type CatalogEntry = Omit<Tool, 'installed' | 'path' | 'version'>;

export function ToolRow({
    entry,
    channel,
    refresh,
}: {
    entry: CatalogEntry;
    channel: string;
    refresh: number;
}) {
    const { status, checking } = useToolStatus(entry.slug, refresh);
    const tool = status ? { ...entry, ...status } : null;

    return (
        <ListRow
            action={
                tool && !checking ? (
                    <ToolState tool={tool} channel={channel} />
                ) : (
                    <RefreshCw className="size-4 animate-spin text-faint" />
                )
            }
        >
            <TwoLine
                title={
                    entry.required ? entry.label : `${entry.label} · optional`
                }
                detail={
                    tool?.installed
                        ? (tool.version ?? tool.path)
                        : entry.purpose
                }
                mono={tool?.installed}
            />
        </ListRow>
    );
}

function ToolState({ tool, channel }: { tool: Tool; channel: string }) {
    if (tool.installed) {
        return (
            <div className="flex items-center gap-2">
                {tool.slug === 'larakube' && (
                    <Link
                        href="/setup/cli/update"
                        data={{ channel }}
                        method="post"
                        as="button"
                        className={buttonClass('secondary', 'sm')}
                    >
                        <ArrowUpCircle className="size-3.5" />
                        <span>Update</span>
                    </Link>
                )}
                <StatusPill tone="ok">Installed</StatusPill>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            {tool.installable && (
                <Link
                    href={install(tool.slug).url}
                    data={{ channel }}
                    method="post"
                    as="button"
                    className={buttonClass('secondary', 'sm')}
                >
                    <Download className="size-3.5" />
                    <span>Install</span>
                </Link>
            )}
            <StatusPill tone={tool.required ? 'bad' : 'muted'}>
                Missing
            </StatusPill>
        </div>
    );
}

/** A full "Command-line tools" list, reused by the Setup page and the onboarding wizard's install step. */
export default function ToolCatalogList({
    catalog,
    channel,
    refresh,
    showLocalOnly = true,
}: {
    catalog: CatalogEntry[];
    channel: string;
    refresh: number;
    showLocalOnly?: boolean;
}) {
    return (
        <>
            {catalog
                .filter((entry) => showLocalOnly || !entry.localOnly)
                .map((entry) => (
                    <ToolRow
                        key={entry.slug}
                        entry={entry}
                        channel={channel}
                        refresh={refresh}
                    />
                ))}
        </>
    );
}
