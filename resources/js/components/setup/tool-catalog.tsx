import { useState } from 'react';
import { router } from '@inertiajs/react';
import { ArrowUpCircle, Download, RefreshCw } from 'lucide-react';
import Button from '@/components/button';
import { ListRow, TwoLine } from '@/components/list-row';
import ProviderLogo from '@/components/provider-logo';
import StatusPill from '@/components/status-pill';
import { forgetToolStatus, useToolStatus } from '@/lib/tool-status';
import { cn } from '@/lib/utils';
import { install, update } from '@/routes/setup/tools';
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
            <div className="flex min-w-0 items-center gap-3">
                <ProviderLogo slug={entry.slug} size="sm" />
                <div className="min-w-0">
                    <TwoLine
                        title={
                            entry.required
                                ? entry.label
                                : `${entry.label} · optional`
                        }
                        detail={
                            tool?.installed
                                ? (tool.version ?? tool.path)
                                : entry.purpose
                        }
                        mono={tool?.installed}
                    />
                </div>
            </div>
        </ListRow>
    );
}

function ToolState({ tool, channel }: { tool: Tool; channel: string }) {
    const [submitting, setSubmitting] = useState(false);

    const handleAction = (url: string, data?: Record<string, string>) => {
        setSubmitting(true);
        router.post(url, data ?? {}, {
            preserveScroll: true,
            preserveState: true,
            only: ['activeRuns'],
            onSuccess: () => {
                forgetToolStatus();
            },
            onFinish: () => {
                setSubmitting(false);
            },
        });
    };

    if (tool.installed) {
        return (
            <div className="flex items-center gap-2">
                {tool.slug === 'larakube' ? (
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={submitting}
                        onClick={() =>
                            handleAction('/setup/cli/update', { channel })
                        }
                    >
                        <ArrowUpCircle
                            className={cn(
                                'size-3.5',
                                submitting && 'animate-spin',
                            )}
                        />
                        <span>Update</span>
                    </Button>
                ) : (
                    tool.installable && (
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={submitting}
                            onClick={() => handleAction(update(tool.slug).url)}
                        >
                            <ArrowUpCircle
                                className={cn(
                                    'size-3.5',
                                    submitting && 'animate-spin',
                                )}
                            />
                            <span>Update</span>
                        </Button>
                    )
                )}
                <StatusPill tone="ok">Installed</StatusPill>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            {tool.installable && (
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={submitting}
                    onClick={() =>
                        handleAction(install(tool.slug).url, { channel })
                    }
                >
                    <Download
                        className={cn('size-3.5', submitting && 'animate-spin')}
                    />
                    <span>Install</span>
                </Button>
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
