import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Eye, RefreshCw } from 'lucide-react';
import LiveDot from '@/components/live-dot';
import { ago } from '@/lib/backups';
import { sendJson } from '@/lib/http';
import { cn } from '@/lib/utils';
import {
    show as liveReloadShow,
    update as liveReloadUpdate,
} from '@/routes/projects/live-reload';

export type LiveReloadEvent = {
    at: string;
    files: string[];
    reload: {
        targets: string[];
        ok: boolean;
        ms: number;
        errors: Record<string, string>;
    } | null;
};

export type LiveReloadState = {
    enabled: boolean;
    status: 'off' | 'starting' | 'watching' | 'idle' | 'failed' | 'stopped';
    targets: string[];
    events: LiveReloadEvent[];
    lastReloadAt: string | null;
    lastReloadOk: boolean | null;
    error: string | null;
};

/** A process name as people know it: "horizon" → "Horizon", the web pod → "Octane". */
function targetLabel(target: string): string {
    if (target === 'web') return 'Octane';

    return target.charAt(0).toUpperCase() + target.slice(1);
}

function list(targets: string[]): string {
    const labels = targets.map(targetLabel);

    return labels.length <= 1
        ? (labels[0] ?? '')
        : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

function fileName(path: string): string {
    return path.split('/').pop() ?? path;
}

/**
 * The project's live reload state, polled while the local environment is on
 * screen. `setEnabled` flips the project's switch.
 */
export function useLiveReload(projectId: number, active: boolean) {
    const [state, setState] = useState<LiveReloadState | null>(null);
    const [pending, setPending] = useState(false);

    const load = useCallback(() => {
        sendJson<LiveReloadState>(liveReloadShow(projectId).url, 'GET')
            .then(({ ok, data }) => ok && setState(data))
            .catch(() => {});
    }, [projectId]);

    useEffect(() => {
        if (!active) return;

        load();
        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible') load();
        }, 3000);

        return () => window.clearInterval(timer);
    }, [active, load]);

    const setEnabled = useCallback(
        (enabled: boolean) => {
            setPending(true);
            void sendJson<LiveReloadState>(
                liveReloadUpdate(projectId).url,
                'POST',
                {
                    enabled,
                },
            )
                .then(({ ok, data }) => ok && setState(data))
                .finally(() => setPending(false));
        },
        [projectId],
    );

    return { state, pending, setEnabled };
}

/** Which pods live reload restarts right now (none unless it is watching). */
export function reloadedTargets(state: LiveReloadState | null): string[] {
    return state?.enabled && state.status === 'watching' ? state.targets : [];
}

/**
 * The Live reload row of the local panel: the switch, what it is doing in
 * words, and the last few saves it reloaded for.
 */
export function LiveReloadRow({
    state,
    pending,
    running,
    onToggle,
}: {
    state: LiveReloadState | null;
    pending: boolean;
    running: boolean;
    onToggle: (enabled: boolean) => void;
}) {
    const [open, setOpen] = useState(false);

    // Nothing in this project keeps code in memory: the row has nothing to offer.
    if (state === null || (state.status === 'idle' && state.enabled)) {
        return null;
    }

    const enabled = state.enabled;
    const watching = enabled && state.status === 'watching';
    const failed = enabled && state.status === 'failed';
    const lastReload = state.lastReloadAt ? ago(state.lastReloadAt) : null;

    const summary = !enabled
        ? 'Off. Use Reload Workers after changing code.'
        : failed
          ? (state.error ?? 'Live reload stopped.')
          : watching
            ? `Reloads ${list(state.targets)} when you save${lastReload ? ` · last reload ${lastReload}${state.lastReloadOk === false ? ' (failed)' : ''}` : ''}`
            : running
              ? 'Starting…'
              : 'Starts when the project is running.';

    return (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                    <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        aria-label="Live reload"
                        disabled={pending}
                        onClick={() => onToggle(!enabled)}
                        className={cn(
                            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition disabled:opacity-60',
                            enabled ? 'bg-brand' : 'bg-line',
                        )}
                    >
                        <span
                            className={cn(
                                'inline-block size-4 rounded-full bg-white shadow-xs transition',
                                enabled ? 'translate-x-4.5' : 'translate-x-0.5',
                            )}
                        />
                    </button>
                    <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-xs font-medium text-ink">
                            <Eye className="size-3.5 text-soft" />
                            Live reload
                            {watching && <LiveDot size="sm" />}
                        </p>
                        <p
                            className={cn(
                                'mt-0.5 text-xs',
                                failed ? 'text-accent' : 'text-soft',
                            )}
                        >
                            {summary}
                        </p>
                    </div>
                </div>

                {state.events.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setOpen((value) => !value)}
                        aria-expanded={open}
                        className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-soft hover:text-ink"
                    >
                        <RefreshCw className="size-3.5" />
                        Recent reloads
                        <ChevronDown
                            className={cn(
                                'size-3.5 transition',
                                open && 'rotate-180',
                            )}
                        />
                    </button>
                )}
            </div>

            {open && state.events.length > 0 && (
                <ul className="divide-y divide-line/60 rounded-xl bg-paper px-3 ring-1 ring-line">
                    {state.events.map((event, index) => (
                        <li
                            key={`${event.at}-${index}`}
                            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2 text-xs"
                        >
                            <span className="min-w-0 text-ink">
                                <span
                                    className="font-mono"
                                    title={event.files.join('\n')}
                                >
                                    {event.files.length === 0
                                        ? 'Reload'
                                        : event.files.length === 1
                                          ? fileName(event.files[0])
                                          : `${fileName(event.files[0])} and ${event.files.length - 1} more`}
                                </span>
                                <span className="text-soft"> → </span>
                                {event.reload === null ? (
                                    <span className="text-soft">
                                        Reloading…
                                    </span>
                                ) : event.reload.ok ? (
                                    <span className="text-ok">
                                        {list(event.reload.targets)} reloaded (
                                        {(event.reload.ms / 1000).toFixed(1)}s)
                                    </span>
                                ) : (
                                    <span
                                        className="text-accent"
                                        title={Object.entries(
                                            event.reload.errors,
                                        )
                                            .map(
                                                ([target, error]) =>
                                                    `${targetLabel(target)}: ${error}`,
                                            )
                                            .join('\n')}
                                    >
                                        {list(Object.keys(event.reload.errors))}{' '}
                                        failed to reload
                                    </span>
                                )}
                            </span>
                            <span className="shrink-0 text-faint">
                                {ago(event.at)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

/** On a pod row: this pod restarts gracefully whenever code is saved. */
export function LiveReloadBadge() {
    return (
        <span
            className="inline-flex items-center gap-1 rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand"
            title="Live reload restarts this gracefully whenever you save code"
        >
            <RefreshCw className="size-2.5" />
            reloads on save
        </span>
    );
}
