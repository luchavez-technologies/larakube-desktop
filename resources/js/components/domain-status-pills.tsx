import { Check, Lock, RotateCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type DomainDnsStatus = {
    ready: boolean;
    records: string[];
    detail: string;
};

type DomainHttpsStatus = {
    ready: boolean;
    status: number | null;
    detail: string;
};

export type DomainStatusPayload = {
    host: string;
    dns: DomainDnsStatus;
    https: DomainHttpsStatus;
};

type DomainStatusPillsProps = {
    host: string | null | undefined;
    showDetail?: boolean;
    className?: string;
};

const POLL_INTERVAL_MS = 5000;
const statusCache = new Map<string, DomainStatusPayload>();

function normalizeHost(raw: string | null | undefined): string {
    if (!raw) {
        return '';
    }

    const trimmed = raw.trim().toLowerCase();
    if (!trimmed) {
        return '';
    }

    const withoutProtocol = trimmed.replace(/^https?:\/\//, '');
    const withoutPath = withoutProtocol.split('/')[0] ?? '';
    const withoutPort = withoutPath.split(':')[0] ?? '';

    return withoutPort.replace(/\.+$/, '');
}

function isLocalDomain(host: string): boolean {
    return (
        host === '' ||
        host === 'localhost' ||
        host.endsWith('.test') ||
        host.endsWith('.localhost')
    );
}

export default function DomainStatusPills({
    host,
    showDetail = false,
    className,
}: DomainStatusPillsProps) {
    const cleanHost = normalizeHost(host);
    const enabled = !isLocalDomain(cleanHost);

    const [status, setStatus] = useState<DomainStatusPayload | null>(() =>
        enabled ? (statusCache.get(cleanHost) ?? null) : null,
    );
    const [checking, setChecking] = useState(false);

    useEffect(() => {
        if (!enabled) {
            setStatus(null);
            return;
        }
        setStatus(statusCache.get(cleanHost) ?? null);
    }, [cleanHost, enabled]);

    const probe = useCallback(
        async (signal?: AbortSignal) => {
            if (!enabled) {
                return;
            }

            setChecking(true);
            try {
                const res = await fetch(
                    `/domains/status?host=${encodeURIComponent(cleanHost)}`,
                    {
                        headers: { Accept: 'application/json' },
                        signal,
                    },
                );
                if (!res.ok) {
                    return;
                }
                const data = (await res.json()) as DomainStatusPayload;
                statusCache.set(cleanHost, data);
                setStatus(data);
            } catch {
                // Keep last state on transient abort/network error.
            } finally {
                if (!signal?.aborted) {
                    setChecking(false);
                }
            }
        },
        [cleanHost, enabled],
    );

    const allReady = Boolean(status?.dns.ready && status?.https.ready);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        const controller = new AbortController();
        void probe(controller.signal);

        if (allReady) {
            return () => controller.abort();
        }

        const id = setInterval(() => {
            void probe(controller.signal);
        }, POLL_INTERVAL_MS);

        return () => {
            controller.abort();
            clearInterval(id);
        };
    }, [enabled, allReady, probe]);

    if (!enabled) {
        return null;
    }

    const dnsReady = status?.dns.ready ?? false;
    const httpsReady = status?.https.ready ?? false;

    const dnsDetail =
        status?.dns.detail ?? 'Checking ExternalDNS propagation...';
    const httpsDetail =
        status?.https.detail ?? "Checking Traefik Let's Encrypt certificate...";

    const pillBase =
        'inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none tracking-tight';
    const okClass =
        'bg-ok-tint text-ok ring-1 ring-ok/30 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-500/30';
    const warnClass =
        'bg-warn-tint text-warn ring-1 ring-warn/30 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30';

    let summaryText = 'Checking DNS & TLS...';
    if (status) {
        if (!dnsReady) {
            summaryText = dnsDetail;
        } else if (!httpsReady) {
            summaryText = httpsDetail;
        } else {
            summaryText = status.dns.records[0]
                ? `${status.dns.records[0]} · TLS active`
                : 'TLS active';
        }
    }

    return (
        <button
            type="button"
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void probe();
            }}
            title={`${dnsDetail} • ${httpsDetail} (Click to re-check)`}
            className={cn(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-md text-left transition hover:opacity-85',
                showDetail ? 'max-w-full min-w-0' : 'shrink-0',
                className,
            )}
            aria-label={`Domain status for ${cleanHost}: DNS ${dnsReady ? 'ready' : 'pending'}, HTTPS ${httpsReady ? 'ready' : 'pending'}. Click to re-check.`}
        >
            <span className="inline-flex shrink-0 items-center gap-1">
                <span className={cn(pillBase, dnsReady ? okClass : warnClass)}>
                    {checking && !dnsReady ? (
                        <RotateCw className="size-2.5 animate-spin" />
                    ) : dnsReady ? (
                        <Check className="size-2.5" />
                    ) : (
                        <span className="size-1.5 animate-pulse rounded-full bg-warn" />
                    )}
                    DNS
                </span>
                <span
                    className={cn(pillBase, httpsReady ? okClass : warnClass)}
                >
                    {checking && dnsReady && !httpsReady ? (
                        <RotateCw className="size-2.5 animate-spin" />
                    ) : httpsReady ? (
                        <Lock className="size-2.5" />
                    ) : (
                        <span className="size-1.5 animate-pulse rounded-full bg-warn" />
                    )}
                    HTTPS
                </span>
            </span>
            {showDetail && (
                <span className="min-w-0 flex-1 truncate font-sans text-[11px] text-soft">
                    {summaryText}
                </span>
            )}
        </button>
    );
}
