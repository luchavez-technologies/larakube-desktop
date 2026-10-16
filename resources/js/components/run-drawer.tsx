import { Link, router, usePage } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
    ArrowRight,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    Maximize2,
    Plus,
    RefreshCw,
    X,
    CheckCircle2,
    AlertCircle,
} from 'lucide-react';
import { buttonClass } from '@/components/button';
import LogPanel from '@/components/log-panel';
import StatusPill from '@/components/status-pill';
import { sendJson } from '@/lib/http';
import { useIsAnyRightDrawerOpen } from '@/lib/right-drawer-open';
import { celebratesOnSuccess } from '@/lib/run-kinds';
import { runStatus } from '@/lib/servers';
import { forgetToolStatus } from '@/lib/tool-status';
import { useCelebrateOnSuccess } from '@/lib/use-celebrate';
import { cn } from '@/lib/utils';
import { show as showDevBox } from '@/routes/devboxes';
import { show as showBoxProject } from '@/routes/devboxes/projects';
import {
    create as createProject,
    show as showProject,
} from '@/routes/projects';
import { cancel as cancelRoute, show as showRunRoute } from '@/routes/runs';
import type { Run } from '@/types/larakube';

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
    subject: string | null;
    meta: Run['meta'];
};

function placeholderStream(seed: ActiveRunSummary): StreamData {
    return {
        id: seed.id,
        label: seed.label,
        kind: null,
        status: seed.status,
        output: '',
        exitCode: null,
        startedAt: seed.created_at ?? null,
        finishedAt: null,
        subject: null,
        meta: null,
    };
}

/** The "what next" buttons a finished new-project run earns, the same ones its old inline terminal card offered. */
function successActions(stream: StreamData): ReactNode {
    if (
        stream.kind !== 'new-project' &&
        stream.kind !== 'new-dev-box-project'
    ) {
        return null;
    }

    const server = stream.meta?.server;
    const app = stream.meta?.app;

    return (
        <>
            <Link
                href={createProject().url}
                className={buttonClass('secondary', 'sm')}
            >
                <Plus className="size-3.5" />
                <span>Create another</span>
            </Link>
            {stream.kind === 'new-project' && stream.meta?.project && (
                <Link
                    href={showProject(Number(stream.meta.project)).url}
                    className={buttonClass('primary', 'sm')}
                >
                    <span>Open project</span>
                    <ArrowRight className="size-3.5" />
                </Link>
            )}
            {stream.kind === 'new-dev-box-project' && server && (
                <Link
                    href={
                        (app
                            ? showBoxProject({ box: server, project: app })
                            : showDevBox(server)
                        ).url
                    }
                    className={buttonClass('primary', 'sm')}
                >
                    <span>Open the dev box</span>
                    <ArrowRight className="size-3.5" />
                </Link>
            )}
        </>
    );
}

/**
 * One tracked run's card — either the big log panel (when it's the stack's
 * single "expanded" slot) or a collapsed pill. Owns its own polling and
 * confetti; the parent only owns which id (if any) is expanded.
 */
