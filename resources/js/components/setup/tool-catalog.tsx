import { useEffect, useRef, useState } from 'react';
import { router } from '@inertiajs/react';
import { ArrowUpCircle, Download, RefreshCw } from 'lucide-react';
import Button from '@/components/button';
import { ListRow, TwoLine } from '@/components/list-row';
import ProviderLogo from '@/components/provider-logo';
import StatusPill from '@/components/status-pill';
import { sendJson } from '@/lib/http';
import { forgetToolStatus, useToolStatus } from '@/lib/tool-status';
import { cn } from '@/lib/utils';
import { install, update } from '@/routes/setup/tools';
import type { Tool } from '@/types/larakube';

export type CatalogEntry = Omit<Tool, 'installed' | 'path' | 'version'>;

export function ToolRow({
    entry,
    channel,
    refresh,
    highlight = false,
}: {
    entry: CatalogEntry;
    channel: string;
    refresh: number;
    highlight?: boolean;
}) {
    const rowRef = useRef<HTMLDivElement>(null);
    const { status, checking } = useToolStatus(entry.slug, refresh);
    const tool = status ? { ...entry, ...status } : null;

    useEffect(() => {
        if (highlight && rowRef.current) {
            rowRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
        }
    }, [highlight]);

    return (
        <div
            ref={rowRef}
            className={cn(
                'transition-all duration-500',
                highlight &&
                    'my-1 rounded-xl bg-brand/5 px-2.5 shadow-xs ring-2 ring-brand/60 ring-offset-2 ring-offset-surface',
            )}
        >
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
                        <div className="flex items-center gap-2">
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
                            {highlight && !tool?.installed && (
                                <span className="inline-flex shrink-0 animate-pulse items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand ring-1 ring-brand/20">
                                    Recommended for Observability
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </ListRow>
        </div>
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

/**
 * Polls the same `/runs/{id}/stream` endpoint the floating run HUD
 * (run-drawer.tsx's TrackedRun) already uses, until the run leaves
 * "running" — so a caller can genuinely wait for one install to finish,
 * not just for the HTTP request that started it to come back.
 */
async function waitForRunToFinish(runId: number): Promise<void> {
    for (;;) {
        const res = await sendJson<{ status: string }>(
            `/runs/${runId}/stream`,
            'GET',
        );

        if (!res.ok || res.data.status !== 'running') {
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, 1200));
    }
}

/**
 * Installs every installable tool in the (filtered) catalog, one after
 * another — genuinely one at a time, each awaited to completion before the
 * next starts, not just the HTTP request that kicks it off. CliRunner::start()
 * spawns a background process and returns immediately (see CliRunner.php),
 * so without waitForRunToFinish() every install below would actually run
 * concurrently as independent OS processes — several large downloads
 * (kubectl/OpenTofu/the Google Cloud SDK, 50-150MB each) competing for
 * bandwidth and memory at once on a fresh machine, confirmed live
 * (2026-10-29) to be confusing and resource-risky during first-run
 * onboarding, which is exactly the case this button exists for.
 *
 * Deliberately fires install for EVERY entry rather than only the ones
 * currently showing "Missing" — CatalogEntry carries no live status at this
 * level (each row's installed/path/version is fetched independently by its
 * own useToolStatus() call), and CliTool::install() already no-ops
 * instantly when a tool is already present, so re-asking for an installed
 * one costs nothing.
 */
function InstallAllButton({
    catalog,
    channel,
    showLocalOnly,
}: {
    catalog: CatalogEntry[];
    channel: string;
    showLocalOnly: boolean;
}) {
    const [running, setRunning] = useState(false);

    const targets = catalog.filter(
        (entry) => entry.installable && (showLocalOnly || !entry.localOnly),
    );

    if (targets.length === 0) {
        return null;
    }

    const runAll = async () => {
        setRunning(true);

        for (const entry of targets) {
            const runId = await new Promise<number | null>((resolve) => {
                router.post(
                    install(entry.slug).url,
                    { channel },
                    {
                        preserveScroll: true,
                        preserveState: true,
                        only: ['activeRuns'],
                        onSuccess: (page) => {
                            const runs = (page.props.activeRuns ?? []) as {
                                id: number;
                            }[];
                            resolve(runs.length > 0 ? runs[0].id : null);
                        },
                        onError: () => resolve(null),
                    },
                );
            });

            if (runId !== null) {
                await waitForRunToFinish(runId);
            }

            forgetToolStatus();
        }

        setRunning(false);
    };

    return (
        <div className="mb-3 flex justify-end">
            <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={running}
                onClick={runAll}
            >
                <Download
                    className={cn('size-3.5', running && 'animate-spin')}
                />
                <span>{running ? 'Installing…' : 'Install everything'}</span>
            </Button>
        </div>
    );
}

/** A full "Command-line tools" list, reused by the Setup page and the onboarding wizard's install step. */
export default function ToolCatalogList({
    catalog,
    channel,
    refresh,
    showLocalOnly = true,
    highlight,
}: {
    catalog: CatalogEntry[];
    channel: string;
    refresh: number;
    showLocalOnly?: boolean;
    highlight?: string | null;
}) {
    return (
        <>
            <InstallAllButton
                catalog={catalog}
                channel={channel}
                showLocalOnly={showLocalOnly}
            />
            {catalog
                .filter((entry) => showLocalOnly || !entry.localOnly)
                .map((entry) => (
                    <ToolRow
                        key={entry.slug}
                        entry={entry}
                        channel={channel}
                        refresh={refresh}
                        highlight={highlight === entry.slug}
                    />
                ))}
        </>
    );
}
