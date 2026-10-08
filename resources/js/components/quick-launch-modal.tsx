import { useState, useMemo, useEffect } from 'react';
import { router, Link } from '@inertiajs/react';
import {
    Zap,
    Rocket,
    X,
    Globe,
    Mail,
    Check,
    Copy,
    Plus,
    AlertCircle,
    ArrowLeft,
    ArrowRight,
    Sparkles,
} from 'lucide-react';
import Button, { buttonClass } from '@/components/button';
import ToolLogo from '@/components/tool-logo';
import ProviderLogo from '@/components/provider-logo';
import CommonsCapabilityPills from '@/components/commons-capability-pills';
import { create as createServer } from '@/routes/servers';
import { cn } from '@/lib/utils';
import type {
    Server,
    ServerDomain,
    ToolCommonsCapabilities,
} from '@/types/larakube';

export type QuickLaunchAppId = 'pocketbase' | 'n8n' | 'wordpress';

interface AppOption {
    id: QuickLaunchAppId;
    name: string;
    description: string;
    tagline: string;
    defaultSubdomain: string;
    capabilities: ToolCommonsCapabilities;
    defaultDb?: string;
    availableDbs?: Array<{ id: string; label: string; desc: string }>;
}

const APPS: AppOption[] = [
    {
        id: 'pocketbase',
        name: 'PocketBase',
        tagline: 'Instant Backend & Auth',
        description:
            'Lightweight SQLite database with realtime subscriptions, file storage, and built-in auth.',
        defaultSubdomain: 'pb',
        capabilities: {
            databases: ['sqlite'],
            cache: [],
            storage: ['s3'],
            auth: [],
            mail: [],
        },
    },
    {
        id: 'n8n',
        name: 'n8n Automation',
        tagline: 'Workflow Automation',
        description:
            'Fair-code node-based engine connecting 400+ apps, webhooks, and AI models.',
        defaultSubdomain: 'n8n',
        defaultDb: 'sqlite',
        capabilities: {
            databases: ['sqlite', 'postgresql'],
            cache: ['redis'],
            storage: ['s3'],
            auth: [],
            mail: [],
        },
        availableDbs: [
            {
                id: 'sqlite',
                label: 'SQLite (0 RAM, instant)',
                desc: 'Embedded file storage, ideal for single instance',
            },
            {
                id: 'postgres',
                label: 'Plex PostgreSQL',
                desc: 'High concurrency, uses shared Commons Postgres',
            },
        ],
    },
    {
        id: 'wordpress',
        name: 'WordPress',
        tagline: "World's #1 CMS",
        description:
            'Blazing fast ServerSideUp FrankenPHP pod with zero-RAM SQLite or shared Plex MySQL.',
        defaultSubdomain: 'blog',
        defaultDb: 'sqlite',
        capabilities: {
            databases: ['sqlite', 'mysql', 'mariadb'],
            cache: [],
            storage: ['s3'],
            auth: [],
            mail: ['smtp'],
        },
        availableDbs: [
            {
                id: 'sqlite',
                label: 'SQLite (0 RAM, Instant)',
                desc: 'Zero extra container RAM, pure performance',
            },
            {
                id: 'mysql',
                label: 'Plex MySQL / MariaDB',
                desc: 'Standard production MySQL via shared Commons',
            },
        ],
    },
];

const STEPS = [
    { id: 'app', label: '1. Application', short: 'App' },
    { id: 'server', label: '2. Cluster', short: 'Cluster' },
    { id: 'config', label: '3. Configuration', short: 'Config' },
    { id: 'review', label: '4. Review & Launch', short: 'Review' },
];

type Props = {
    isOpen: boolean;
    onClose: () => void;
    initialApp?: QuickLaunchAppId;
    servers: Server[];
    activeCommonsServices?: string[];
};

