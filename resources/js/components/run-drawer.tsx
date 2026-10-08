import { Link, usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import {
    ChevronDown,
    ChevronUp,
    ExternalLink,
    Maximize2,
    RefreshCw,
    X,
    CheckCircle2,
    AlertCircle,
} from 'lucide-react';
import LogPanel from '@/components/log-panel';
import StatusPill from '@/components/status-pill';
import { sendJson } from '@/lib/http';
import { runStatus } from '@/lib/servers';
import { cancel as cancelRoute, show as showRunRoute } from '@/routes/runs';

type ActiveRunSummary = {
    id: number;
    label: string;
    status: string;
    created_at?: string;
};

type StreamData = {
    id: number;
    label: string;
    kind: string | null;
    status: string;
    output: string;
    exitCode: number | null;
    startedAt: string | null;
    finishedAt: string | null;
};

export default function RunDrawer() {
    const page = usePage<{
        activeRun?: ActiveRunSummary | null;
    }>();

    const activeRunFromProps = page.props.activeRun ?? null;
    const [currentRunId, setCurrentRunId] = useState<number | null>(
        activeRunFromProps?.id ?? null,
    );
    const [stream, setStream] = useState<StreamData | null>(() => {
        if (activeRunFromProps?.id) {
            return {
                id: activeRunFromProps.id,
                label: activeRunFromProps.label,
                kind: null,
                status: activeRunFromProps.status,
                output: '',
                exitCode: null,
                startedAt: activeRunFromProps.created_at ?? null,
                finishedAt: null,
            };
        }
        return null;
    });
    const [expanded, setExpanded] = useState(Boolean(activeRunFromProps?.id));
    const [dismissed, setDismissed] = useState(false);

    // Synchronize currentRunId with activeRun from Inertia page props
    useEffect(() => {
        if (activeRunFromProps?.id) {
            setCurrentRunId(activeRunFromProps.id);
            setDismissed(false);
            setExpanded(true);
            setStream((prev) =>
                prev?.id === activeRunFromProps.id
                    ? prev
                    : {
                          id: activeRunFromProps.id,
                          label: activeRunFromProps.label,
                          kind: null,
                          status: activeRunFromProps.status,
                          output: '',
                          exitCode: null,
                          startedAt: activeRunFromProps.created_at ?? null,
                          finishedAt: null,
                      },
            );
        }
    }, [
        activeRunFromProps?.id,
        activeRunFromProps?.label,
        activeRunFromProps?.status,
        activeRunFromProps?.created_at,
    ]);

    // Poll current run while it is active
    useEffect(() => {
        if (!currentRunId || dismissed) {
            return;
        }

        let isMounted = true;

        const fetchStream = async () => {
            const res = await sendJson<StreamData>(
                `/runs/${currentRunId}/stream`,
                'GET',
            );

            if (isMounted && res.ok) {
                setStream(res.data);
            }
        };

        void fetchStream();

        const interval = setInterval(() => {
            if (stream?.status && stream.status !== 'running') {
                clearInterval(interval);
                return;
            }
            void fetchStream();
        }, 1200);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [currentRunId, stream?.status, dismissed]);

    if (
        page.component === 'runs/show' ||
        !currentRunId ||
        dismissed ||
        !stream
    ) {
        return null;
    }

    const isRunning = stream.status === 'running';
    const isSucceeded = stream.status === 'succeeded';
    const isFailed = stream.status === 'failed';
    const [statusLabel, statusTone] = runStatus[
        stream.status as keyof typeof runStatus
    ] ?? ['Unknown', 'muted'];

    const detach = async () => {
        await sendJson(`/runs/${stream.id}/detach`, 'POST');
    };

    return (
        <aside
            aria-label="Activity HUD"
            // Below every drawer/modal overlay (all z-50, mounted later in the
            // DOM so they'd otherwise win the tie and sit on top) so an open
            // drawer's own footer buttons are never covered by this HUD —
            // still comfortably above ordinary page content.
            className="fixed right-6 bottom-4 z-40 flex flex-col items-end"
        >
            {/* Expanded Drawer / Terminal Panel */}
            {expanded && (
                <div className="mb-2 flex h-[460px] w-[620px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl transition-all">
                    {/* Header */}
                    <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                            {isRunning && (
                                <RefreshCw className="size-4 shrink-0 animate-spin text-brand" />
                            )}
                            {isSucceeded && (
                                <CheckCircle2 className="size-4 shrink-0 text-ok" />
                            )}
                            {isFailed && (
                                <AlertCircle className="size-4 shrink-0 text-accent" />
                            )}
                            <span className="truncate text-sm font-semibold tracking-tight text-ink">
                                {stream.label}
                            </span>
                            <StatusPill tone={statusTone}>
                                {statusLabel}
                            </StatusPill>
                        </div>

                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                title="Detach into separate window"
                                onClick={() => void detach()}
                                className="rounded-lg p-1.5 text-soft transition hover:bg-paper hover:text-ink"
                            >
                                <ExternalLink className="size-4" />
                            </button>
                            <Link
                                href={showRunRoute(stream.id).url}
                                title="Open full screen"
                                className="rounded-lg p-1.5 text-soft transition hover:bg-paper hover:text-ink"
                            >
                                <Maximize2 className="size-4" />
                            </Link>
                            <button
                                type="button"
                                title="Minimize drawer"
                                onClick={() => setExpanded(false)}
                                className="rounded-lg p-1.5 text-soft transition hover:bg-paper hover:text-ink"
                            >
                                <ChevronDown className="size-4" />
                            </button>
                        </div>
                    </div>

                    {/* Log Terminal Body */}
                    <div className="bg-term-bg min-h-0 flex-1 p-2 font-mono text-xs">
                        <LogPanel
                            output={stream.output}
                            placeholder="Waiting for command output…"
                            fill
                        />
                    </div>

                    {/* Footer */}
                    <div className="flex shrink-0 items-center justify-between border-t border-line bg-surface px-4 py-2 text-xs text-soft">
                        <span>
                            {isRunning
                                ? 'Process running in background'
                                : `Run finished (${stream.status})`}
                        </span>
                        <div className="flex items-center gap-2">
                            {isRunning && (
                                <Link
                                    href={cancelRoute(stream.id).url}
                                    method="post"
                                    as="button"
                                    className="rounded-md border border-line px-2.5 py-1 text-xs text-accent transition hover:bg-paper"
                                >
                                    Cancel process
                                </Link>
                            )}
                            {!isRunning && (
                                <button
                                    type="button"
                                    onClick={() => setDismissed(true)}
                                    className="rounded-md border border-line px-2.5 py-1 text-xs text-ink transition hover:bg-paper"
                                >
                                    Dismiss
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Collapsed Bottom HUD Pill */}
            {!expanded && (
                <div className="flex items-center gap-3 rounded-full border border-line bg-surface/95 px-4 py-2.5 shadow-lg backdrop-blur-md transition-all hover:bg-surface">
                    <div className="flex items-center gap-2">
                        {isRunning && (
                            <RefreshCw className="size-3.5 animate-spin text-brand" />
                        )}
                        {isSucceeded && (
                            <CheckCircle2 className="size-3.5 text-ok" />
                        )}
                        {isFailed && (
                            <AlertCircle className="size-3.5 text-accent" />
                        )}
                        <span className="max-w-[240px] truncate text-xs font-medium text-ink">
                            {stream.label}
                        </span>
                        <StatusPill tone={statusTone}>{statusLabel}</StatusPill>
                    </div>

                    <div className="flex items-center gap-1 border-l border-line pl-2">
                        <button
                            type="button"
                            onClick={() => setExpanded(true)}
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink transition hover:bg-paper"
                        >
                            <ChevronUp className="size-3.5" />
                            <span>Logs</span>
                        </button>
                        <button
                            type="button"
                            title="Detach window"
                            onClick={() => void detach()}
                            className="rounded-md p-1 text-soft transition hover:bg-paper hover:text-ink"
                        >
                            <ExternalLink className="size-3.5" />
                        </button>
                        {!isRunning && (
                            <button
                                type="button"
                                title="Dismiss"
                                onClick={() => setDismissed(true)}
                                className="rounded-md p-1 text-soft transition hover:bg-paper hover:text-ink"
                            >
                                <X className="size-3.5" />
                            </button>
                        )}
                    </div>
                </div>
            )}
        </aside>
    );
}
