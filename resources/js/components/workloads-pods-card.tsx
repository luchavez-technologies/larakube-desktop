import { useState, useEffect, useCallback } from 'react';
import { router } from '@inertiajs/react';
import {
    Layers,
    RotateCw,
    FileText,
    X,
    Terminal,
    SquareTerminal,
    Clock,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import LogPanel from '@/components/log-panel';
import StatusPill from '@/components/status-pill';
import { cn } from '@/lib/utils';
import type { PodInfo, Project } from '@/types/larakube';

export default function WorkloadsPodsCard({
    project,
    activeEnv,
    pods = [],
    k9sInstalled = false,
    onOpenK9s,
    launchingK9s = false,
}: {
    project: Project;
    activeEnv: string;
    pods?: PodInfo[];
    k9sInstalled?: boolean;
    onOpenK9s?: () => void;
    launchingK9s?: boolean;
}) {
    const [selectedPodForLogs, setSelectedPodForLogs] =
        useState<PodInfo | null>(null);
    const [logs, setLogs] = useState<string>('');
    const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
    const [selectedContainer, setSelectedContainer] = useState<string>('');
    const [refreshing, setRefreshing] = useState(false);
    const [restartingPod, setRestartingPod] = useState<string | null>(null);
    const [launchingTerminal, setLaunchingTerminal] = useState<string | null>(
        null,
    );
    const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(10);
    const [liveLogs, setLiveLogs] = useState<boolean>(true);

    const handleRefresh = () => {
        setRefreshing(true);
        router.reload({
            only: ['pods'],
            onFinish: () => setRefreshing(false),
        });
    };

    const handleOpenTerminal = (podName: string, container?: string) => {
        setLaunchingTerminal(podName);
        router.post(
            `/projects/${project.id}/pods/${podName}/terminal`,
            {
                environment: activeEnv,
                ...(container ? { container } : {}),
            },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => setLaunchingTerminal(null),
            },
        );
    };

    useEffect(() => {
        if (autoRefreshInterval <= 0) return;

        const timer = setInterval(() => {
            if (
                typeof document !== 'undefined' &&
                (document.hidden || selectedPodForLogs || refreshing)
            ) {
                return;
            }

            router.reload({
                only: ['pods'],
            });
        }, autoRefreshInterval * 1000);

        return () => clearInterval(timer);
    }, [autoRefreshInterval, selectedPodForLogs, refreshing]);

    const fetchPodLogs = useCallback(
        async (pod: PodInfo, container: string, isInitial = false) => {
            if (isInitial) {
                setLoadingLogs(true);
                setLogs('');
            }

            try {
                const query = new URLSearchParams({
                    environment: activeEnv,
                    ...(container ? { container } : {}),
                });
                const res = await fetch(
                    `/projects/${project.id}/pods/${pod.name}/logs?${query.toString()}`,
                    {
                        headers: {
                            Accept: 'application/json',
                        },
                    },
                );
                if (res.ok) {
                    const data = await res.json();
                    setLogs(data.logs || 'No log output recorded.');
                } else if (isInitial) {
                    setLogs('Failed to load container logs.');
                }
            } catch (e: any) {
                if (isInitial) {
                    setLogs(`Error loading container logs: ${e?.message ?? e}`);
                }
            } finally {
                if (isInitial) {
                    setLoadingLogs(false);
                }
            }
        },
        [activeEnv, project.id],
    );

    const handleOpenLogs = (pod: PodInfo, container?: string) => {
        setSelectedPodForLogs(pod);
        const targetContainer = container || pod.containers[0] || '';
        setSelectedContainer(targetContainer);
        void fetchPodLogs(pod, targetContainer, true);
    };

    // Auto-poll logs every 2s while modal is open and liveLogs is active
    useEffect(() => {
        if (!selectedPodForLogs || !liveLogs) return;

        const timer = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            void fetchPodLogs(selectedPodForLogs, selectedContainer, false);
        }, 2000);

        return () => clearInterval(timer);
    }, [selectedPodForLogs, selectedContainer, liveLogs, fetchPodLogs]);

    const handleRestartPod = (podName: string) => {
        setRestartingPod(podName);
        router.post(
            `/projects/${project.id}/pods/${podName}/restart`,
            { environment: activeEnv },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => {
                    setRestartingPod(null);
                    router.reload({ only: ['pods'] });
                },
            },
        );
    };

    return (
        <>
            <Card
                label="Workloads & Pods"
                action={
                    <div className="flex flex-wrap items-center gap-2">
                        {onOpenK9s && (
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={launchingK9s}
                                onClick={onOpenK9s}
                                className="gap-1.5 text-xs font-medium"
                                title={
                                    k9sInstalled
                                        ? `Open k9s terminal UI scoped to ${activeEnv}`
                                        : 'k9s recommended for pod observability'
                                }
                            >
                                <SquareTerminal className="size-3.5 text-brand" />
                                <span>
                                    {launchingK9s ? 'Opening…' : 'Open k9s'}
                                </span>
                            </Button>
                        )}

                        {/* Auto-refresh interval toggle */}
                        <div
                            className="flex items-center rounded-lg border border-line bg-surface/80 p-0.5 shadow-2xs"
                            title="Auto-refresh pods interval"
                        >
                            <div className="flex items-center gap-1 px-1.5 text-[10px] font-semibold tracking-wider text-soft uppercase">
                                <Clock className="size-3 text-soft" />
                                <span className="hidden sm:inline-block">
                                    Auto
                                </span>
                            </div>
                            {[
                                { label: 'Off', value: 0 },
                                { label: '5s', value: 5 },
                                { label: '10s', value: 10 },
                                { label: '30s', value: 30 },
                            ].map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() =>
                                        setAutoRefreshInterval(opt.value)
                                    }
                                    className={cn(
                                        'rounded-md px-2 py-0.5 text-[11px] font-medium transition',
                                        autoRefreshInterval === opt.value
                                            ? 'bg-brand/15 font-semibold text-brand shadow-2xs'
                                            : 'text-soft hover:text-ink',
                                    )}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>

                        {/* Manual Refresh button */}
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={refreshing}
                            onClick={handleRefresh}
                            className="gap-1 text-xs text-soft hover:text-ink"
                            title="Refresh pods list now"
                        >
                            <RotateCw
                                className={cn(
                                    'size-3.5',
                                    refreshing && 'animate-spin',
                                )}
                            />
                            <span className="hidden sm:inline">Refresh</span>
                        </Button>
                    </div>
                }
            >
                {pods.length === 0 ? (
                    <div className="py-6 text-center">
                        <Layers className="mx-auto size-7 text-faint" />
                        <p className="mt-2 text-xs font-medium text-ink">
                            No pods running in this environment
                        </p>
                        <p className="mt-0.5 text-xs text-soft">
                            Start or Up this environment to launch project
                            containers.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="border-b border-line text-[11px] font-medium tracking-wider text-soft uppercase">
                                    <th className="pb-2.5">Workload / Pod</th>
                                    <th className="pb-2.5">Status</th>
                                    <th className="pb-2.5">Ready</th>
                                    <th className="pb-2.5">Restarts</th>
                                    <th className="pb-2.5">Age</th>
                                    <th className="pb-2.5 text-right">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-line/60">
                                {pods.map((pod) => (
                                    <tr
                                        key={pod.name}
                                        className="transition-colors hover:bg-paper/40"
                                    >
                                        <td className="py-3 pr-3">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-ink">
                                                    {pod.componentLabel}
                                                </span>
                                                <span className="rounded bg-line/60 px-1.5 py-0.5 font-mono text-[10px] text-soft">
                                                    {pod.component}
                                                </span>
                                            </div>
                                            <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-soft">
                                                <span
                                                    className="max-w-[200px] truncate md:max-w-xs"
                                                    title={pod.name}
                                                >
                                                    {pod.name}
                                                </span>
                                                <CopyButton
                                                    value={pod.name}
                                                    label=""
                                                    copiedLabel=""
                                                    size="xs"
                                                />
                                            </div>
                                        </td>
                                        <td className="py-3 pr-3">
                                            <StatusPill tone={pod.statusTone}>
                                                {pod.statusText}
                                            </StatusPill>
                                        </td>
                                        <td className="py-3 pr-3 font-mono text-soft">
                                            {pod.ready}
                                        </td>
                                        <td className="py-3 pr-3 font-mono">
                                            {pod.restarts > 0 ? (
                                                <span className="inline-flex rounded bg-accent/10 px-1.5 py-0.5 text-[11px] font-semibold text-accent">
                                                    {pod.restarts}
                                                </span>
                                            ) : (
                                                <span className="text-soft">
                                                    0
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-3 pr-3 font-mono text-soft">
                                            {pod.age}
                                        </td>
                                        <td className="py-3 text-right">
                                            {(() => {
                                                const primaryContainer =
                                                    pod.containers.find(
                                                        (c) =>
                                                            c === 'php' ||
                                                            c === 'app' ||
                                                            c === 'web' ||
                                                            c === 'node',
                                                    ) ||
                                                    pod.containers[0] ||
                                                    '';

                                                return (
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <Button
                                                            type="button"
                                                            variant="secondary"
                                                            size="sm"
                                                            disabled={
                                                                pod.phase !==
                                                                    'Running' ||
                                                                launchingTerminal ===
                                                                    pod.name
                                                            }
                                                            onClick={() =>
                                                                handleOpenTerminal(
                                                                    pod.name,
                                                                    primaryContainer,
                                                                )
                                                            }
                                                            className="gap-1 text-xs"
                                                            title={
                                                                pod.phase ===
                                                                'Running'
                                                                    ? `Open interactive shell in ${pod.name} (${primaryContainer || 'default'})`
                                                                    : 'Pod must be Running to open terminal'
                                                            }
                                                        >
                                                            <Terminal className="size-3" />
                                                            <span>
                                                                {launchingTerminal ===
                                                                pod.name
                                                                    ? 'Opening…'
                                                                    : 'Terminal'}
                                                            </span>
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="secondary"
                                                            size="sm"
                                                            onClick={() =>
                                                                handleOpenLogs(
                                                                    pod,
                                                                )
                                                            }
                                                            className="gap-1 text-xs"
                                                            title={`View logs for ${pod.name}`}
                                                        >
                                                            <FileText className="size-3" />
                                                            <span>Logs</span>
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            disabled={
                                                                restartingPod ===
                                                                pod.name
                                                            }
                                                            onClick={() =>
                                                                handleRestartPod(
                                                                    pod.name,
                                                                )
                                                            }
                                                            className="gap-1 text-xs text-soft hover:text-ink"
                                                            title={`Restart pod ${pod.name}`}
                                                        >
                                                            <RotateCw
                                                                className={cn(
                                                                    'size-3',
                                                                    restartingPod ===
                                                                        pod.name &&
                                                                        'animate-spin',
                                                                )}
                                                            />
                                                            <span>
                                                                {restartingPod ===
                                                                pod.name
                                                                    ? 'Rolling…'
                                                                    : 'Restart'}
                                                            </span>
                                                        </Button>
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Container Logs Modal */}
            {selectedPodForLogs && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
                    <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-surface p-5 shadow-2xl ring-1 ring-line">
                        <div className="flex items-center justify-between border-b border-line pb-3">
                            <div className="flex min-w-0 items-center gap-2.5">
                                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                                    <Terminal className="size-3.5" />
                                </span>
                                <div className="min-w-0">
                                    <h3 className="truncate text-sm font-semibold text-ink">
                                        Logs: {selectedPodForLogs.name}
                                    </h3>
                                    <p className="text-[11px] text-soft">
                                        {selectedPodForLogs.componentLabel} ·{' '}
                                        {activeEnv}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setLiveLogs(!liveLogs)}
                                    className={cn(
                                        'flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                                        liveLogs
                                            ? 'border-brand/40 bg-brand/10 text-brand'
                                            : 'border-line text-soft hover:bg-paper hover:text-ink',
                                    )}
                                    title={
                                        liveLogs
                                            ? 'Pause live tailing'
                                            : 'Resume live tailing'
                                    }
                                >
                                    <span
                                        className={cn(
                                            'size-2 rounded-full',
                                            liveLogs
                                                ? 'animate-pulse bg-emerald-500'
                                                : 'bg-soft',
                                        )}
                                    />
                                    <span>
                                        {liveLogs ? 'Live (2s)' : 'Paused'}
                                    </span>
                                </button>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    disabled={
                                        selectedPodForLogs.phase !==
                                            'Running' ||
                                        launchingTerminal ===
                                            selectedPodForLogs.name
                                    }
                                    onClick={() =>
                                        handleOpenTerminal(
                                            selectedPodForLogs.name,
                                            selectedContainer,
                                        )
                                    }
                                    className="gap-1 text-xs"
                                    title={`Open interactive shell in ${selectedContainer || selectedPodForLogs.name}`}
                                >
                                    <Terminal className="size-3" />
                                    <span>
                                        {launchingTerminal ===
                                        selectedPodForLogs.name
                                            ? 'Opening…'
                                            : 'Terminal'}
                                    </span>
                                </Button>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    disabled={loadingLogs}
                                    onClick={() =>
                                        void fetchPodLogs(
                                            selectedPodForLogs,
                                            selectedContainer,
                                            false,
                                        )
                                    }
                                    className="gap-1 text-xs"
                                    title="Refresh logs now"
                                >
                                    <RotateCw
                                        className={cn(
                                            'size-3',
                                            loadingLogs && 'animate-spin',
                                        )}
                                    />
                                    <span>Refresh</span>
                                </Button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedPodForLogs(null)}
                                    className="cursor-pointer rounded-lg p-1 text-soft transition-colors hover:text-ink focus:outline-none"
                                >
                                    <X className="size-4" />
                                </button>
                            </div>
                        </div>

                        {/* Multi-container switcher tabs */}
                        {selectedPodForLogs.containers.length > 1 && (
                            <div className="flex items-center gap-1.5 border-b border-line pt-3 pb-2.5">
                                <span className="text-[11px] font-medium text-soft uppercase">
                                    Container:
                                </span>
                                {selectedPodForLogs.containers.map(
                                    (container) => (
                                        <button
                                            key={container}
                                            type="button"
                                            onClick={() =>
                                                handleOpenLogs(
                                                    selectedPodForLogs,
                                                    container,
                                                )
                                            }
                                            className={cn(
                                                'cursor-pointer rounded-lg px-2.5 py-1 font-mono text-xs transition-colors',
                                                selectedContainer === container
                                                    ? 'bg-brand/10 font-semibold text-brand ring-1 ring-brand/30'
                                                    : 'text-soft hover:bg-paper hover:text-ink',
                                            )}
                                        >
                                            {container}
                                        </button>
                                    ),
                                )}
                            </div>
                        )}

                        {/* Logs Output */}
                        <div className="mt-3 min-h-0 flex-1 overflow-hidden">
                            <LogPanel
                                output={
                                    loadingLogs
                                        ? 'Fetching container logs…'
                                        : logs
                                }
                                placeholder="No logs recorded."
                                className="h-[400px] max-h-[55vh]"
                                follow={true}
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
