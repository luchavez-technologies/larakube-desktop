import { useEffect, useRef, useState } from 'react';
import { router } from '@inertiajs/react';
import { ArrowUpCircle, Download, RefreshCw } from 'lucide-react';
import Button from '@/components/button';
import { ListRow, TwoLine } from '@/components/list-row';
import ProviderLogo from '@/components/provider-logo';
import StatusPill from '@/components/status-pill';
import { sendJson } from '@/lib/http';
import {
    forgetToolStatus,
    toolIsInstalled,
    useToolStatus,
} from '@/lib/tool-status';
import { cn } from '@/lib/utils';
import { install, update } from '@/routes/setup/tools';
import type { Tool } from '@/types/larakube';

export type CatalogEntry = Omit<Tool, 'installed' | 'path' | 'version'>;

/** An indeterminate progress bar — installs stream no byte count, so this communicates "working" without faking a percentage. */
function InstallingBar() {
    return (
        <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-badge">
                <div className="h-full w-1/3 animate-indeterminate rounded-full bg-brand" />
            </div>
            <span className="text-xs font-medium text-faint">Installing…</span>
        </div>
    );
}

export function ToolRow({
    entry,
    channel,
    refresh,
    highlight = false,
    installing = false,
}: {
    entry: CatalogEntry;
    channel: string;
    refresh: number;
    highlight?: boolean;
    /** This row's install/update is the one an in-progress "Install everything" run is currently on. */
    installing?: boolean;
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
                    installing ? (
                        <InstallingBar />
                    ) : tool && !checking ? (
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
 * Installs every installable tool in the (filtered) catalog that isn't
 * already present, one after another — genuinely one at a time, each
 * awaited to completion before the next starts, not just the HTTP request
 * that kicks it off. CliRunner::start() spawns a background process and
 * returns immediately (see CliRunner.php), so without waitForRunToFinish()
 * every install below would actually run concurrently as independent OS
 * processes — several large downloads (kubectl/OpenTofu/the Google Cloud
 * SDK, 50-150MB each) competing for bandwidth and memory at once on a fresh
 * machine, confirmed live (2026-10-29) to be confusing and resource-risky
 * during first-run onboarding, which is exactly the case this button exists
 * for.
 *
 * Checks each tool's live status before firing its install — `larakube
 * setup --tools=X` is supposed to no-op when a tool is already present, but
 * confirmed live (2026-10-30) that re-running it against an already-working
 * kubectl/gcloud on Windows can still fail (file-in-use, partial
 * re-extraction, etc.), which then shows a contradictory "Failed" run next
 * to a row that still correctly says "Installed" from before. Skipping
 * already-installed tools entirely avoids touching a tool this button has
 * no reason to touch.
 */
function InstallAllButton({
    catalog,
    channel,
    showLocalOnly,
    onInstallingChange,
}: {
    catalog: CatalogEntry[];
    channel: string;
    showLocalOnly: boolean;
    onInstallingChange: (slug: string | null) => void;
}) {
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState<{
        done: number;
        total: number;
    } | null>(null);

    const targets = catalog.filter(
        (entry) => entry.installable && (showLocalOnly || !entry.localOnly),
    );

    if (targets.length === 0) {
        return null;
    }

    const runAll = async () => {
        setRunning(true);
        setProgress({ done: 0, total: targets.length });

        for (const [index, entry] of targets.entries()) {
            if (await toolIsInstalled(entry.slug)) {
                setProgress({ done: index + 1, total: targets.length });
                continue;
            }

            onInstallingChange(entry.slug);

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
            setProgress({ done: index + 1, total: targets.length });
        }

        onInstallingChange(null);
        setProgress(null);
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
                <span>
                    {running && progress
                        ? `Installing… (${progress.done} of ${progress.total})`
                        : 'Install everything'}
                </span>
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
    const [installingSlug, setInstallingSlug] = useState<string | null>(null);

    return (
        <>
            <InstallAllButton
                catalog={catalog}
                channel={channel}
                showLocalOnly={showLocalOnly}
                onInstallingChange={setInstallingSlug}
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
                        installing={installingSlug === entry.slug}
                    />
                ))}
        </>
    );
}