function TrackedRun({
    seed,
    expanded,
    onExpand,
    onCollapse,
    onDismiss,
    onFinished,
}: {
    seed: ActiveRunSummary;
    expanded: boolean;
    onExpand: (id: number) => void;
    onCollapse: (id: number) => void;
    onDismiss: (id: number) => void;
    onFinished: (id: number) => void;
}) {
    const [stream, setStream] = useState<StreamData>(() =>
        placeholderStream(seed),
    );

    useCelebrateOnSuccess(
        stream.status === 'succeeded' && celebratesOnSuccess(stream.kind),
    );

    // Pop this card's log panel open the moment it finishes, even if it was
    // minimized while running — but only if nothing else currently has the
    // stack's one expanded slot (handled by the parent via onFinished).
    const wasRunning = useRef(stream.status === 'running');
    useEffect(() => {
        if (wasRunning.current && stream.status !== 'running') {
            onFinished(seed.id);
            if (
                stream.kind === 'install-tool' ||
                stream.kind === 'setup-local'
            ) {
                forgetToolStatus();
            }
            router.reload({
                only: ['activeRuns', 'recentRuns', 'notifications'],
            });
        }
        wasRunning.current = stream.status === 'running';
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stream.status]);

    // Poll this run while it is active.
    useEffect(() => {
        let isMounted = true;

        const fetchStream = async () => {
            const res = await sendJson<StreamData>(
                `/runs/${seed.id}/stream`,
                'GET',
            );

            if (isMounted && res.ok) {
                setStream(res.data);
            }
        };

        void fetchStream();

        const interval = setInterval(() => {
            if (stream.status !== 'running') {
                clearInterval(interval);
                return;
            }
            void fetchStream();
        }, 1200);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [seed.id, stream.status]);

    const isRunning = stream.status === 'running';
    const isSucceeded = stream.status === 'succeeded';
    const isFailed = stream.status === 'failed';
    const [statusLabel, statusTone] = runStatus[
        stream.status as keyof typeof runStatus
    ] ?? ['Unknown', 'muted'];

    const detach = async () => {
        await sendJson(`/runs/${stream.id}/detach`, 'POST');
    };

    if (expanded) {
        return (
            <div
                key="expanded"
                className="mb-2 flex h-[460px] w-[620px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
            >
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
                        <StatusPill tone={statusTone}>{statusLabel}</StatusPill>
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
                            title="Minimize"
                            onClick={() => onCollapse(seed.id)}
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
                        className="h-full"
                    />
                </div>

                {/* Footer */}
                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-surface px-4 py-2 text-xs text-soft">
                    <span className="shrink-0">
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
                        {!isRunning && successActions(stream)}
                        {!isRunning && (
                            <button
                                type="button"
                                onClick={() => onDismiss(seed.id)}
                                className={buttonClass('ghost', 'sm')}
                            >
                                Dismiss
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            key="collapsed"
            className="flex items-center gap-3 rounded-full border border-line bg-surface/95 px-4 py-2.5 shadow-lg backdrop-blur-md transition-colors hover:bg-surface"
        >
            <div className="flex items-center gap-2">
                {isRunning && (
                    <RefreshCw className="size-3.5 animate-spin text-brand" />
                )}
                {isSucceeded && <CheckCircle2 className="size-3.5 text-ok" />}
                {isFailed && <AlertCircle className="size-3.5 text-accent" />}
                <span className="max-w-[240px] truncate text-xs font-medium text-ink">
                    {stream.label}
                </span>
                <StatusPill tone={statusTone}>{statusLabel}</StatusPill>
            </div>

            <div className="flex items-center gap-1 border-l border-line pl-2">
                <button
                    type="button"
                    onClick={() => onExpand(seed.id)}
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
                        onClick={() => onDismiss(seed.id)}
                        className="rounded-md p-1 text-soft transition hover:bg-paper hover:text-ink"
                    >
                        <X className="size-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
}

const explicitlyCollapsedIds = new Set<number>();

export default function RunDrawer() {
    const page = usePage<{
        activeRuns?: ActiveRunSummary[];
    }>();

    const activeRunsFromProps = page.props.activeRuns ?? [];
    const incomingKey = activeRunsFromProps.map((run) => run.id).join(',');

    // One card per run still being tracked, newest first. While on the page,
    // a run stays here (showing its final state) after it finishes, until dismissed.
    // On fresh page mount/reload, we only track runs that are currently active in props.
    const [seeds, setSeeds] = useState<ActiveRunSummary[]>(() => [
        ...activeRunsFromProps,
    ]);

    const [expandedId, setExpandedId] = useState<number | null>(() => {
        const first = activeRunsFromProps[0];
        if (!first || explicitlyCollapsedIds.has(first.id)) {
            return null;
        }
        return first.id;
    });
    const moveAside = useIsAnyRightDrawerOpen();

    useEffect(() => {
        const known = new Set(seeds.map((seed) => seed.id));
        const fresh = activeRunsFromProps.filter((run) => !known.has(run.id));

        if (fresh.length === 0) {
            return;
        }

        const newest = fresh[0];
        explicitlyCollapsedIds.delete(newest.id);
        setExpandedId(newest.id);

        setSeeds((prev) => [...fresh, ...prev]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [incomingKey]);

    function expand(id: number) {
        explicitlyCollapsedIds.delete(id);
        setExpandedId(id);
    }

    function collapse(id: number) {
        explicitlyCollapsedIds.add(id);
        setExpandedId(null);
    }

    function dismiss(id: number) {
        explicitlyCollapsedIds.delete(id);
        setSeeds((prev) => prev.filter((seed) => seed.id !== id));
        setExpandedId((prev) => (prev === id ? null : prev));
    }

    function finished(id: number) {
        if (explicitlyCollapsedIds.has(id)) {
            return;
        }
        // Only steal the expanded slot if nothing else is already in it —
        // a run finishing shouldn't yank focus from one you're reading.
        setExpandedId((prev) => prev ?? id);
    }

    if (page.component === 'runs/show' || seeds.length === 0) {
        // The runs/show page already shows its own run's full terminal
        // inline — the floating HUD would just duplicate that one card.
        return null;
    }

    return (
        <aside
            aria-label="Activity HUD"
            // Below every drawer/modal overlay (all z-50, mounted later in the
            // DOM so they'd otherwise win the tie and sit on top) so an open
            // drawer's own footer buttons are never covered by this HUD —
            // still comfortably above ordinary page content. A right-anchored
            // drawer being open would otherwise hide this completely behind
            // it (exactly where Quick Launch tells someone to come look for
            // it), so it moves to the opposite corner instead.
            className={cn(
                'fixed bottom-4 z-40 flex flex-col',
                moveAside ? 'left-6 items-start' : 'right-6 items-end',
            )}
        >
            {seeds.map((seed) => (
                <TrackedRun
                    key={seed.id}
                    seed={seed}
                    expanded={seed.id === expandedId}
                    onExpand={expand}
                    onCollapse={collapse}
                    onDismiss={dismiss}
                    onFinished={finished}
                />
            ))}
        </aside>
    );
}
