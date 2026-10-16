import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { Check, ChevronDown, Globe, Plus, Sparkles, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ServerDomain } from '@/types/larakube';
import CopyButton from '@/components/copy-button';

export type HostPickerMeta = {
    subdomain: string;
    baseDomain: string;
    useCustomDomain: boolean;
    hasExternalDns: boolean;
    matchedZone?: ServerDomain;
};

export type HostPickerProps = {
    /** The form field name for a hidden input (e.g. "host") to participate in Inertia Form submit */
    name?: string;
    /** Current full host value (controlled) */
    value?: string;
    /** Default or initial host value when uncontrolled */
    defaultValue?: string | null;
    /** Callback fired whenever the resolved host string changes */
    onChange?: (resolvedHost: string, meta: HostPickerMeta) => void;
    /** Connected cluster domains */
    domains?: ServerDomain[] | null;
    /** Target server name (fetches domains if domains prop is not provided or empty) */
    serverName?: string | null;
    /** Server public IP for manual DNS guidance */
    serverIp?: string | null;
    /** Default subdomain fallback (e.g. project name) */
    defaultSubdomain?: string;
    /** Whether target server is local dev (.dev.test) */
    isLocal?: boolean;
    /** Disabled state */
    disabled?: boolean;
    /** Header label text, defaults to "Domain / Host Address" */
    label?: string;
    /** Hide the header label row */
    hideLabel?: boolean;
    /** Show ExternalDNS Auto-Sync banner and DNS guidance cards (default: true) */
    showBanners?: boolean;
    /** Custom extra content or actions inside the picker */
    children?: ReactNode;
    className?: string;
};

function parseInitialHost(
    host: string | null | undefined,
    domains: ServerDomain[],
    defaultSubdomain: string,
    isLocal: boolean,
): {
    useCustomDomain: boolean;
    subdomain: string;
    baseDomain: string;
    customDomain: string;
} {
    const raw = (host ?? '').trim().toLowerCase();

    // 1. If an existing host string is supplied:
    if (raw) {
        // Check if raw matches or ends with any known domain in domains
        const matched = domains.find(
            (d) => raw === d.domain || raw.endsWith(`.${d.domain}`),
        );

        if (matched) {
            const isApex = raw === matched.domain;
            const sub = isApex
                ? ''
                : raw.slice(0, -(matched.domain.length + 1));

            return {
                useCustomDomain: false,
                subdomain: sub,
                baseDomain: matched.domain,
                customDomain: raw,
            };
        }

        // Host does not fall under any known domain -> Custom domain mode
        const bestBase =
            domains.find((d) => d.externalDns)?.domain ??
            domains[0]?.domain ??
            (isLocal ? 'dev.test' : '');
        const dotIndex = raw.indexOf('.');
        const sub = dotIndex > 0 ? raw.slice(0, dotIndex) : defaultSubdomain;

        return {
            useCustomDomain: true,
            subdomain: sub || defaultSubdomain,
            baseDomain: bestBase,
            customDomain: raw,
        };
    }

    // 2. Empty host -> defaults
    if (domains.length > 0) {
        const best =
            domains.find((d) => d.externalDns)?.domain ?? domains[0].domain;

        return {
            useCustomDomain: false,
            subdomain: defaultSubdomain,
            baseDomain: best,
            customDomain: defaultSubdomain
                ? `${defaultSubdomain}.${best}`
                : best,
        };
    }

    if (isLocal) {
        return {
            useCustomDomain: false,
            subdomain: defaultSubdomain,
            baseDomain: 'dev.test',
            customDomain: defaultSubdomain
                ? `${defaultSubdomain}.dev.test`
                : 'dev.test',
        };
    }

    return {
        useCustomDomain: true,
        subdomain: defaultSubdomain,
        baseDomain: '',
        customDomain: '',
    };
}

