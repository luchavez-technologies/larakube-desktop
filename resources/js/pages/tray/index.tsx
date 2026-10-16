import { useEffect, useState, useTransition } from 'react';
import {
    Activity,
    ExternalLink,
    FolderGit2,
    Maximize2,
    Play,
    PowerOff,
    RefreshCw,
    Settings,
    Wrench,
    Layers,
    ChevronDown,
    Check,
} from 'lucide-react';
import TrayLayout from '@/layouts/tray-layout';
import ToolLogo, { brandIcon } from '@/components/tool-logo';
import EditorLogo from '@/components/editor-logo';
import ProviderLogo from '@/components/provider-logo';
import ConcentricRadialGauge from '@/components/metrics/concentric-radial-gauge';
import { openExternalUrl } from '@/lib/open-external';
import { sendJson } from '@/lib/http';
import { cn } from '@/lib/utils';

type ServerItem = {
    id: number;
    name: string;
    role: string;
    provider: string;
    status: string;
    context?: string | null;
    isPrimary?: boolean;
    isLocal?: boolean;
};

type ProjectItem = {
    id: number;
    name: string;
    path: string;
    webHost?: string | null;
    exists: boolean;
};

type ToolItem = {
    id: number;
    tool: string;
    host?: string | null;
    url?: string | null;
};

type PlexEngineTelemetry = {
    ramPercent: number | null;
    cpuPercent: number | null;
    capacityPercent: number;
    ramUsage?: string | null;
    ramLimit: string;
    cpuUsage?: string | null;
    cpuLimit: string;
    capacityUsage: number;
    capacityLimit: number;
    capacityLabel: string;
    capacityUnit: string;
};

type PlexEngine = {
    slot: string;
    driver: string;
    name: string;
    status: 'healthy' | 'degraded';
    statusText: string;
    telemetry?: PlexEngineTelemetry;
};

type PlexItem = {
    initialized: boolean;
    status: 'healthy' | 'degraded';
    statusText: string;
    engines: PlexEngine[];
} | null;

type ActiveRunItem = {
    id: number;
    label: string;
    kind?: string | null;
    status: string;
};

type MetricsItem = {
    cpuPercent?: number | null;
    memoryPercent?: number | null;
    cpuUsage?: string | null;
    memoryUsage?: string | null;
} | null;

type TrayProps = {
    servers: ServerItem[];
    selectedServerId?: number | null;
    metrics: MetricsItem;
    projects: ProjectItem[];
    tools: ToolItem[];
    plex?: PlexItem;
    activeRun: ActiveRunItem | null;
    windows: boolean;
};

function RadialGaugeMini({
    value,
    label,
    color = 'brand',
}: {
    value: number;
    label: string;
    color?: 'brand' | 'tools';
}) {
    const safe = Math.min(100, Math.max(0, value));
    const r = 15;
    const c = 2 * Math.PI * r;
    const offset = c - (safe / 100) * c;
    const strokeColor =
        safe >= 85
            ? 'stroke-accent'
            : safe >= 70
              ? 'stroke-warn'
              : color === 'brand'
                ? 'stroke-brand'
                : 'stroke-tools';

    return (
        <div className="flex flex-1 items-center gap-2.5 rounded-lg border border-line bg-surface p-2 shadow-2xs">
            <div className="relative size-9.5 shrink-0">
                <svg className="size-full -rotate-90" viewBox="0 0 38 38">
                    <circle
                        cx="19"
                        cy="19"
                        r={r}
                        fill="transparent"
                        className="stroke-badge"
                        strokeWidth="3.5"
                    />
                    <circle
                        cx="19"
                        cy="19"
                        r={r}
                        fill="transparent"
                        className={cn(
                            'transition-all duration-500 ease-out',
                            strokeColor,
                        )}
                        strokeWidth="3.5"
                        strokeDasharray={c}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-ink">
                    {safe}%
                </div>
            </div>
            <div className="flex flex-col truncate">
                <span className="text-[10px] font-semibold tracking-wider text-soft uppercase">
                    {label}
                </span>
                <span className="truncate text-[9px] font-medium text-faint">
                    {safe >= 80
                        ? 'Heavy Load'
                        : safe >= 50
                          ? 'Moderate'
                          : 'Optimal'}
                </span>
            </div>
        </div>
    );
}

