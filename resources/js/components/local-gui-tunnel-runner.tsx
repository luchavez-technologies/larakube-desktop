import { useEffect, useState } from 'react';
import {
    Check,
    ChevronDown,
    Copy,
    Database,
    ExternalLink,
    HardDrive,
    Play,
    Square,
    Terminal,
    Zap,
} from 'lucide-react';
import { buttonClass } from '@/components/button';
import { cn } from '@/lib/utils';

export type TunnelServiceItem = {
    key: string;
    label: string;
    service: string;
    namespace: string;
    localPort: number;
    remotePort: number;
    kind: 'database' | 'cache' | 'storage';
    clientUri?: string;
    rawCommand: string;
};

type TunnelState = {
    alias: string;
    namespace: string;
    service: string;
    localPort: number;
    remotePort: number;
    active: boolean;
};

export default function LocalGuiTunnelRunner({
    items,
}: {
    items: TunnelServiceItem[];
    namespace: string;
}) {
    const [tunnels, setTunnels] = useState<Record<string, TunnelState>>({});
    const [loading, setLoading] = useState<Record<string, boolean>>({});
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [showRaw, setShowRaw] = useState(false);

    const fetchStatus = async () => {
        try {
            const res = await fetch('/tunnels');
            if (res.ok) {
                const data = (await res.json()) as {
                    tunnels: Record<string, TunnelState>;
                };
                setTunnels(data.tunnels || {});
            }
        } catch {
            // Ignore fetch errors during polling
        }
    };

    useEffect(() => {
        void fetchStatus();
        const interval = setInterval(() => {
            void fetchStatus();
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    const isRunning = (item: TunnelServiceItem) => {
        const key = `${item.namespace}_${item.service}_${item.localPort}`;
        return Boolean(tunnels[key]?.active);
    };

    const handleStart = async (item: TunnelServiceItem) => {
        setLoading((prev) => ({ ...prev, [item.key]: true }));
        try {
            const res = await fetch('/tunnels/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN':
                        (
                            document.querySelector(
                                'meta[name="csrf-token"]',
                            ) as HTMLMetaElement
                        )?.content || '',
                },
                body: JSON.stringify({
                    namespace: item.namespace,
                    service: item.service,
                    localPort: item.localPort,
                    remotePort: item.remotePort,
                }),
            });
            if (res.ok) {
                const data = (await res.json()) as {
                    tunnels: Record<string, TunnelState>;
                };
                setTunnels(data.tunnels || {});
            }
        } finally {
            setLoading((prev) => ({ ...prev, [item.key]: false }));
        }
    };

    const handleStop = async (item: TunnelServiceItem) => {
        setLoading((prev) => ({ ...prev, [item.key]: true }));
        try {
            const res = await fetch('/tunnels/stop', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN':
                        (
                            document.querySelector(
                                'meta[name="csrf-token"]',
                            ) as HTMLMetaElement
                        )?.content || '',
                },
                body: JSON.stringify({
                    namespace: item.namespace,
                    service: item.service,
                    localPort: item.localPort,
                }),
            });
            if (res.ok) {
                const data = (await res.json()) as {
                    tunnels: Record<string, TunnelState>;
                };
                setTunnels(data.tunnels || {});
            }
        } finally {
            setLoading((prev) => ({ ...prev, [item.key]: false }));
        }
    };

    const handleStartAll = async () => {
        for (const item of items) {
            if (!isRunning(item)) {
                await handleStart(item);
            }
        }
    };

    const handleStopAll = async () => {
        for (const item of items) {
            if (isRunning(item)) {
                await handleStop(item);
            }
        }
    };

    const copyText = (text: string, key: string) => {
        void navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const anyRunning = items.some((i) => isRunning(i));

    return (
        <div className="space-y-4">
            {/* Header controls */}
            <div className="flex items-center justify-between rounded-xl border border-line bg-paper/60 px-4 py-2.5">
                <div>
                    <h3 className="text-xs font-semibold text-ink">
                        Local GUI Tunnels
                    </h3>
                    <p className="text-[11px] text-soft">
                        Connect local desktop clients (TablePlus, DBeaver,
                        RedisInsight) to cluster services.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {anyRunning ? (
                        <button
                            type="button"
                            onClick={handleStopAll}
                            className={buttonClass('danger', 'sm', 'gap-1.5')}
                        >
                            <Square className="size-3.5 fill-current" />
                            <span>Stop all tunnels</span>
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handleStartAll}
                            className={buttonClass('primary', 'sm', 'gap-1.5')}
                        >
                            <Play className="size-3.5 fill-current" />
                            <span>Start all tunnels</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Service list */}
            <div className="space-y-2.5">
                {items.map((item) => {
                    const running = isRunning(item);
                    const isBusy = loading[item.key];
                    const Icon =
                        item.kind === 'database'
                            ? Database
                            : item.kind === 'cache'
                              ? Zap
                              : HardDrive;

                    return (
                        <div
                            key={item.key}
                            className={cn(
                                'flex flex-col justify-between gap-3 rounded-xl border p-3.5 transition-all duration-150 sm:flex-row sm:items-center',
                                running
                                    ? 'border-emerald-500/30 bg-emerald-500/5'
                                    : 'border-line bg-surface',
                            )}
                        >
                            <div className="flex items-start gap-3">
                                <div
                                    className={cn(
                                        'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ring-1',
                                        running
                                            ? 'bg-emerald-500/10 text-emerald-500 ring-emerald-500/30'
                                            : 'bg-paper text-soft ring-line',
                                    )}
                                >
                                    <Icon className="size-4" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-semibold text-ink">
                                            {item.label}
                                        </span>
                                        {running ? (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                                <span className="relative flex size-1.5">
                                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                                                    <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500"></span>
                                                </span>
                                                127.0.0.1:{item.localPort}
                                            </span>
                                        ) : (
                                            <span className="rounded-full bg-line/60 px-2 py-0.5 text-[10px] text-soft">
                                                Offline
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-0.5 font-mono text-[11px] text-soft">
                                        svc/{item.service} ↔ 127.0.0.1:
                                        {item.localPort}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                {running && item.clientUri && (
                                    <a
                                        href={item.clientUri}
                                        className={buttonClass(
                                            'secondary',
                                            'sm',
                                            'gap-1.5',
                                        )}
                                        title="Open in TablePlus, DBeaver, or registered GUI"
                                    >
                                        <ExternalLink className="size-3" />
                                        <span>Open client</span>
                                    </a>
                                )}

                                <button
                                    type="button"
                                    onClick={() =>
                                        copyText(
                                            `127.0.0.1:${item.localPort}`,
                                            item.key,
                                        )
                                    }
                                    className={buttonClass(
                                        'ghost',
                                        'sm',
                                        'gap-1.5 text-soft',
                                    )}
                                    title="Copy local host and port"
                                >
                                    {copiedKey === item.key ? (
                                        <>
                                            <Check className="size-3 text-emerald-500" />
                                            <span className="text-emerald-500">
                                                Copied
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="size-3" />
                                            <span>Copy port</span>
                                        </>
                                    )}
                                </button>

                                {running ? (
                                    <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() => handleStop(item)}
                                        className={buttonClass(
                                            'danger',
                                            'sm',
                                            'gap-1.5',
                                        )}
                                    >
                                        <Square className="size-3 fill-current" />
                                        <span>Stop tunnel</span>
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() => handleStart(item)}
                                        className={buttonClass(
                                            'primary',
                                            'sm',
                                            'gap-1.5',
                                        )}
                                    >
                                        <Play className="size-3 fill-current" />
                                        <span>Start tunnel</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Collapsible raw CLI snippet for terminal power-users */}
            <div className="rounded-xl border border-line bg-paper/40 p-3">
                <button
                    type="button"
                    onClick={() => setShowRaw((prev) => !prev)}
                    className="flex w-full items-center justify-between text-left text-xs font-medium text-soft hover:text-ink"
                >
                    <div className="flex items-center gap-1.5">
                        <Terminal className="size-3.5" />
                        <span>
                            View raw CLI port-forward commands (optional)
                        </span>
                    </div>
                    <ChevronDown
                        className={cn(
                            'size-3.5 transition-transform',
                            showRaw && 'rotate-180',
                        )}
                    />
                </button>
                {showRaw && (
                    <div className="relative mt-3">
                        <pre className="custom-scrollbar max-h-48 overflow-x-auto rounded-lg border border-term-line bg-term p-3 font-mono text-[11px] leading-relaxed text-term-bright">
                            {items.map((i) => i.rawCommand).join('\n\n')}
                        </pre>
                        <button
                            type="button"
                            onClick={() =>
                                copyText(
                                    items.map((i) => i.rawCommand).join('\n\n'),
                                    'all_raw',
                                )
                            }
                            className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md border border-term-line bg-term/90 px-2 py-1 text-[10px] text-term-text transition hover:border-brand hover:text-white"
                        >
                            {copiedKey === 'all_raw' ? (
                                <>
                                    <Check className="size-3 text-emerald-400" />
                                    <span>Copied</span>
                                </>
                            ) : (
                                <>
                                    <Copy className="size-3" />
                                    <span>Copy commands</span>
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