export default function HostPicker({
    name,
    value,
    defaultValue,
    onChange,
    domains,
    serverName,
    serverIp,
    defaultSubdomain = 'app',
    isLocal,
    disabled = false,
    label = 'Domain / Host Address',
    hideLabel = false,
    showBanners = true,
    children,
    className,
}: HostPickerProps) {
    const isLocalServer = Boolean(
        isLocal ||
        (serverIp && ['127.0.0.1', 'localhost', 'local'].includes(serverIp)) ||
        (!serverIp && !serverName),
    );

    const [fetchedDomains, setFetchedDomains] = useState<ServerDomain[] | null>(
        null,
    );
    const [loadingDomains, setLoadingDomains] = useState(false);
    const lastFetchedServerRef = useRef<string | null>(null);

    // Fetch domains dynamically if not passed via props but serverName is available
    useEffect(() => {
        if ((domains && domains.length > 0) || !serverName) {
            return;
        }
        if (lastFetchedServerRef.current === serverName) {
            return;
        }
        lastFetchedServerRef.current = serverName;

        let cancelled = false;
        setLoadingDomains(true);

        fetch(`/servers/${encodeURIComponent(serverName)}/domains`)
            .then((res) => (res.ok ? res.json() : { domains: [] }))
            .then((data: { domains?: ServerDomain[] }) => {
                if (cancelled) return;
                if (Array.isArray(data.domains)) {
                    setFetchedDomains(data.domains);
                }
            })
            .catch(() => {
                if (!cancelled) setFetchedDomains([]);
            })
            .finally(() => {
                if (!cancelled) setLoadingDomains(false);
            });

        return () => {
            cancelled = true;
        };
    }, [serverName, domains]);

    const activeDomains = useMemo(() => {
        if (domains && domains.length > 0) return domains;
        if (fetchedDomains && fetchedDomains.length > 0) return fetchedDomains;
        return domains ?? [];
    }, [domains, fetchedDomains]);

    const initialParsed = useMemo(
        () =>
            parseInitialHost(
                value !== undefined ? value : defaultValue,
                activeDomains,
                defaultSubdomain,
                isLocalServer,
            ),
        // Only run on mount / first render
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    const [useCustomDomain, setUseCustomDomain] = useState<boolean>(
        initialParsed.useCustomDomain,
    );
    const [subdomain, setSubdomain] = useState<string>(initialParsed.subdomain);
    const [baseDomain, setBaseDomain] = useState<string>(
        initialParsed.baseDomain,
    );
    const [customDomain, setCustomDomain] = useState<string>(
        initialParsed.customDomain,
    );

    const [domainDropdownOpen, setDomainDropdownOpen] = useState(false);
    const domainDropdownRef = useRef<HTMLDivElement>(null);

    const initialResolved = initialParsed.useCustomDomain
        ? initialParsed.customDomain.trim().toLowerCase()
        : initialParsed.baseDomain
          ? initialParsed.subdomain
              ? `${initialParsed.subdomain.trim().toLowerCase()}.${initialParsed.baseDomain.trim().toLowerCase()}`
              : initialParsed.baseDomain.trim().toLowerCase()
          : initialParsed.subdomain.trim().toLowerCase();

    const lastEmittedHostRef = useRef<string | null>(
        value ?? defaultValue ?? initialResolved,
    );
    const onChangeRef = useRef(onChange);
    useEffect(() => {
        onChangeRef.current = onChange;
    });

    // Sync whenever incoming controlled value changes from outside
    useEffect(() => {
        if (value === undefined) return;
        // If the incoming value matches what we already emitted from internal state, skip!
        // This is critical to prevent typing loops from resetting user input.
        if (value === lastEmittedHostRef.current) return;
        lastEmittedHostRef.current = value;
        const parsed = parseInitialHost(
            value,
            activeDomains,
            defaultSubdomain,
            isLocalServer,
        );
        setUseCustomDomain(parsed.useCustomDomain);
        setSubdomain(parsed.subdomain);
        setBaseDomain(parsed.baseDomain);
        setCustomDomain(parsed.customDomain);
    }, [value, activeDomains, defaultSubdomain, isLocalServer]);

    // When activeDomains loads/updates and baseDomain is empty, auto-pick best domain
    useEffect(() => {
        if (activeDomains.length > 0 && !baseDomain && !useCustomDomain) {
            const best =
                activeDomains.find((d) => d.externalDns)?.domain ??
                activeDomains[0].domain;
            setBaseDomain(best);
        }
    }, [activeDomains, baseDomain, useCustomDomain]);

    // Close dropdown on outside click or Escape
    useEffect(() => {
        if (!domainDropdownOpen) return;

        function handleClickOutside(event: MouseEvent) {
            if (
                domainDropdownRef.current &&
                !domainDropdownRef.current.contains(event.target as Node)
            ) {
                setDomainDropdownOpen(false);
            }
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setDomainDropdownOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [domainDropdownOpen]);

    const selectedDomainMeta = useMemo(
        () => activeDomains.find((d) => d.domain === baseDomain),
        [activeDomains, baseDomain],
    );

    const matchedExternalDnsDomain = useMemo(() => {
        if (useCustomDomain) {
            const trimmed = customDomain.trim().toLowerCase();
            return trimmed === ''
                ? undefined
                : activeDomains.find(
                      (d) =>
                          d.externalDns &&
                          (trimmed === d.domain ||
                              trimmed.endsWith(`.${d.domain}`)),
                  );
        }
        return selectedDomainMeta?.externalDns ? selectedDomainMeta : undefined;
    }, [useCustomDomain, customDomain, activeDomains, selectedDomainMeta]);

    const hasExternalDns = Boolean(matchedExternalDnsDomain);

    const resolvedDomain = useMemo(() => {
        if (useCustomDomain) {
            return customDomain.trim().toLowerCase();
        }
        const sub = subdomain.trim().toLowerCase();
        const base = baseDomain.trim().toLowerCase();
        if (!base) return sub;
        if (!sub) return base;
        return `${sub}.${base}`;
    }, [useCustomDomain, customDomain, subdomain, baseDomain]);

    // Notify parent of resolved change ONLY when the resolved domain actually changes
    useEffect(() => {
        if (resolvedDomain === lastEmittedHostRef.current) {
            return;
        }
        lastEmittedHostRef.current = resolvedDomain;
        onChangeRef.current?.(resolvedDomain, {
            subdomain,
            baseDomain,
            useCustomDomain,
            hasExternalDns,
            matchedZone: matchedExternalDnsDomain,
        });
    }, [
        resolvedDomain,
        subdomain,
        baseDomain,
        useCustomDomain,
        hasExternalDns,
        matchedExternalDnsDomain,
    ]);

    const handleToggleCustomDomain = () => {
        if (useCustomDomain) {
            setUseCustomDomain(false);
            // Attempt to decompose customDomain into subdomain and baseDomain if it matches
            const trimmed = customDomain.trim().toLowerCase();
            const matched = activeDomains.find(
                (d) => trimmed === d.domain || trimmed.endsWith(`.${d.domain}`),
            );
            if (matched) {
                setBaseDomain(matched.domain);
                const sub =
                    trimmed === matched.domain
                        ? ''
                        : trimmed.slice(0, -(matched.domain.length + 1));
                setSubdomain(sub);
            }
        } else {
            setUseCustomDomain(true);
            setCustomDomain(resolvedDomain);
        }
    };

    return (
        <div className={cn('space-y-2', className)}>
            {name && <input type="hidden" name={name} value={resolvedDomain} />}

            {/* Header / Actions Row */}
            {!hideLabel && (
                <div className="flex flex-wrap items-center justify-between gap-1">
                    <label className="text-xs font-medium text-soft">
                        {label}
                    </label>
                    <div className="flex items-center gap-2">
                        {loadingDomains ? (
                            <span className="text-[11px] text-faint">
                                Detecting DNS zones…
                            </span>
                        ) : hasExternalDns ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ok dark:text-emerald-400">
                                <Sparkles className="size-3" />
                                <span>ExternalDNS Auto-Sync</span>
                            </span>
                        ) : isLocalServer ? (
                            <button
                                type="button"
                                disabled={disabled}
                                onClick={() => {
                                    setBaseDomain('dev.test');
                                    setUseCustomDomain(false);
                                }}
                                className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-brand hover:underline disabled:opacity-45"
                            >
                                <Zap className="size-3" />
                                <span>Use local .dev.test</span>
                            </button>
                        ) : null}

                        <button
                            type="button"
                            disabled={disabled}
                            onClick={handleToggleCustomDomain}
                            className="cursor-pointer text-[11px] font-medium text-brand hover:underline disabled:opacity-45"
                        >
                            {useCustomDomain
                                ? activeDomains.length > 0
                                    ? 'Pick connected base domain'
                                    : 'Use subdomain + domain'
                                : '+ Custom full domain'}
                        </button>
                    </div>
                </div>
            )}

            {/* Inputs Row */}
            {useCustomDomain ? (
                <div className="relative">
                    <input
                        type="text"
                        value={customDomain}
                        disabled={disabled}
                        onChange={(e) =>
                            setCustomDomain(
                                e.target.value
                                    .trim()
                                    .toLowerCase()
                                    .replace(/^https?:\/\//, '')
                                    .replace(/\/.*$/, ''),
                            )
                        }
                        placeholder="app.example.com"
                        className="w-full rounded-xl border-0 bg-surface py-2.5 pr-3 pl-9 font-mono text-sm text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-brand disabled:opacity-45"
                        required
                    />
                    <Globe className="pointer-events-none absolute top-3 left-3 size-4 text-soft" />
                </div>
            ) : (
                <div className="flex items-center gap-2">
                    <div className="relative min-w-0 flex-1">
                        <input
                            type="text"
                            value={subdomain}
                            disabled={disabled}
                            onChange={(e) =>
                                setSubdomain(
                                    e.target.value
                                        .trim()
                                        .toLowerCase()
                                        .replace(/[^a-z0-9-]/g, ''),
                                )
                            }
                            placeholder={defaultSubdomain}
                            className="w-full rounded-xl border-0 bg-surface py-2.5 pr-2 pl-9 font-mono text-sm text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-brand disabled:opacity-45"
                            required
                        />
                        <Globe className="pointer-events-none absolute top-3 left-3 size-4 text-soft" />
                    </div>

                    <span className="shrink-0 text-sm font-semibold text-soft">
                        .
                    </span>

                    {activeDomains.length > 0 ? (
                        <div
                            ref={domainDropdownRef}
                            className="relative shrink-0"
                        >
                            <button
                                type="button"
                                disabled={disabled}
                                onClick={() =>
                                    setDomainDropdownOpen((prev) => !prev)
                                }
                                className={cn(
                                    'flex h-[42px] cursor-pointer items-center justify-between gap-2 rounded-xl bg-surface px-3.5 font-mono text-xs text-ink ring-1 transition outline-none disabled:cursor-not-allowed disabled:opacity-45',
                                    domainDropdownOpen
                                        ? 'bg-brand/5 shadow-xs ring-2 ring-brand'
                                        : 'ring-line hover:bg-badge/30 hover:ring-brand/50',
                                )}
                            >
                                <div className="flex min-w-0 items-center gap-1.5">
                                    <span className="max-w-[130px] truncate font-semibold sm:max-w-[180px]">
                                        {baseDomain || 'Select domain'}
                                    </span>
                                    {selectedDomainMeta?.externalDns ? (
                                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:text-emerald-300">
                                            <Sparkles className="size-2.5" />
                                            {selectedDomainMeta.dnsProvider ===
                                            'route53'
                                                ? 'Route 53'
                                                : 'Cloudflare'}
                                        </span>
                                    ) : selectedDomainMeta?.tls ? (
                                        <span className="shrink-0 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-medium text-blue-700 dark:text-blue-300">
                                            TLS
                                        </span>
                                    ) : null}
                                </div>
                                <ChevronDown
                                    className={cn(
                                        'size-3.5 shrink-0 text-soft transition-transform duration-200',
                                        domainDropdownOpen &&
                                            'rotate-180 text-brand',
                                    )}
                                />
                            </button>

                            {domainDropdownOpen && (
                                <div className="animate-in fade-in zoom-in-95 absolute top-full right-0 z-50 mt-1.5 w-72 overflow-hidden rounded-2xl bg-surface p-1.5 shadow-2xl ring-1 ring-line duration-100 sm:w-80">
                                    <div className="px-2.5 py-1.5 text-[10px] font-semibold tracking-wider text-faint uppercase">
                                        Cluster Domains & Zones
                                    </div>
                                    <div className="flex flex-col gap-0.5">
                                        {activeDomains.map((d) => {
                                            const isSelected =
                                                d.domain === baseDomain;
                                            return (
                                                <button
                                                    key={d.domain}
                                                    type="button"
                                                    onClick={() => {
                                                        setBaseDomain(d.domain);
                                                        setUseCustomDomain(
                                                            false,
                                                        );
                                                        setDomainDropdownOpen(
                                                            false,
                                                        );
                                                    }}
                                                    className={cn(
                                                        'flex cursor-pointer items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition',
                                                        isSelected
                                                            ? 'bg-brand/10 font-semibold text-brand'
                                                            : 'text-ink hover:bg-badge/60',
                                                    )}
                                                >
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <span className="truncate font-mono text-xs">
                                                            {d.domain}
                                                        </span>
                                                        {d.externalDns ? (
                                                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                                                                <Sparkles className="size-2.5" />
                                                                ExternalDNS
                                                            </span>
                                                        ) : d.tls ? (
                                                            <span className="shrink-0 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                                                                TLS
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                    {isSelected && (
                                                        <Check className="size-3.5 shrink-0 text-brand" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className="my-1 border-t border-line/60" />

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setUseCustomDomain(true);
                                            setCustomDomain(resolvedDomain);
                                            setDomainDropdownOpen(false);
                                        }}
                                        className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs text-soft transition hover:bg-badge hover:text-ink"
                                    >
                                        <Plus className="size-3.5 text-soft" />
                                        <span>Enter custom full domain…</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <input
                            type="text"
                            value={baseDomain}
                            disabled={disabled}
                            onChange={(e) => setBaseDomain(e.target.value)}
                            placeholder={
                                isLocalServer ? 'dev.test' : 'example.com'
                            }
                            className="w-48 rounded-xl border-0 bg-surface px-3 py-2.5 font-mono text-sm text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-brand disabled:opacity-45"
                            required
                        />
                    )}
                </div>
            )}

            {/* Live Address & Indicator */}
            <div className="mt-1 flex items-center justify-between text-[11px] text-faint">
                <span className="truncate">
                    Live address:{' '}
                    <span className="font-mono font-semibold text-ink">
                        https://{resolvedDomain || '…'}
                    </span>
                </span>
                {hasExternalDns && (
                    <span className="inline-flex shrink-0 items-center gap-1 font-medium text-ok dark:text-emerald-400">
                        <Check className="size-3" /> ExternalDNS Auto-Sync
                    </span>
                )}
            </div>

            {/* Banners */}
            {showBanners && (
                <>
                    {hasExternalDns ? (
                        <div className="mt-2.5 rounded-xl border border-ok/30 bg-ok-tint/70 p-3.5 text-xs ring-1 ring-ok/20 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/30">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 font-semibold text-emerald-950 dark:text-emerald-200">
                                    <Sparkles className="size-3.5 text-ok dark:text-emerald-400" />
                                    <span>
                                        ExternalDNS Auto-Sync (
                                        {matchedExternalDnsDomain?.dnsProvider ===
                                        'route53'
                                            ? 'Route 53'
                                            : 'Cloudflare'}
                                        ) Active
                                    </span>
                                </div>
                                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
                                    Zero Config
                                </span>
                            </div>
                            <p className="mt-1.5 text-[11px] leading-relaxed text-emerald-800/90 dark:text-emerald-300/80">
                                This cluster manages{' '}
                                <strong className="font-mono text-emerald-950 dark:text-emerald-100">
                                    {matchedExternalDnsDomain?.domain ??
                                        baseDomain}
                                </strong>{' '}
                                via ExternalDNS. An A-record for{' '}
                                <strong className="font-mono text-emerald-950 dark:text-emerald-100">
                                    {resolvedDomain}
                                </strong>{' '}
                                will be synchronized automatically once
                                deployed. Traefik automatically handles
                                Let&rsquo;s Encrypt SSL certificates.
                            </p>
                        </div>
                    ) : serverIp &&
                      !['127.0.0.1', 'localhost', 'local'].includes(
                          serverIp,
                      ) ? (
                        <div className="mt-2.5 rounded-xl border border-line bg-paper/60 p-3 text-xs">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 font-medium text-ink">
                                    <Globe className="size-3.5 text-soft" />
                                    <span>
                                        DNS for GoDaddy, Namecheap &amp;
                                        External Registrars
                                    </span>
                                </div>
                                <CopyButton
                                    value={serverIp}
                                    label="Copy Server IP"
                                    className="text-[11px] font-medium text-brand hover:underline"
                                />
                            </div>
                            <p className="mt-1.5 text-[11px] leading-relaxed text-soft">
                                Create an{' '}
                                <strong className="text-ink">A-record</strong>{' '}
                                for{' '}
                                <strong className="font-mono text-ink">
                                    {resolvedDomain || 'your host'}
                                </strong>{' '}
                                pointing to{' '}
                                <strong className="font-mono text-ink">
                                    {serverIp}
                                </strong>
                                .
                            </p>
                        </div>
                    ) : null}
                </>
            )}

            {children}
        </div>
    );
}