export default function QuickLaunchModal({
    isOpen,
    onClose,
    initialApp = 'pocketbase',
    servers,
    activeCommonsServices = [],
}: Props) {
    const readyServers = useMemo(
        () => servers.filter((s) => s.status === 'ready' && s.context),
        [servers],
    );

    const [currentStep, setCurrentStep] = useState<number>(1);
    const [highestReachedStep, setHighestReachedStep] = useState<number>(1);

    const [selectedAppId, setSelectedAppId] =
        useState<QuickLaunchAppId>(initialApp);
    const [selectedServerName, setSelectedServerName] = useState<string>(
        () => readyServers[0]?.name ?? '',
    );
    const [subdomain, setSubdomain] = useState<string>('');
    const [baseDomain, setBaseDomain] = useState<string>('');
    const [customDomain, setCustomDomain] = useState<string>('');
    const [useCustomDomain, setUseCustomDomain] = useState<boolean>(false);
    const [adminEmail, setAdminEmail] = useState<string>('');
    const [database, setDatabase] = useState<string>('');
    const [wireSso, setWireSso] = useState<boolean>(false);
    const [wireMail, setWireMail] = useState<boolean>(false);
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [dnsCopied, setDnsCopied] = useState<boolean>(false);

    const [domains, setDomains] = useState<ServerDomain[]>([]);
    const [loadingDomains, setLoadingDomains] = useState<boolean>(false);

    const currentApp = useMemo(
        () => APPS.find((a) => a.id === selectedAppId) ?? APPS[0],
        [selectedAppId],
    );

    const currentServer = useMemo(
        () =>
            readyServers.find((s) => s.name === selectedServerName) ??
            readyServers[0],
        [readyServers, selectedServerName],
    );

    const handleCopyDns = () => {
        if (!currentServer?.ip) return;
        const hostName = useCustomDomain
            ? customDomain.split('.')[0] || '*'
            : subdomain || '*';
        const textToCopy = `Type: A\nName: ${hostName}\nValue: ${currentServer.ip}\nTTL: 600`;
        void navigator.clipboard.writeText(textToCopy);
        setDnsCopied(true);
        setTimeout(() => setDnsCopied(false), 2000);
    };

    // Reset or initialize state when opening modal
    useEffect(() => {
        if (isOpen) {
            if (initialApp) {
                setSelectedAppId(initialApp);
            }
            setCurrentStep(1);
            setHighestReachedStep(1);
        }
    }, [isOpen, initialApp]);

    // Fetch domains and auto-detect ExternalDNS for selected server
    useEffect(() => {
        if (!isOpen || !selectedServerName) {
            setDomains([]);
            return;
        }

        let cancelled = false;
        setLoadingDomains(true);

        fetch(`/servers/${encodeURIComponent(selectedServerName)}/domains`)
            .then((res) => (res.ok ? res.json() : { domains: [] }))
            .then((data: { domains?: ServerDomain[] }) => {
                if (cancelled) return;
                const fetched: ServerDomain[] = data.domains ?? [];
                setDomains(fetched);

                // Auto-pick the first ExternalDNS zone if available, otherwise first connected domain
                const extDomain = fetched.find((d) => d.externalDns);
                const bestDomain = extDomain ?? fetched[0];

                if (bestDomain) {
                    setBaseDomain(bestDomain.domain);
                    setUseCustomDomain(false);
                } else if (
                    currentServer?.ip &&
                    !['127.0.0.1', 'localhost', 'local'].includes(
                        currentServer.ip,
                    )
                ) {
                    setBaseDomain(`${currentServer.ip}.nip.io`);
                } else {
                    setBaseDomain('dev.test');
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setDomains([]);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoadingDomains(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [isOpen, selectedServerName, currentServer?.ip]);

    // Sync defaults when app or server changes
    useEffect(() => {
        if (!isOpen) return;
        setSubdomain(currentApp.defaultSubdomain);
        if (currentApp.availableDbs && currentApp.availableDbs.length > 0) {
            const activeSet = new Set(
                (activeCommonsServices ?? []).map((s) => s.toLowerCase()),
            );
            if (
                currentApp.id === 'wordpress' &&
                (activeSet.has('mysql') || activeSet.has('mariadb'))
            ) {
                setDatabase('mysql');
            } else if (
                currentApp.id === 'n8n' &&
                (activeSet.has('postgres') || activeSet.has('postgresql'))
            ) {
                setDatabase('postgres');
            } else {
                setDatabase(currentApp.defaultDb ?? 'sqlite');
            }
        } else {
            setDatabase('');
        }
    }, [currentApp, isOpen, activeCommonsServices]);

    // Initial server selection and email
    useEffect(() => {
        if (!selectedServerName && readyServers.length > 0) {
            setSelectedServerName(readyServers[0].name);
        }
    }, [readyServers, selectedServerName]);

    useEffect(() => {
        if (currentServer?.account && currentServer.account.includes('@')) {
            setAdminEmail(currentServer.account);
        } else if (currentServer?.ip) {
            setAdminEmail(`admin@${currentServer.name}.local`);
        }
    }, [currentServer]);

    const selectedDomainMeta = useMemo(
        () => domains.find((d) => d.domain === baseDomain),
        [domains, baseDomain],
    );

    const hasExternalDns = useMemo(() => {
        if (useCustomDomain) {
            const trimmed = customDomain.trim().toLowerCase();
            return (
                trimmed !== '' &&
                domains.some(
                    (d) =>
                        d.externalDns &&
                        (trimmed === d.domain ||
                            trimmed.endsWith(`.${d.domain}`)),
                )
            );
        }
        return Boolean(selectedDomainMeta?.externalDns);
    }, [useCustomDomain, customDomain, domains, selectedDomainMeta]);

    const resolvedDomain = useMemo(() => {
        if (useCustomDomain) {
            return customDomain.trim().toLowerCase() || 'app.example.com';
        }
        const sub =
            subdomain.trim().toLowerCase() || currentApp.defaultSubdomain;
        const fallbackBase =
            currentServer?.ip &&
            !['127.0.0.1', 'localhost', 'local'].includes(currentServer.ip)
                ? `${currentServer.ip}.nip.io`
                : 'example.com';
        const base = baseDomain.trim().toLowerCase() || fallbackBase;
        return `${sub}.${base}`;
    }, [
        useCustomDomain,
        customDomain,
        subdomain,
        currentApp.defaultSubdomain,
        baseDomain,
        currentServer?.ip,
    ]);

    if (!isOpen) {
        return null;
    }

    const handleNext = () => {
        if (currentStep === 2 && readyServers.length === 0) return;
        if (currentStep === 3 && useCustomDomain && !customDomain.trim())
            return;
        if (currentStep === 3 && !resolvedDomain) return;

        const next = currentStep + 1;
        setHighestReachedStep((h) => Math.max(h, next));
        setCurrentStep(next);
    };

    const handlePrev = () => {
        if (currentStep > 1) {
            setCurrentStep((prev) => prev - 1);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (currentStep < 4) {
            handleNext();
            return;
        }

        if (!selectedServerName || !resolvedDomain) return;
        if (useCustomDomain && !customDomain.trim()) return;

        setSubmitting(true);
        router.post(
            '/quick-actions/launch',
            {
                tool: selectedAppId,
                server: selectedServerName,
                domain: resolvedDomain,
                admin_email: adminEmail,
                database: database || undefined,
                wire_sso: wireSso,
                wire_mail: wireMail,
            },
            {
                onFinish: () => {
                    setSubmitting(false);
                    onClose();
                },
            },
        );
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-xs"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-xl overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-line"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Stepper Header */}
                <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6">
                    <div className="flex items-center gap-2.5">
                        <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-xl">
                            <Zap className="size-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-ink">
                                1-Click Quick Launch
                            </h2>
                            <p className="text-xs text-soft">
                                Step {currentStep} of {STEPS.length}:{' '}
                                {STEPS[currentStep - 1].label.replace(
                                    /^\d+\.\s*/,
                                    '',
                                )}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close dialog"
                        className="rounded-lg p-1.5 text-soft transition hover:bg-badge hover:text-ink"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                {/* Stepper Navigation Progress Bar */}
                <div className="border-b border-line/70 bg-paper/50 px-4 py-2 sm:px-6">
                    <nav
                        aria-label="Progress"
                        className="flex items-center justify-between"
                    >
                        {STEPS.map((step, idx) => {
                            const stepNum = idx + 1;
                            const isCompleted = stepNum < currentStep;
                            const isCurrent = stepNum === currentStep;
                            const isClickable = stepNum <= highestReachedStep;

                            return (
                                <button
                                    key={step.id}
                                    type="button"
                                    disabled={!isClickable}
                                    onClick={() =>
                                        isClickable && setCurrentStep(stepNum)
                                    }
                                    className={cn(
                                        'flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition',
                                        isCurrent
                                            ? 'text-primary'
                                            : isCompleted
                                              ? 'hover:text-primary cursor-pointer text-ink'
                                              : 'cursor-not-allowed text-faint',
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'flex size-5 items-center justify-center rounded-full text-[10px] font-bold transition',
                                            isCurrent
                                                ? 'bg-primary text-white shadow-2xs'
                                                : isCompleted
                                                  ? 'bg-ok text-white'
                                                  : 'bg-badge text-faint',
                                        )}
                                    >
                                        {isCompleted ? '✓' : stepNum}
                                    </span>
                                    <span className="hidden sm:inline">
                                        {step.short}
                                    </span>
                                </button>
                            );
                        })}
                    </nav>
                </div>

                <form onSubmit={handleSubmit} className="p-5 sm:p-6">
                    {/* STEP 1: APPLICATION SELECTION */}
                    {currentStep === 1 && (
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-sm font-semibold text-ink">
                                    Choose Application
                                </h3>
                                <p className="text-xs text-soft">
                                    Select a production-grade companion workload
                                    to deploy to your fleet.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                {APPS.map((app) => {
                                    const isSelected = selectedAppId === app.id;
                                    return (
                                        <button
                                            key={app.id}
                                            type="button"
                                            onClick={() =>
                                                setSelectedAppId(app.id)
                                            }
                                            className={cn(
                                                'flex flex-col justify-between rounded-xl p-3.5 text-left ring-1 transition',
                                                isSelected
                                                    ? 'bg-primary/5 ring-primary shadow-xs ring-2'
                                                    : 'bg-paper/60 ring-line/70 hover:bg-surface hover:ring-line',
                                            )}
                                        >
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <ToolLogo
                                                        tool={{
                                                            tool: app.id,
                                                            icon: '*',
                                                            label: app.name,
                                                            brand: app.name,
                                                            installed: false,
                                                            instance: '',
                                                            namespace: '',
                                                            host: null,
                                                            url: null,
                                                            installedAt: null,
                                                            sso: '—',
                                                            mail: 'N/A',
                                                            vpn: 'N/A',
                                                            sync: 'N/A',
                                                            rotation: 'N/A',
                                                        }}
                                                        size="md"
                                                    />
                                                    {isSelected && (
                                                        <span className="bg-primary flex size-4.5 items-center justify-center rounded-full text-[10px] font-bold text-white">
                                                            ✓
                                                        </span>
                                                    )}
                                                </div>
                                                <div>
                                                    <h4 className="text-xs font-bold text-ink">
                                                        {app.name}
                                                    </h4>
                                                    <p className="text-[10px] text-faint">
                                                        {app.tagline}
                                                    </p>
                                                </div>
                                                <p className="line-clamp-2 min-h-[30px] text-[11px] leading-relaxed text-soft">
                                                    {app.description}
                                                </p>
                                                <CommonsCapabilityPills
                                                    capabilities={
                                                        app.capabilities
                                                    }
                                                    activeCommonsServices={
                                                        activeCommonsServices
                                                    }
                                                    compact
                                                />
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* App Feature Highlight */}
                            <div className="rounded-xl border border-line/60 bg-paper/50 p-3 text-xs">
                                <div className="flex items-center gap-1.5 font-medium text-ink">
                                    <Sparkles className="size-3.5 text-brand" />
                                    <span>{currentApp.name} Overview</span>
                                </div>
                                <p className="mt-1 leading-relaxed text-soft">
                                    {currentApp.description} Default database is{' '}
                                    <strong className="text-ink">
                                        {currentApp.defaultDb ?? 'SQLite'}
                                    </strong>
                                    . Configurable in step 3.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: TARGET SERVER SELECTION */}
                    {currentStep === 2 && (
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-sm font-semibold text-ink">
                                    Choose Target Cluster
                                </h3>
                                <p className="text-xs text-soft">
                                    Select the running Kubernetes server that
                                    will host {currentApp.name}.
                                </p>
                            </div>

                            {readyServers.length > 0 ? (
                                <div className="space-y-2.5">
                                    <div className="grid grid-cols-1 gap-2.5">
                                        {readyServers.map((s) => {
                                            const isSelected =
                                                selectedServerName === s.name;
                                            return (
                                                <button
                                                    key={s.name}
                                                    type="button"
                                                    onClick={() =>
                                                        setSelectedServerName(
                                                            s.name,
                                                        )
                                                    }
                                                    className={cn(
                                                        'flex items-center justify-between rounded-xl p-3.5 text-left ring-1 transition',
                                                        isSelected
                                                            ? 'bg-primary/5 ring-primary shadow-xs ring-2'
                                                            : 'bg-paper/60 ring-line/70 hover:bg-surface hover:ring-line',
                                                    )}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <ProviderLogo
                                                            provider={
                                                                s.provider
                                                            }
                                                            size="sm"
                                                        />
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-semibold text-ink">
                                                                    {s.name}
                                                                </span>
                                                                <span className="rounded-full bg-badge px-1.5 py-0.5 font-mono text-[10px] text-soft uppercase">
                                                                    {s.provider}
                                                                </span>
                                                                {s.region && (
                                                                    <span className="text-[10px] text-faint">
                                                                        ·{' '}
                                                                        {
                                                                            s.region
                                                                        }
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="mt-0.5 font-mono text-[11px] text-soft">
                                                                IP:{' '}
                                                                {s.ip ??
                                                                    'local'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {isSelected &&
                                                            domains.some(
                                                                (d) =>
                                                                    d.externalDns,
                                                            ) && (
                                                                <span className="inline-flex items-center gap-1 rounded-full bg-ok-tint px-2 py-0.5 text-[10px] font-medium text-ok dark:bg-emerald-500/20 dark:text-emerald-300">
                                                                    <Sparkles className="size-2.5" />
                                                                    ExternalDNS
                                                                    Active
                                                                </span>
                                                            )}
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-ok-tint px-2 py-0.5 text-[10px] font-medium text-ok">
                                                            <Check className="size-3" />{' '}
                                                            Ready
                                                        </span>
                                                        {isSelected && (
                                                            <span className="bg-primary flex size-4.5 items-center justify-center rounded-full text-[10px] font-bold text-white">
                                                                ✓
                                                            </span>
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Action to create a new server */}
                                    <div className="mt-3 flex items-center justify-between rounded-xl border border-line/80 bg-paper/40 p-3 text-xs">
                                        <span className="text-soft">
                                            Need a fresh server or different
                                            cloud provider?
                                        </span>
                                        <Link
                                            href={createServer().url}
                                            className={buttonClass(
                                                'secondary',
                                                'sm',
                                                'gap-1.5',
                                            )}
                                        >
                                            <Plus className="size-3.5" />
                                            <span>Create New Server</span>
                                        </Link>
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-warn/30 bg-warn/10 p-5 text-xs text-ink ring-1 ring-warn/20">
                                    <div className="flex items-start gap-3">
                                        <AlertCircle className="mt-0.5 size-5 shrink-0 text-warn" />
                                        <div className="flex-1 space-y-2">
                                            <p className="text-sm font-semibold text-warn">
                                                No ready Kubernetes servers
                                                available
                                            </p>
                                            <p className="text-xs leading-relaxed text-soft">
                                                To deploy companion
                                                applications, you need an active
                                                cluster. LaraKube provisions
                                                hardened single-node Kubernetes
                                                (k3s) clusters on DigitalOcean,
                                                Hetzner, AWS, GCP, or locally in
                                                minutes.
                                            </p>
                                            <div className="pt-2">
                                                <Link
                                                    href={createServer().url}
                                                    className={buttonClass(
                                                        'primary',
                                                        'sm',
                                                        'gap-1.5',
                                                    )}
                                                >
                                                    <Plus className="size-3.5" />
                                                    <span>
                                                        Create a Server
                                                        (Hetzner, DO, AWS)
                                                    </span>
                                                </Link>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP 3: CONFIGURATION & DOMAIN */}
                    {currentStep === 3 && (
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-sm font-semibold text-ink">
                                    Configure {currentApp.name}
                                </h3>
                                <p className="text-xs text-soft">
                                    Set your routing address, database engine,
                                    and administrator credentials.
                                </p>
                            </div>

                            {/* Domain Section */}
                            <div>
                                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1">
                                    <label className="text-xs font-medium text-soft">
                                        Domain / Host Address
                                    </label>
                                    <div className="flex items-center gap-2">
                                        {loadingDomains ? (
                                            <span className="text-[11px] text-faint">
                                                Detecting DNS zones…
                                            </span>
                                        ) : hasExternalDns ? (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ok dark:text-emerald-400">
                                                <Sparkles className="size-3" />
                                                <span>
                                                    ExternalDNS Auto-Sync
                                                </span>
                                            </span>
                                        ) : currentServer?.ip &&
                                          ![
                                              '127.0.0.1',
                                              'localhost',
                                              'local',
                                          ].includes(currentServer.ip) ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setBaseDomain(
                                                        `${currentServer.ip}.nip.io`,
                                                    );
                                                    setUseCustomDomain(false);
                                                }}
                                                className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
                                            >
                                                <Zap className="size-3" />
                                                <span>
                                                    No domain? Use{' '}
                                                    {currentServer.ip}.nip.io
                                                </span>
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setBaseDomain('dev.test');
                                                    setUseCustomDomain(false);
                                                }}
                                                className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
                                            >
                                                <Zap className="size-3" />
                                                <span>Use local .dev.test</span>
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (useCustomDomain) {
                                                    setUseCustomDomain(false);
                                                } else {
                                                    setUseCustomDomain(true);
                                                    setCustomDomain(
                                                        resolvedDomain,
                                                    );
                                                }
                                            }}
                                            className="text-primary text-[11px] hover:underline"
                                        >
                                            {useCustomDomain
                                                ? 'Pick connected base domain'
                                                : '+ Custom full domain'}
                                        </button>
                                    </div>
                                </div>
                                {useCustomDomain ? (
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={customDomain}
                                            onChange={(e) =>
                                                setCustomDomain(e.target.value)
                                            }
                                            placeholder="app.example.com"
                                            className="focus:ring-primary w-full rounded-xl border-0 bg-surface py-2.5 pr-3 pl-9 font-mono text-sm text-ink ring-1 ring-line outline-none focus:ring-2"
                                            required
                                        />
                                        <Globe className="pointer-events-none absolute top-3 left-3 size-4 text-soft" />
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex-1">
                                            <input
                                                type="text"
                                                value={subdomain}
                                                onChange={(e) =>
                                                    setSubdomain(
                                                        e.target.value
                                                            .trim()
                                                            .toLowerCase()
                                                            .replace(
                                                                /[^a-z0-9-]/g,
                                                                '',
                                                            ),
                                                    )
                                                }
                                                placeholder={
                                                    currentApp.defaultSubdomain
                                                }
                                                className="focus:ring-primary w-full rounded-xl border-0 bg-surface py-2.5 pr-2 pl-9 font-mono text-sm text-ink ring-1 ring-line outline-none focus:ring-2"
                                                required
                                            />
                                            <Globe className="pointer-events-none absolute top-3 left-3 size-4 text-soft" />
                                        </div>
                                        <span className="text-sm font-semibold text-soft">
                                            .
                                        </span>
                                        {domains.length > 1 ? (
                                            <select
                                                value={baseDomain}
                                                onChange={(e) => {
                                                    if (
                                                        e.target.value ===
                                                        '__custom__'
                                                    ) {
                                                        setUseCustomDomain(
                                                            true,
                                                        );
                                                        setCustomDomain(
                                                            resolvedDomain,
                                                        );
                                                    } else {
                                                        setBaseDomain(
                                                            e.target.value,
                                                        );
                                                    }
                                                }}
                                                className="focus:ring-primary max-w-[220px] truncate rounded-xl border-0 bg-surface px-3 py-2.5 font-mono text-xs text-ink ring-1 ring-line outline-none focus:ring-2"
                                            >
                                                {domains.map((d) => (
                                                    <option
                                                        key={d.domain}
                                                        value={d.domain}
                                                    >
                                                        {d.domain}{' '}
                                                        {d.externalDns
                                                            ? '(ExternalDNS · Cloudflare)'
                                                            : d.tls
                                                              ? '(Cloudflare TLS)'
                                                              : ''}
                                                    </option>
                                                ))}
                                                <option value="__custom__">
                                                    + Custom domain…
                                                </option>
                                            </select>
                                        ) : (
                                            <input
                                                type="text"
                                                value={baseDomain}
                                                onChange={(e) =>
                                                    setBaseDomain(
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder={
                                                    currentServer?.ip &&
                                                    ![
                                                        '127.0.0.1',
                                                        'localhost',
                                                        'local',
                                                    ].includes(currentServer.ip)
                                                        ? `${currentServer.ip}.nip.io`
                                                        : 'example.com'
                                                }
                                                className="focus:ring-primary w-48 rounded-xl border-0 bg-surface px-3 py-2.5 font-mono text-sm text-ink ring-1 ring-line outline-none focus:ring-2"
                                                required
                                            />
                                        )}
                                    </div>
                                )}
                                <div className="mt-1 flex items-center justify-between text-[11px] text-faint">
                                    <span>
                                        Live address:{' '}
                                        <span className="font-mono font-semibold text-ink">
                                            https://{resolvedDomain}
                                        </span>
                                    </span>
                                    {hasExternalDns && (
                                        <span className="inline-flex items-center gap-1 font-medium text-ok dark:text-emerald-400">
                                            <Check className="size-3" />{' '}
                                            ExternalDNS Auto-Sync
                                        </span>
                                    )}
                                </div>

                                {/* ExternalDNS Auto-Sync Banner OR GoDaddy Manual DNS Guidance */}
                                {hasExternalDns ? (
                                    <div className="mt-2.5 rounded-xl border border-ok/30 bg-ok-tint/70 p-3.5 text-xs ring-1 ring-ok/20 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/30">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5 font-semibold text-emerald-950 dark:text-emerald-200">
                                                <Sparkles className="size-3.5 text-ok dark:text-emerald-400" />
                                                <span>
                                                    ExternalDNS Auto-Sync
                                                    (Cloudflare) Active
                                                </span>
                                            </div>
                                            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
                                                Zero Config
                                            </span>
                                        </div>
                                        <p className="mt-1.5 text-[11px] leading-relaxed text-emerald-800/90 dark:text-emerald-300/80">
                                            This cluster manages{' '}
                                            <strong className="font-mono text-emerald-950 dark:text-emerald-100">
                                                {baseDomain}
                                            </strong>{' '}
                                            via ExternalDNS. An A-record for{' '}
                                            <strong className="font-mono text-emerald-950 dark:text-emerald-100">
                                                {resolvedDomain}
                                            </strong>{' '}
                                            will be synchronized to Cloudflare
                                            automatically once launched. Traefik
                                            automatically handles Let's Encrypt
                                            SSL certificates.
                                        </p>
                                    </div>
                                ) : currentServer?.ip &&
                                  !['127.0.0.1', 'localhost', 'local'].includes(
                                      currentServer.ip,
                                  ) ? (
                                    <div className="mt-2.5 rounded-xl border border-line bg-paper/60 p-3 text-xs">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5 font-medium text-ink">
                                                <Globe className="size-3.5 text-soft" />
                                                <span>
                                                    DNS for GoDaddy, Namecheap &
                                                    External Registrars
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleCopyDns}
                                                className="text-primary inline-flex items-center gap-1 text-[11px] font-medium hover:underline"
                                            >
                                                {dnsCopied ? (
                                                    <>
                                                        <Check className="size-3 text-ok" />
                                                        <span>Copied!</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Copy className="size-3" />
                                                        <span>
                                                            Copy DNS Record
                                                        </span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                        <p className="mt-1 text-[11px] leading-relaxed text-soft">
                                            For domains registered on GoDaddy or
                                            external DNS, add an{' '}
                                            <strong className="text-ink">
                                                A record
                                            </strong>{' '}
                                            pointing traffic to your server:
                                        </p>
                                        <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-surface p-2 font-mono text-[11px] ring-1 ring-line">
                                            <div>
                                                <span className="block text-[10px] text-faint uppercase">
                                                    Type
                                                </span>
                                                <span className="font-semibold text-ink">
                                                    A
                                                </span>
                                            </div>
                                            <div>
                                                <span className="block text-[10px] text-faint uppercase">
                                                    Host / Name
                                                </span>
                                                <span className="font-semibold text-ink">
                                                    {useCustomDomain
                                                        ? customDomain.split(
                                                              '.',
                                                          )[0] || '@'
                                                        : subdomain || '@'}{' '}
                                                    <span className="font-sans text-[10px] text-faint">
                                                        (or *)
                                                    </span>
                                                </span>
                                            </div>
                                            <div>
                                                <span className="block text-[10px] text-faint uppercase">
                                                    Points to
                                                </span>
                                                <span className="font-semibold text-ink">
                                                    {currentServer.ip}
                                                </span>
                                            </div>
                                        </div>
                                        <p className="mt-1.5 text-[10px] leading-relaxed text-faint">
                                            💡 <strong>Pro-Tip:</strong> Using{' '}
                                            <code className="rounded bg-badge px-1 py-0.5 font-mono text-ink">
                                                *
                                            </code>{' '}
                                            as host in GoDaddy routes all
                                            companion apps to this server.
                                            Traefik automatically issues Let's
                                            Encrypt SSL certificates once
                                            traffic arrives.
                                        </p>
                                    </div>
                                ) : null}
                            </div>

                            {/* Database Engine Selector */}
                            {currentApp.availableDbs && (
                                <div>
                                    <label className="mb-1.5 block text-xs font-medium text-soft">
                                        Storage & Database Engine
                                    </label>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        {currentApp.availableDbs.map(
                                            (dbOption) => (
                                                <button
                                                    key={dbOption.id}
                                                    type="button"
                                                    onClick={() =>
                                                        setDatabase(dbOption.id)
                                                    }
                                                    className={cn(
                                                        'flex flex-col rounded-xl p-2.5 text-left ring-1 transition',
                                                        database === dbOption.id
                                                            ? 'bg-ok-tint text-ink ring-ok/30 dark:bg-emerald-500/10 dark:ring-emerald-500/50'
                                                            : 'bg-badge/40 text-soft ring-line/70 hover:bg-badge hover:text-ink',
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-semibold">
                                                            {dbOption.label}
                                                        </span>
                                                        {database ===
                                                            dbOption.id && (
                                                            <Check className="size-3.5 text-ok dark:text-emerald-400" />
                                                        )}
                                                    </div>
                                                    <span className="mt-0.5 text-[10px] text-faint">
                                                        {dbOption.desc}
                                                    </span>
                                                </button>
                                            ),
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Admin Email */}
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-soft">
                                    Administrator Email
                                </label>
                                <div className="relative">
                                    <input
                                        type="email"
                                        value={adminEmail}
                                        onChange={(e) =>
                                            setAdminEmail(e.target.value)
                                        }
                                        placeholder="admin@example.com"
                                        className="focus:ring-primary w-full rounded-xl border-0 bg-surface py-2.5 pr-3 pl-9 text-sm text-ink ring-1 ring-line outline-none focus:ring-2"
                                    />
                                    <Mail className="pointer-events-none absolute top-3 left-3 size-4 text-soft" />
                                </div>
                            </div>

                            {/* Optional Integrations */}
                            <div className="space-y-2 rounded-xl bg-badge/40 p-3 ring-1 ring-line/50">
                                <span className="block text-xs font-medium text-soft">
                                    Integrations & Wiring
                                </span>
                                <div className="flex flex-col gap-2">
                                    <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
                                        <input
                                            type="checkbox"
                                            checked={wireMail}
                                            onChange={(e) =>
                                                setWireMail(e.target.checked)
                                            }
                                            className="text-primary focus:ring-primary rounded border-line"
                                        />
                                        <span>
                                            Connect Stalwart Mail Relay (SMTP)
                                        </span>
                                    </label>
                                    <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
                                        <input
                                            type="checkbox"
                                            checked={wireSso}
                                            onChange={(e) =>
                                                setWireSso(e.target.checked)
                                            }
                                            className="text-primary focus:ring-primary rounded border-line"
                                        />
                                        <span>
                                            Connect Zitadel Single Sign-On
                                            (OIDC)
                                        </span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 4: REVIEW & DEPLOY */}
                    {currentStep === 4 && (
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-sm font-semibold text-ink">
                                    Review Deployment
                                </h3>
                                <p className="text-xs text-soft">
                                    Double-check your parameters before
                                    launching to the cluster.
                                </p>
                            </div>

                            <div className="space-y-3.5 rounded-xl border border-line bg-paper/60 p-4">
                                <div className="flex items-center gap-3 border-b border-line/60 pb-3">
                                    <ToolLogo
                                        tool={{
                                            tool: currentApp.id,
                                            icon: '*',
                                            label: currentApp.name,
                                            brand: currentApp.name,
                                            installed: false,
                                            instance: '',
                                            namespace: '',
                                            host: null,
                                            url: null,
                                            installedAt: null,
                                            sso: '—',
                                            mail: 'N/A',
                                            vpn: 'N/A',
                                            sync: 'N/A',
                                            rotation: 'N/A',
                                        }}
                                        size="lg"
                                    />
                                    <div>
                                        <h4 className="text-sm font-bold text-ink">
                                            {currentApp.name}
                                        </h4>
                                        <p className="text-xs text-soft">
                                            {currentApp.tagline}
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div>
                                        <span className="block text-[10px] text-faint uppercase">
                                            Target Cluster
                                        </span>
                                        <span className="font-semibold text-ink">
                                            {currentServer?.name} (
                                            {currentServer?.provider.toUpperCase()}
                                            )
                                        </span>
                                        <span className="block font-mono text-[11px] text-soft">
                                            {currentServer?.ip ?? 'local'}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-faint uppercase">
                                            Live Address
                                        </span>
                                        <span className="text-primary font-mono font-semibold">
                                            https://{resolvedDomain}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-faint uppercase">
                                            Routing & DNS
                                        </span>
                                        <span className="font-semibold text-ink">
                                            {hasExternalDns ? (
                                                <span className="inline-flex items-center gap-1 text-ok dark:text-emerald-400">
                                                    <Check className="size-3" />{' '}
                                                    ExternalDNS Auto-Sync
                                                </span>
                                            ) : (
                                                'Manual A-Record'
                                            )}
                                        </span>
                                        <span className="block text-[11px] text-soft">
                                            {hasExternalDns
                                                ? 'Cloudflare managed'
                                                : `Points to ${currentServer?.ip ?? 'server'}`}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-faint uppercase">
                                            Database Engine
                                        </span>
                                        <span className="font-semibold text-ink">
                                            {database
                                                ? database.toUpperCase()
                                                : 'Embedded SQLite'}
                                        </span>
                                    </div>
                                    <div className="col-span-2">
                                        <span className="block text-[10px] text-faint uppercase">
                                            Admin Email
                                        </span>
                                        <span className="font-semibold text-ink">
                                            {adminEmail ||
                                                `admin@${resolvedDomain}`}
                                        </span>
                                    </div>
                                </div>

                                {(wireMail || wireSso) && (
                                    <div className="border-t border-line/60 pt-2.5 text-xs">
                                        <span className="block text-[10px] text-faint uppercase">
                                            Active Integrations
                                        </span>
                                        <div className="mt-1 flex flex-wrap gap-1.5">
                                            {wireMail && (
                                                <span className="rounded-full bg-badge px-2 py-0.5 text-[10px] font-medium text-ink">
                                                    ✉️ Stalwart SMTP Mail
                                                </span>
                                            )}
                                            {wireSso && (
                                                <span className="rounded-full bg-badge px-2 py-0.5 text-[10px] font-medium text-ink">
                                                    🔑 Zitadel SSO (OIDC)
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Readiness Notice */}
                            <div className="rounded-xl border border-line bg-surface p-3 text-xs text-soft">
                                <p className="font-medium text-ink">
                                    Ready to deploy?
                                </p>
                                <p className="mt-0.5 text-[11px] leading-relaxed">
                                    Clicking{' '}
                                    <strong className="text-ink">Launch</strong>{' '}
                                    triggers LaraKube's orchestrator to deploy
                                    FrankenPHP pods, configure Traefik ingress,
                                    mount persistent PVC volumes, and auto-sync
                                    credentials to OpenBao.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Modal Footer Actions */}
                    <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
                        <div>
                            {currentStep > 1 ? (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={handlePrev}
                                >
                                    <ArrowLeft className="size-3.5" />
                                    <span>Back</span>
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={onClose}
                                >
                                    <X className="size-3.5" />
                                    <span>Cancel</span>
                                </Button>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            {currentStep < 4 ? (
                                <Button
                                    type="button"
                                    variant="primary"
                                    disabled={
                                        (currentStep === 2 &&
                                            readyServers.length === 0) ||
                                        (currentStep === 3 && !resolvedDomain)
                                    }
                                    onClick={handleNext}
                                >
                                    <span>
                                        {currentStep === 1
                                            ? 'Next: Select Cluster'
                                            : currentStep === 2
                                              ? 'Next: Configuration'
                                              : 'Next: Review'}
                                    </span>
                                    <ArrowRight className="size-3.5" />
                                </Button>
                            ) : (
                                <Button
                                    type="submit"
                                    variant="primary"
                                    disabled={
                                        submitting ||
                                        readyServers.length === 0 ||
                                        !resolvedDomain
                                    }
                                >
                                    <Rocket className="size-3.5" />
                                    <span>
                                        {readyServers.length === 0
                                            ? 'Server Required'
                                            : submitting
                                              ? 'Deploying…'
                                              : `Launch ${currentApp.name}`}
                                    </span>
                                </Button>
                            )}
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