export default function TrayIndex(initialProps: TrayProps) {
    const [data, setData] = useState<TrayProps>(initialProps);
    const [refreshing, setRefreshing] = useState(false);
    const [actionPending, startTransition] = useTransition();
    const [actionMessage, setActionMessage] = useState<string | null>(null);
    const [serverMenuOpen, setServerMenuOpen] = useState(false);

    const [selectedServerId, setSelectedServerId] = useState<number | null>(
        () => {
            if (typeof window !== 'undefined') {
                const stored = localStorage.getItem('larakube_tray_server_id');
                if (stored) {
                    const parsed = parseInt(stored, 10);
                    if (initialProps.servers.some((s) => s.id === parsed)) {
                        return parsed;
                    }
                }
            }
            return (
                initialProps.selectedServerId ??
                initialProps.servers[0]?.id ??
                null
            );
        },
    );

    const activeServer =
        data.servers.find((s) => s.id === selectedServerId) ??
        data.servers.find((s) => s.isPrimary) ??
        data.servers[0];

    const refreshData = async (overrideServerId?: number | null) => {
        setRefreshing(true);
        const targetId =
            overrideServerId !== undefined
                ? overrideServerId
                : selectedServerId;
        const query = targetId ? `?server_id=${targetId}` : '';
        try {
            const res = await sendJson<TrayProps>(`/tray/data${query}`, 'GET');
            if (res.ok && res.data) {
                setData(res.data);
                if (
                    res.data.selectedServerId &&
                    res.data.selectedServerId !== selectedServerId
                ) {
                    setSelectedServerId(res.data.selectedServerId);
                }
            }
        } catch {
        } finally {
            setRefreshing(false);
        }
    };

    // Auto-refresh telemetry every 5 seconds
    useEffect(() => {
        const timer = setInterval(() => {
            void refreshData();
        }, 5000);
        return () => clearInterval(timer);
    }, [selectedServerId]);

    const handleSelectServer = (id: number) => {
        setSelectedServerId(id);
        setServerMenuOpen(false);
        if (typeof window !== 'undefined') {
            localStorage.setItem('larakube_tray_server_id', String(id));
        }
        void refreshData(id);
    };

    const openMainWindow = async (path: string = '/') => {
        await sendJson('/tray/open-main', 'POST', { path });
    };

    const openSettings = async () => {
        await sendJson('/tray/open-settings', 'POST');
    };

    const openProject = async (id: number) => {
        await sendJson(`/tray/open-project/${id}`, 'POST');
    };

    const openServerPlex = async (id?: number) => {
        if (!id) return;
        await sendJson(`/tray/open-server/${id}`, 'POST');
    };

    const toggleProject = (id: number) => {
        startTransition(async () => {
            setActionMessage('Triggering project...');
            const res = await sendJson<{ success: boolean; message?: string }>(
                `/tray/projects/${id}/toggle`,
                'POST',
            );
            if (!res.ok) {
                setActionMessage(
                    res.data?.message || 'Failed to toggle project',
                );
            } else {
                setActionMessage('Task queued');
                await refreshData();
            }
            setTimeout(() => setActionMessage(null), 3000);
        });
    };

    const openEditor = async (id: number) => {
        await sendJson(`/tray/open-editor/${id}`, 'POST', { editor: 'vscode' });
    };

    const stopLocalFleet = () => {
        const isRemote = activeServer && !activeServer.isLocal;
        const confirmText = isRemote
            ? `Stop all local development containers on this computer? (Remote cluster "${activeServer?.name}" will not be affected.)`
            : 'Stop all local development workloads and containers?';

        if (!confirm(confirmText)) {
            return;
        }

        startTransition(async () => {
            setActionMessage('Stopping local workloads...');
            const res = await sendJson<{ success: boolean; message?: string }>(
                '/tray/stop-all',
                'POST',
            );
            if (!res.ok) {
                setActionMessage(
                    res.data?.message || 'Failed to stop local fleet',
                );
            } else {
                setActionMessage('Stop queued');
                await refreshData();
            }
            setTimeout(() => setActionMessage(null), 3000);
        });
    };

    return (
        <TrayLayout title="LaraKube Control Center">
            <div className="flex h-full flex-col justify-between">
                {/* Header */}
                <div className="border-b border-line bg-paper/60 px-3.5 py-2.5 backdrop-blur-xs">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="flex size-5.5 items-center justify-center rounded-md bg-accent text-[10px] font-bold text-white shadow-xs">
                                LK
                            </span>
                            <div>
                                <h1 className="text-xs leading-tight font-semibold tracking-tight text-ink">
                                    LaraKube Fleet
                                </h1>
                                {activeServer ? (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setServerMenuOpen((prev) => !prev)
                                        }
                                        className="mt-0.5 -ml-1 inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium text-soft transition hover:bg-badge hover:text-ink focus:outline-hidden"
                                    >
                                        <ProviderLogo
                                            provider={activeServer.provider}
                                            size="xs"
                                        />
                                        <span className="max-w-[130px] truncate font-medium text-ink">
                                            {activeServer.name}
                                        </span>
                                        <span className="size-1.5 shrink-0 rounded-full bg-ok" />
                                        <ChevronDown
                                            className={cn(
                                                'size-3 text-faint transition-transform duration-150',
                                                serverMenuOpen && 'rotate-180',
                                            )}
                                        />
                                    </button>
                                ) : (
                                    <p className="text-[10px] text-soft">
                                        No active server
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => void refreshData()}
                                disabled={refreshing}
                                title="Refresh telemetry"
                                className="inline-flex size-6 items-center justify-center rounded-md text-soft transition hover:bg-badge hover:text-ink disabled:opacity-40"
                            >
                                <RefreshCw
                                    className={cn(
                                        'size-3',
                                        refreshing &&
                                            'animate-spin text-accent',
                                    )}
                                />
                            </button>
                            <button
                                type="button"
                                onClick={() => void openMainWindow()}
                                title="Open main window"
                                className="inline-flex size-6 items-center justify-center rounded-md text-soft transition hover:bg-badge hover:text-ink"
                            >
                                <Maximize2 className="size-3" />
                            </button>
                        </div>
                    </div>

                    {/* Active Servers Dropdown */}
                    {serverMenuOpen && data.servers.length > 0 && (
                        <div className="animate-in fade-in zoom-in-95 mt-2 rounded-lg border border-line bg-surface p-1 shadow-lg">
                            <div className="px-2 py-1 text-[9px] font-semibold tracking-wider text-soft uppercase">
                                Active Clusters ({data.servers.length})
                            </div>
                            <div className="max-h-44 space-y-0.5 overflow-y-auto">
                                {data.servers.map((s) => {
                                    const isSelected =
                                        s.id === activeServer?.id;
                                    return (
                                        <button
                                            key={s.id}
                                            type="button"
                                            onClick={() =>
                                                handleSelectServer(s.id)
                                            }
                                            className={cn(
                                                'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition',
                                                isSelected
                                                    ? 'bg-badge font-medium text-ink'
                                                    : 'text-soft hover:bg-paper hover:text-ink',
                                            )}
                                        >
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <ProviderLogo
                                                    provider={s.provider}
                                                    size="xs"
                                                />
                                                <div className="truncate">
                                                    <div className="truncate text-xs font-medium text-ink">
                                                        {s.name}
                                                    </div>
                                                    <div className="truncate text-[10px] text-soft capitalize">
                                                        {s.isLocal
                                                            ? 'Local k3d'
                                                            : `${s.provider} • ${s.role}`}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1.5">
                                                <span className="size-1.5 rounded-full bg-ok" />
                                                {isSelected && (
                                                    <Check className="size-3.5 text-brand" />
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Radial Telemetry Gauges for Selected Server */}
                    {data.metrics && (
                        <div className="mt-2.5 flex items-center gap-2">
                            <RadialGaugeMini
                                value={data.metrics.cpuPercent ?? 0}
                                label="CPU Load"
                                color="brand"
                            />
                            <RadialGaugeMini
                                value={data.metrics.memoryPercent ?? 0}
                                label="RAM Usage"
                                color="tools"
                            />
                        </div>
                    )}

                    {/* Active Run HUD */}
                    {data.activeRun && (
                        <div className="mt-2 flex items-center justify-between rounded-lg border border-accent/20 bg-accent-tint/60 px-2 py-1.5 text-accent shadow-2xs">
                            <div className="flex items-center gap-1.5 overflow-hidden">
                                <span className="relative flex size-2 shrink-0">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                                    <span className="relative inline-flex size-2 rounded-full bg-accent" />
                                </span>
                                <span className="truncate text-[11px] font-medium">
                                    {data.activeRun.label}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => void openMainWindow()}
                                className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold underline underline-offset-2 hover:opacity-80"
                            >
                                <Activity className="size-2.5" /> View
                            </button>
                        </div>
                    )}

                    {actionMessage && !data.activeRun && (
                        <div className="animate-fade-in mt-1.5 rounded-md bg-badge px-2 py-1 text-center text-[10px] font-medium text-soft">
                            {actionMessage}
                        </div>
                    )}
                </div>

                {/* Body Content */}
                <div className="flex-1 space-y-3 overflow-y-auto p-3">
                    {/* Plex Commons Status & Engines */}
                    {data.plex?.initialized ? (
                        <div className="relative overflow-hidden rounded-xl border border-violet-500/25 bg-gradient-to-b from-violet-500/8 to-surface p-2.5 shadow-2xs">
                            <div className="mb-2 flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <span className="flex size-4.5 items-center justify-center rounded-md bg-violet-600/15 text-violet-600 dark:text-violet-400">
                                        <Layers className="size-3" />
                                    </span>
                                    <span className="text-[11px] font-semibold tracking-wider text-ink uppercase">
                                        Plex Commons
                                    </span>
                                </div>

                                <div className="flex items-center gap-2">
                                    {/* 3-Ring Concentric Gauge Key */}
                                    <div
                                        className="flex items-center gap-1.5 font-mono text-[8.5px] text-soft"
                                        title="Concentric Multi-Ring Gauge: Outer = RAM, Middle = CPU, Inner = Capacity/Slots"
                                    >
                                        <span className="inline-flex items-center gap-0.5">
                                            <span className="size-1 rounded-full bg-emerald-500" />{' '}
                                            RAM
                                        </span>
                                        <span className="inline-flex items-center gap-0.5">
                                            <span className="size-1 rounded-full bg-sky-500" />{' '}
                                            CPU
                                        </span>
                                        <span className="inline-flex items-center gap-0.5">
                                            <span className="size-1 rounded-full bg-violet-500" />{' '}
                                            Cap
                                        </span>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            void openServerPlex(
                                                activeServer?.id,
                                            )
                                        }
                                        title="Open Plex Commons in Main Window"
                                        className="p-0.5 text-soft transition hover:text-ink"
                                    >
                                        <ExternalLink className="size-2.5" />
                                    </button>
                                </div>
                            </div>

                            {/* Active Engines: 2-Column Balanced Deck with Concentric Radial Gauges */}
                            {data.plex.engines.length > 0 && (
                                <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                                    {data.plex.engines.map((engine) => {
                                        const isOk =
                                            engine.status === 'healthy';
                                        const ram =
                                            engine.telemetry?.ramPercent ??
                                            null;
                                        const cpu =
                                            engine.telemetry?.cpuPercent ??
                                            null;
                                        const cap =
                                            engine.telemetry?.capacityPercent ??
                                            0;

                                        const tooltip = [
                                            `${engine.name} (${engine.statusText})`,
                                            `• RAM: ${engine.telemetry?.ramUsage ?? '—'} / ${engine.telemetry?.ramLimit ?? '—'} (${ram !== null ? `${ram}%` : 'warming up'})`,
                                            `• CPU: ${engine.telemetry?.cpuUsage ?? '—'} / ${engine.telemetry?.cpuLimit ?? '—'} (${cpu !== null ? `${cpu}%` : 'warming up'})`,
                                            `• ${engine.telemetry?.capacityLabel ?? 'Capacity'}: ${engine.telemetry?.capacityUsage ?? 0} / ${engine.telemetry?.capacityLimit ?? '—'} ${engine.telemetry?.capacityUnit ?? ''} (${cap}%)`,
                                        ].join('\n');

                                        return (
                                            <div
                                                key={engine.driver}
                                                title={tooltip}
                                                className="group flex items-center gap-2 rounded-xl border border-line bg-surface/90 p-2 text-left shadow-2xs transition hover:border-violet-500/40 hover:bg-surface"
                                            >
                                                {/* 3-Ring Concentric Radial Gauge */}
                                                <ConcentricRadialGauge
                                                    size={40}
                                                    rings={[
                                                        {
                                                            value: ram,
                                                            label: 'RAM',
                                                        },
                                                        {
                                                            value: cpu,
                                                            label: 'CPU',
                                                        },
                                                        {
                                                            value: cap,
                                                            label:
                                                                engine.telemetry
                                                                    ?.capacityLabel ??
                                                                'Capacity',
                                                        },
                                                    ]}
                                                >
                                                    {brandIcon(
                                                        engine.driver,
                                                        11,
                                                    ) ?? (
                                                        <span
                                                            className={cn(
                                                                'size-1.5 rounded-full',
                                                                isOk
                                                                    ? 'bg-ok'
                                                                    : 'bg-warn',
                                                            )}
                                                        />
                                                    )}
                                                </ConcentricRadialGauge>

                                                {/* Engine Identity & 3-line micro telemetry */}
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center justify-between gap-1">
                                                        <span className="truncate text-[10px] leading-tight font-semibold text-ink">
                                                            {engine.name}
                                                        </span>
                                                        <span
                                                            className={cn(
                                                                'size-1.5 shrink-0 rounded-full',
                                                                isOk
                                                                    ? 'bg-ok'
                                                                    : 'bg-warn',
                                                            )}
                                                        />
                                                    </div>

                                                    <div className="mt-1 flex flex-col gap-0.5 font-mono text-[8.5px] leading-none">
                                                        <div className="flex items-center justify-between text-soft">
                                                            <span className="flex items-center gap-1">
                                                                <span className="size-1 rounded-full bg-emerald-500" />
                                                                <span>RAM</span>
                                                            </span>
                                                            <span
                                                                className={cn(
                                                                    'font-semibold',
                                                                    (ram ??
                                                                        0) >= 85
                                                                        ? 'text-rose-500'
                                                                        : (ram ??
                                                                                0) >=
                                                                            70
                                                                          ? 'text-amber-500'
                                                                          : 'text-ink',
                                                                )}
                                                            >
                                                                {ram !== null
                                                                    ? `${ram}%`
                                                                    : '—'}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center justify-between text-soft">
                                                            <span className="flex items-center gap-1">
                                                                <span className="size-1 rounded-full bg-sky-500" />
                                                                <span>CPU</span>
                                                            </span>
                                                            <span
                                                                className={cn(
                                                                    'font-semibold',
                                                                    (cpu ??
                                                                        0) >= 85
                                                                        ? 'text-rose-500'
                                                                        : (cpu ??
                                                                                0) >=
                                                                            70
                                                                          ? 'text-amber-500'
                                                                          : 'text-ink',
                                                                )}
                                                            >
                                                                {cpu !== null
                                                                    ? `${cpu}%`
                                                                    : '—'}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center justify-between text-soft">
                                                            <span className="flex items-center gap-1">
                                                                <span className="size-1 rounded-full bg-violet-500" />
                                                                <span className="max-w-[36px] truncate">
                                                                    {engine
                                                                        .telemetry
                                                                        ?.capacityLabel ??
                                                                        'Cap'}
                                                                </span>
                                                            </span>
                                                            <span
                                                                className={cn(
                                                                    'font-semibold',
                                                                    cap >= 85
                                                                        ? 'text-rose-500'
                                                                        : cap >=
                                                                            70
                                                                          ? 'text-amber-500'
                                                                          : 'text-ink',
                                                                )}
                                                            >
                                                                {cap}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ) : null}

                    {/* Deployed Projects Section for Selected Server */}
                    <div>
                        <div className="mb-1.5 flex items-center justify-between px-0.5">
                            <span className="flex items-center gap-1 text-[11px] font-semibold tracking-wider text-soft uppercase">
                                <FolderGit2 className="size-3 text-brand" />{' '}
                                Deployed Projects ({data.projects.length})
                            </span>
                            <button
                                type="button"
                                onClick={() => void openMainWindow()}
                                className="text-[10px] text-soft transition hover:text-ink"
                            >
                                View all
                            </button>
                        </div>

                        {data.projects.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-line p-3 text-center text-[11px] text-soft">
                                No projects deployed to{' '}
                                {activeServer?.name ?? 'this cluster'} yet.
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {data.projects.map((project) => (
                                    <div
                                        key={project.id}
                                        className="group flex items-center justify-between rounded-lg border border-line bg-surface p-1.5 shadow-2xs transition hover:border-brand/40"
                                    >
                                        <button
                                            type="button"
                                            onClick={() =>
                                                void openProject(project.id)
                                            }
                                            className="flex flex-1 items-center gap-2 overflow-hidden text-left"
                                        >
                                            <span
                                                className={cn(
                                                    'size-2 shrink-0 rounded-full',
                                                    project.exists
                                                        ? 'bg-ok'
                                                        : 'bg-faint',
                                                )}
                                            />
                                            <div className="truncate">
                                                <div className="truncate text-xs font-medium text-ink group-hover:text-brand">
                                                    {project.name}
                                                </div>
                                                {project.webHost && (
                                                    <div className="truncate font-mono text-[10px] text-soft">
                                                        {project.webHost}
                                                    </div>
                                                )}
                                            </div>
                                        </button>

                                        <div className="flex shrink-0 items-center gap-0.5">
                                            {project.webHost && (
                                                <button
                                                    type="button"
                                                    title={`Open https://${project.webHost}`}
                                                    onClick={() =>
                                                        void openExternalUrl(
                                                            `https://${project.webHost}`,
                                                        )
                                                    }
                                                    className="inline-flex size-6 items-center justify-center rounded-md text-soft transition hover:bg-badge hover:text-ink"
                                                >
                                                    <ExternalLink className="size-3" />
                                                </button>
                                            )}

                                            <button
                                                type="button"
                                                title="Open in VS Code"
                                                onClick={() =>
                                                    void openEditor(project.id)
                                                }
                                                className="inline-flex size-6 items-center justify-center rounded-md text-soft transition hover:bg-badge hover:text-ink"
                                            >
                                                <EditorLogo
                                                    slug="vscode"
                                                    size="xs"
                                                />
                                            </button>

                                            <button
                                                type="button"
                                                title="Toggle / Start project"
                                                disabled={actionPending}
                                                onClick={() =>
                                                    toggleProject(project.id)
                                                }
                                                className="inline-flex size-6 items-center justify-center rounded-md text-soft transition hover:bg-badge hover:text-ink disabled:opacity-40"
                                            >
                                                <Play className="size-3 text-ok" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Cluster Tools Quick Launchers for Selected Server */}
                    {data.tools.length > 0 && (
                        <div>
                            <div className="mb-1.5 flex items-center justify-between px-0.5">
                                <span className="flex items-center gap-1 text-[11px] font-semibold tracking-wider text-soft uppercase">
                                    <Wrench className="size-3 text-tools" />{' '}
                                    Cluster Tools (
                                    {activeServer?.name ?? 'Active'})
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-1.5">
                                {data.tools.map((tool) => (
                                    <button
                                        key={tool.id}
                                        type="button"
                                        disabled={!tool.url}
                                        onClick={() =>
                                            void openExternalUrl(tool.url)
                                        }
                                        className="flex items-center gap-1.5 rounded-lg border border-line bg-surface p-1.5 text-left shadow-2xs transition hover:border-tools/40 disabled:opacity-50"
                                    >
                                        <ToolLogo slug={tool.tool} size="sm" />
                                        <div className="truncate">
                                            <div className="truncate text-xs font-medium text-ink capitalize">
                                                {tool.tool}
                                            </div>
                                            <div className="truncate text-[9px] text-soft">
                                                {tool.host
                                                    ? 'Online'
                                                    : 'Installed'}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="border-t border-line bg-paper/60 p-2.5 backdrop-blur-xs">
                    <div className="flex items-center justify-between gap-1.5">
                        <button
                            type="button"
                            onClick={() => void openMainWindow()}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs font-medium text-ink shadow-2xs transition hover:bg-paper"
                        >
                            <Maximize2 className="size-3 text-brand" /> Open App
                        </button>

                        <button
                            type="button"
                            onClick={stopLocalFleet}
                            disabled={actionPending}
                            title="Stop all local workloads on this computer"
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-accent shadow-2xs transition hover:bg-accent-tint disabled:opacity-50"
                        >
                            <PowerOff className="size-3" /> Stop Local
                        </button>

                        <button
                            type="button"
                            onClick={() => void openSettings()}
                            title="Open Settings in Main Window"
                            className="inline-flex size-7.5 items-center justify-center rounded-lg border border-line bg-surface text-soft shadow-2xs transition hover:bg-paper hover:text-ink"
                        >
                            <Settings className="size-3.5" />
                        </button>
                    </div>
                </div>
            </div>
        </TrayLayout>
    );
}
