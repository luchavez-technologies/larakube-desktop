import { useState, useMemo, useEffect, useRef } from 'react';
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
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    CheckCircle2,
    Circle,
    ExternalLink,
    RefreshCw,
    RotateCw,
    Sparkles,
    ChevronDown,
    Shield,
    XCircle,
} from 'lucide-react';
import Button, { buttonClass } from '@/components/button';
import CopyButton from '@/components/copy-button';
import InfoTooltip from '@/components/info-tooltip';
import ToolLogo from '@/components/tool-logo';
import ProviderLogo from '@/components/provider-logo';
import CommonsCapabilityPills from '@/components/commons-capability-pills';
import StatusPill from '@/components/status-pill';
import { sendJson } from '@/lib/http';
import { useRightDrawerOpen } from '@/lib/right-drawer-open';
import { runStatus } from '@/lib/servers';
import { open } from '@/routes';
import { create as createServer } from '@/routes/servers';
import { show as showRunRoute } from '@/routes/runs';
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
    /** Where this app's admin/dashboard UI actually lives, if not the bare domain (e.g. PocketBase's own admin is `/_/`, not `/`). */
    adminPath?: string;
}

const APPS: AppOption[] = [
    {
        id: 'pocketbase',
        name: 'PocketBase',
        tagline: 'Instant Backend & Auth',
        description:
            'Lightweight SQLite database with realtime subscriptions, file storage, and built-in auth.',
        defaultSubdomain: 'pb',
        adminPath: '/_/',
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
        capabilities: {
            databases: ['sqlite', 'postgresql'],
            cache: ['redis'],
            storage: ['s3'],
            auth: [],
            mail: [],
        },
    },
    {
        id: 'wordpress',
        name: 'WordPress',
        tagline: "World's #1 CMS",
        description:
            'Blazing fast ServerSideUp FrankenPHP pod with zero-RAM SQLite or shared Plex MySQL.',
        defaultSubdomain: 'blog',
        defaultDb: 'sqlite',
        adminPath: '/wp-admin',
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

type LaunchedRun = {
    id: number;
    label: string;
    status: string;
};

type LaunchedTool = {
    slug: string;
    displayName: string;
    domain: string;
};

type ToolCredentials = Record<string, string>;

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
    useRightDrawerOpen(isOpen);

    const readyServers = useMemo(
        () => servers.filter((s) => s.status === 'ready' && s.context),
        [servers],
    );

    const [currentStep, setCurrentStep] = useState<number>(1);
    const [highestReachedStep, setHighestReachedStep] = useState<number>(1);
    const [slidIn, setSlidIn] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setSlidIn(false);
            return;
        }
        const frame = requestAnimationFrame(() => setSlidIn(true));
        return () => cancelAnimationFrame(frame);
    }, [isOpen]);

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
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [confirmCommonsRestart, setConfirmCommonsRestart] =
        useState<boolean>(false);
    const [showRestartConfirmDialog, setShowRestartConfirmDialog] =
        useState<boolean>(false);
    const [dnsCopied, setDnsCopied] = useState<boolean>(false);

    // Once launched, the drawer stays open and shows live progress here
    // instead of redirecting to the Activity Log — the log widget already
    // covers that; this is what the user asked to see without leaving.
    const [launchedRun, setLaunchedRun] = useState<LaunchedRun | null>(null);
    const [launchedTool, setLaunchedTool] = useState<LaunchedTool | null>(null);
    const [credentials, setCredentials] = useState<ToolCredentials | null>(
        null,
    );
    const [credentialsChecked, setCredentialsChecked] =
        useState<boolean>(false);

    const [domains, setDomains] = useState<ServerDomain[]>([]);
    const [loadingDomains, setLoadingDomains] = useState<boolean>(false);
    const [clusterServices, setClusterServices] = useState<string[]>(() =>
        (activeCommonsServices ?? []).map((s) => s.toLowerCase()),
    );
    const [domainDropdownOpen, setDomainDropdownOpen] =
        useState<boolean>(false);
    const domainDropdownRef = useRef<HTMLDivElement>(null);

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

    const isLocalServer = useMemo(() => {
        if (!currentServer) return true;
        const provider = (currentServer.provider ?? '').toLowerCase();
        const localProviders = [
            'local',
            'k3d',
            'kind',
            'orbstack',
            'minikube',
            'docker',
        ];
        if (localProviders.includes(provider)) return true;
        if (currentServer.region === 'local') return true;
        if (
            currentServer.ip &&
            ['127.0.0.1', 'localhost', 'local'].includes(currentServer.ip)
        ) {
            return true;
        }
        if (
            !currentServer.ip &&
            !['gcp', 'aws', 'do', 'hetzner', 'vps', 'cloud'].includes(provider)
        ) {
            return true;
        }
        return false;
    }, [currentServer]);

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

    // Close domain dropdown when clicking outside or pressing Escape
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                domainDropdownRef.current &&
                !domainDropdownRef.current.contains(event.target as Node)
            ) {
                setDomainDropdownOpen(false);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setDomainDropdownOpen(false);
            }
        };

        if (domainDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [domainDropdownOpen]);

    // Reset or initialize state when opening modal
    useEffect(() => {
        if (isOpen) {
            if (initialApp) {
                setSelectedAppId(initialApp);
            }
            setCurrentStep(1);
            setHighestReachedStep(1);
            setDomainDropdownOpen(false);
            setSubmitError(null);
            setLaunchedRun(null);
            setLaunchedTool(null);
            setCredentials(null);
            setCredentialsChecked(false);
            setConfirmCommonsRestart(false);
            setShowRestartConfirmDialog(false);
        }
    }, [isOpen, initialApp]);

    // Poll only for the status transition — the floating activity log
    // (always mounted, see run-drawer.tsx) already streams this Run's actual
    // output from the same endpoint, so this drawer doesn't duplicate it.
    useEffect(() => {
        if (!launchedRun || launchedRun.status !== 'running') return;

        let isMounted = true;

        const tick = async () => {
            const res = await sendJson<{
                id: number;
                status: string;
            }>(`/runs/${launchedRun.id}/stream`, 'GET');

            if (isMounted && res.ok) {
                setLaunchedRun((prev) =>
                    prev && prev.id === res.data.id
                        ? { ...prev, status: res.data.status }
                        : prev,
                );
            }
        };

        void tick();
        const interval = setInterval(() => void tick(), 1500);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [launchedRun?.id, launchedRun?.status]);

    // Once the deploy succeeds, pull its bootstrap credentials live — the
    // same data `{tool}:show --json` now reports, fetched once rather than
    // scraped out of the Run's plain-text log.
    useEffect(() => {
        if (
            !launchedRun ||
            launchedRun.status !== 'succeeded' ||
            !launchedTool ||
            credentialsChecked
        ) {
            return;
        }

        setCredentialsChecked(true);

        void (async () => {
            const res = await sendJson<{ credentials: ToolCredentials | null }>(
                `/servers/${encodeURIComponent(selectedServerName)}/tools/${encodeURIComponent(launchedTool.slug)}/credentials?domain=${encodeURIComponent(launchedTool.domain)}`,
                'GET',
            );

            if (res.ok) {
                setCredentials(res.data.credentials ?? null);
            }
        })();
    }, [launchedRun, launchedTool, credentialsChecked, selectedServerName]);

    // Fetch domains and auto-detect ExternalDNS for selected server
    useEffect(() => {
        if (!isOpen || !selectedServerName) {
            setDomains([]);
            return;
        }

        let cancelled = false;
        setLoadingDomains(true);

        fetch(`/servers/${encodeURIComponent(selectedServerName)}/domains`)
            .then((res) =>
                res.ok
                    ? res.json()
                    : { domains: [], activeCommonsServices: [] },
            )
            .then(
                (data: {
                    domains?: ServerDomain[];
                    activeCommonsServices?: string[];
                }) => {
                    if (cancelled) return;
                    const fetched: ServerDomain[] = data.domains ?? [];
                    setDomains(fetched);

                    if (Array.isArray(data.activeCommonsServices)) {
                        setClusterServices(
                            data.activeCommonsServices.map((s) =>
                                s.toLowerCase(),
                            ),
                        );
                    }

                    // Auto-pick the first ExternalDNS zone if available, otherwise first connected domain
                    const extDomain = fetched.find((d) => d.externalDns);
                    const bestDomain = extDomain ?? fetched[0];

                    if (bestDomain) {
                        setBaseDomain(bestDomain.domain);
                        setUseCustomDomain(false);
                    } else if (isLocalServer) {
                        setBaseDomain('dev.test');
                        setUseCustomDomain(false);
                    } else {
                        // Cloud server without connected cluster domains:
                        // Do not suggest local .dev.test or third-party nip.io. Let operator enter their own domain.
                        setBaseDomain('');
                        setUseCustomDomain(false);
                    }
                },
            )
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
    }, [isOpen, selectedServerName, currentServer?.ip, isLocalServer]);

    // Sync defaults when app or server changes
    useEffect(() => {
        if (!isOpen) return;
        setSubdomain(currentApp.defaultSubdomain);
        if (currentApp.availableDbs && currentApp.availableDbs.length > 0) {
            const activeSet = new Set(clusterServices);
            if (
                currentApp.id === 'wordpress' &&
                (activeSet.has('mysql') || activeSet.has('mariadb'))
            ) {
                setDatabase('mysql');
            } else {
                setDatabase(currentApp.defaultDb ?? 'sqlite');
            }
        } else {
            setDatabase('');
        }
    }, [currentApp, isOpen, clusterServices]);

    // Initial server selection and email
    useEffect(() => {
        if (!selectedServerName && readyServers.length > 0) {
            setSelectedServerName(readyServers[0].name);
        }
    }, [readyServers, selectedServerName]);

    useEffect(() => {
        if (currentServer?.account && currentServer.account.includes('@')) {
            setAdminEmail(currentServer.account);
            return;
        }
        // The domain the person is actually launching on (the base domain
        // they picked, not the app's own subdomain prefix) reads as a real
        // admin address — a per-server ".local" placeholder didn't.
        const domain = useCustomDomain
            ? customDomain.trim().toLowerCase()
            : baseDomain.trim().toLowerCase();
        if (domain) {
            setAdminEmail(`admin@${domain}`);
        } else if (currentServer?.ip) {
            setAdminEmail(`admin@${currentServer.name}.local`);
        }
    }, [currentServer, baseDomain, useCustomDomain, customDomain]);

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

    const appSupportsMail = Boolean(
        currentApp.capabilities.mail?.includes('smtp'),
    );
    const clusterHasMail =
        clusterServices.includes('mail') || clusterServices.includes('smtp');

    const appSupportsSso = Boolean(
        currentApp.capabilities.auth?.includes('oidc') ||
        currentApp.capabilities.auth?.includes('sso'),
    );
    const clusterHasSso =
        clusterServices.includes('sso') ||
        clusterServices.includes('zitadel') ||
        clusterServices.includes('oidc');

    const resolvedDomain = useMemo(() => {
        if (useCustomDomain) {
            return customDomain.trim().toLowerCase() || 'app.example.com';
        }
        const sub =
            subdomain.trim().toLowerCase() || currentApp.defaultSubdomain;
        const fallbackBase = isLocalServer ? 'dev.test' : 'example.com';
        const base = baseDomain.trim().toLowerCase() || fallbackBase;
        return `${sub}.${base}`;
    }, [
        useCustomDomain,
        customDomain,
        subdomain,
        currentApp.defaultSubdomain,
        baseDomain,
        isLocalServer,
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

    const executeLaunch = (confirmRestart: boolean) => {
        if (!selectedServerName || !resolvedDomain) return;
        if (useCustomDomain && !customDomain.trim()) return;

        setSubmitting(true);
        setSubmitError(null);

        void (async () => {
            const res = await sendJson<{
                run?: { id: number; label: string; status: string };
                tool?: { slug: string; displayName: string; domain: string };
                message?: string;
            }>('/quick-actions/launch', 'POST', {
                tool: selectedAppId,
                server: selectedServerName,
                domain: resolvedDomain,
                admin_email: adminEmail,
                ...(database ? { database } : {}),
                wire_sso: wireSso ? '1' : '0',
                wire_mail: wireMail ? '1' : '0',
                confirm_commons_restart: confirmRestart ? '1' : '0',
            });

            setSubmitting(false);

            if (!res.ok || !res.data.run) {
                setSubmitError(
                    res.data.message ?? 'Could not start the deployment.',
                );
                return;
            }

            setLaunchedRun({
                id: res.data.run.id,
                label: res.data.run.label,
                status: res.data.run.status,
            });
            setLaunchedTool(res.data.tool ?? null);
        })();
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (currentStep < 4) {
            handleNext();
            return;
        }

        if (!selectedServerName || !resolvedDomain) return;
        if (useCustomDomain && !customDomain.trim()) return;

        if (!confirmCommonsRestart) {
            setShowRestartConfirmDialog(true);
            return;
        }

        executeLaunch(true);
    };

    // A successful run changed cluster state this drawer's host page may
    // already have rendered (the tools list, domain status, …) — refresh it
    // silently rather than making "Done" look like nothing happened.
    const handleClose = () => {
        if (launchedRun?.status === 'succeeded') {
            router.reload();
        }
        onClose();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex justify-end bg-ink/45 backdrop-blur-xs"
            onClick={handleClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                className={cn(
                    'flex h-full w-full max-w-xl flex-col overflow-hidden bg-surface shadow-2xl ring-1 ring-line transition-transform duration-300 ease-out',
                    slidIn ? 'translate-x-0' : 'translate-x-full',
                )}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Stepper Header */}
                <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6">
                    <div className="flex items-center gap-2.5">
                        <div className="flex size-9 items-center justify-center rounded-xl bg-brand/10 text-brand">
                            <Zap className="size-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-ink">
                                Quick Launch
                            </h2>
                            <p className="text-xs text-soft">
                                {launchedRun ? (
                                    launchedRun.status === 'running' ? (
                                        `Deploying ${currentApp.name}…`
                                    ) : launchedRun.status === 'succeeded' ? (
                                        `${currentApp.name} is live`
                                    ) : (
                                        'Deployment failed'
                                    )
                                ) : (
                                    <>
                                        Step {currentStep} of {STEPS.length}:{' '}
                                        {STEPS[currentStep - 1].label.replace(
                                            /^\d+\.\s*/,
                                            '',
                                        )}
                                    </>
                                )}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        aria-label="Close dialog"
                        className="rounded-lg p-1.5 text-soft transition hover:bg-badge hover:text-ink"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                {/* Stepper Navigation Progress Bar */}
                {!launchedRun && (
                    <div className="border-b border-line/70 bg-paper/50 px-4 py-2 sm:px-6">
                        <nav
                            aria-label="Progress"
                            className="flex items-center justify-between"
                        >
                            {STEPS.map((step, idx) => {
                                const stepNum = idx + 1;
                                const isCompleted = stepNum < currentStep;
                                const isCurrent = stepNum === currentStep;
                                const isClickable =
                                    stepNum <= highestReachedStep;

                                return (
                                    <button
                                        key={step.id}
                                        type="button"
                                        disabled={!isClickable}
                                        onClick={() =>
                                            isClickable &&
                                            setCurrentStep(stepNum)
                                        }
                                        className={cn(
                                            'flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition',
                                            isCurrent
                                                ? 'text-brand'
                                                : isCompleted
                                                  ? 'cursor-pointer text-ink hover:text-brand'
                                                  : 'cursor-not-allowed text-faint',
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'flex size-5 items-center justify-center rounded-full text-[10px] font-bold transition',
                                                isCurrent
                                                    ? 'bg-brand text-white shadow-2xs'
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
                )}

                {launchedRun ? (
                    <LaunchedRunPanel
                        run={launchedRun}
                        tool={launchedTool}
                        appName={currentApp.name}
                        adminPath={currentApp.adminPath}
                        credentials={credentials}
                        credentialsLoading={
                            launchedRun.status === 'succeeded' &&
                            !credentialsChecked
                        }
                        onClose={handleClose}
                        onRetry={() => setLaunchedRun(null)}
                    />
                ) : (
                    <form
                        onSubmit={handleSubmit}
                        onKeyDown={(event) => {
                            // Enter anywhere in the wizard must never trigger the
                            // actual (irreversible) launch — at most it advances
                            // like clicking "Next" would, same validation gates
                            // included; on Review it does nothing, Launch needs
                            // an explicit click.
                            if (
                                event.key !== 'Enter' ||
                                (event.target as HTMLElement).tagName ===
                                    'TEXTAREA'
                            ) {
                                return;
                            }
                            event.preventDefault();
                            if (currentStep < 4) {
                                handleNext();
                            }
                        }}
                        className="flex h-full flex-col overflow-hidden"
                    >
                        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
                            {/* STEP 1: APPLICATION SELECTION */}
                            {currentStep === 1 && (
                                <div className="space-y-4">
                                    <div>
                                        <h3 className="text-sm font-semibold text-ink">
                                            Choose Application
                                        </h3>
                                        <p className="text-xs text-soft">
                                            Select a production-grade companion
                                            workload to deploy to your fleet.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                        {APPS.map((app) => {
                                            const isSelected =
                                                selectedAppId === app.id;
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
                                                            ? 'bg-brand/5 shadow-xs ring-2 ring-brand'
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
                                                                    instance:
                                                                        '',
                                                                    namespace:
                                                                        '',
                                                                    host: null,
                                                                    url: null,
                                                                    installedAt:
                                                                        null,
                                                                    sso: '—',
                                                                    mail: 'N/A',
                                                                    vpn: 'N/A',
                                                                    sync: 'N/A',
                                                                    rotation:
                                                                        'N/A',
                                                                }}
                                                                size="md"
                                                            />
                                                            {isSelected && (
                                                                <span className="flex size-4.5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
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
                                            <span>
                                                {currentApp.name} Overview
                                            </span>
                                        </div>
                                        <p className="mt-1 leading-relaxed text-soft">
                                            {currentApp.description}
                                            {currentApp.availableDbs &&
                                            currentApp.availableDbs.length >
                                                0 ? (
                                                <>
                                                    {' '}
                                                    Default database is{' '}
                                                    <strong className="text-ink">
                                                        {currentApp.defaultDb ??
                                                            'SQLite'}
                                                    </strong>
                                                    . Configurable in step 3.
                                                </>
                                            ) : (
                                                <>
                                                    {' '}
                                                    Uses lightweight embedded
                                                    SQLite storage.
                                                </>
                                            )}
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
                                            Select the running Kubernetes server
                                            that will host {currentApp.name}.
                                        </p>
                                    </div>

                                    {readyServers.length > 0 ? (
                                        <div className="space-y-2.5">
                                            <div className="grid grid-cols-1 gap-2.5">
                                                {readyServers.map((s) => {
                                                    const isSelected =
                                                        selectedServerName ===
                                                        s.name;
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
                                                                    ? 'bg-brand/5 shadow-xs ring-2 ring-brand'
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
                                                                            {
                                                                                s.name
                                                                            }
                                                                        </span>
                                                                        <span className="rounded-full bg-badge px-1.5 py-0.5 font-mono text-[10px] text-soft uppercase">
                                                                            {
                                                                                s.provider
                                                                            }
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
                                                                {s.hasExternalDns ? (
                                                                    <span className="inline-flex items-center gap-1 rounded-full bg-ok-tint px-2 py-0.5 text-[10px] font-medium text-ok dark:bg-emerald-500/20 dark:text-emerald-300">
                                                                        <Sparkles className="size-2.5" />
                                                                        ExternalDNS
                                                                        Active
                                                                        <InfoTooltip
                                                                            align="right"
                                                                            side="bottom"
                                                                        >
                                                                            This
                                                                            cluster
                                                                            manages
                                                                            a
                                                                            connected
                                                                            domain
                                                                            itself:
                                                                            DNS
                                                                            records
                                                                            and
                                                                            SSL
                                                                            certificates
                                                                            are
                                                                            created
                                                                            automatically
                                                                            when
                                                                            you
                                                                            deploy,
                                                                            no
                                                                            manual
                                                                            setup
                                                                            needed.
                                                                        </InfoTooltip>
                                                                    </span>
                                                                ) : (
                                                                    // Same slot, always present — an empty one here (not
                                                                    // just omitting the pill) is what keeps every row's
                                                                    // "Ready" badge landing at the same x position. Spelled
                                                                    // out with a label + its own info icon, not a bare
                                                                    // circle: that read as an unexplained decoration.
                                                                    <span className="inline-flex items-center gap-1 rounded-full bg-badge px-2 py-0.5 text-[10px] font-medium text-faint">
                                                                        <Circle className="size-2.5" />
                                                                        Manual
                                                                        DNS
                                                                        <InfoTooltip
                                                                            align="right"
                                                                            side="bottom"
                                                                        >
                                                                            This
                                                                            cluster
                                                                            has
                                                                            no
                                                                            domain
                                                                            connected
                                                                            to
                                                                            ExternalDNS
                                                                            yet.
                                                                            After
                                                                            launching,
                                                                            you'll
                                                                            add
                                                                            a
                                                                            DNS
                                                                            A
                                                                            record
                                                                            yourself
                                                                            at
                                                                            your
                                                                            registrar.
                                                                        </InfoTooltip>
                                                                    </span>
                                                                )}
                                                                <span className="inline-flex items-center gap-1 rounded-full bg-ok-tint px-2 py-0.5 text-[10px] font-medium text-ok">
                                                                    <Check className="size-3" />{' '}
                                                                    Ready
                                                                </span>
                                                                {/* Always present, selected or not — otherwise every
                                                                    badge to its left shifts left/right as rows are
                                                                    clicked, which is what looked "wrong" about it. */}
                                                                <span
                                                                    className={cn(
                                                                        'flex size-4.5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors',
                                                                        isSelected
                                                                            ? 'bg-brand text-white'
                                                                            : 'text-line ring-1 ring-line',
                                                                    )}
                                                                >
                                                                    {isSelected
                                                                        ? '✓'
                                                                        : ''}
                                                                </span>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            {/* Action to create a new server */}
                                            <div className="mt-3 flex items-center justify-between rounded-xl border border-line/80 bg-paper/40 p-3 text-xs">
                                                <span className="text-soft">
                                                    Need a fresh server or
                                                    different cloud provider?
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
                                                    <span>
                                                        Create New Server
                                                    </span>
                                                </Link>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="rounded-2xl border border-warn/30 bg-warn/10 p-5 text-xs text-ink ring-1 ring-warn/20">
                                            <div className="flex items-start gap-3">
                                                <AlertCircle className="mt-0.5 size-5 shrink-0 text-warn" />
                                                <div className="flex-1 space-y-2">
                                                    <p className="text-sm font-semibold text-warn">
                                                        No ready Kubernetes
                                                        servers available
                                                    </p>
                                                    <p className="text-xs leading-relaxed text-soft">
                                                        To deploy companion
                                                        applications, you need
                                                        an active cluster.
                                                        LaraKube provisions
                                                        hardened single-node
                                                        Kubernetes (k3s)
                                                        clusters on
                                                        DigitalOcean, Hetzner,
                                                        AWS, GCP, or locally in
                                                        minutes.
                                                    </p>
                                                    <div className="pt-2">
                                                        <Link
                                                            href={
                                                                createServer()
                                                                    .url
                                                            }
                                                            className={buttonClass(
                                                                'primary',
                                                                'sm',
                                                                'gap-1.5',
                                                            )}
                                                        >
                                                            <Plus className="size-3.5" />
                                                            <span>
                                                                Create a Server
                                                                (Hetzner, DO,
                                                                AWS)
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
                                            Set your routing address, database
                                            engine, and administrator
                                            credentials.
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
                                                            ExternalDNS
                                                            Auto-Sync
                                                        </span>
                                                    </span>
                                                ) : isLocalServer ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setBaseDomain(
                                                                'dev.test',
                                                            );
                                                            setUseCustomDomain(
                                                                false,
                                                            );
                                                        }}
                                                        className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
                                                    >
                                                        <Zap className="size-3" />
                                                        <span>
                                                            Use local .dev.test
                                                        </span>
                                                    </button>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (useCustomDomain) {
                                                            setUseCustomDomain(
                                                                false,
                                                            );
                                                        } else {
                                                            setUseCustomDomain(
                                                                true,
                                                            );
                                                            setCustomDomain(
                                                                resolvedDomain,
                                                            );
                                                        }
                                                    }}
                                                    className="text-[11px] text-brand hover:underline"
                                                >
                                                    {useCustomDomain
                                                        ? domains.length > 0
                                                            ? 'Pick connected base domain'
                                                            : 'Use subdomain + domain'
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
                                                        setCustomDomain(
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder="app.example.com"
                                                    className="w-full rounded-xl border-0 bg-surface py-2.5 pr-3 pl-9 font-mono text-sm text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-brand"
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
                                                        className="w-full rounded-xl border-0 bg-surface py-2.5 pr-2 pl-9 font-mono text-sm text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-brand"
                                                        required
                                                    />
                                                    <Globe className="pointer-events-none absolute top-3 left-3 size-4 text-soft" />
                                                </div>
                                                <span className="text-sm font-semibold text-soft">
                                                    .
                                                </span>
                                                {domains.length > 0 ? (
                                                    <div
                                                        ref={domainDropdownRef}
                                                        className="relative"
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setDomainDropdownOpen(
                                                                    (prev) =>
                                                                        !prev,
                                                                )
                                                            }
                                                            className={cn(
                                                                'flex h-[42px] cursor-pointer items-center justify-between gap-2 rounded-xl bg-surface px-3.5 font-mono text-xs text-ink ring-1 transition outline-none',
                                                                domainDropdownOpen
                                                                    ? 'bg-brand/5 shadow-xs ring-2 ring-brand'
                                                                    : 'ring-line hover:bg-badge/30 hover:ring-brand/50',
                                                            )}
                                                        >
                                                            <div className="flex min-w-0 items-center gap-1.5">
                                                                <span className="max-w-[140px] truncate font-semibold sm:max-w-[180px]">
                                                                    {baseDomain ||
                                                                        'Select domain'}
                                                                </span>
                                                                {selectedDomainMeta?.externalDns ? (
                                                                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:text-emerald-300">
                                                                        <Sparkles className="size-2.5" />
                                                                        Cloudflare
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
                                                                    Cluster
                                                                    Domains &
                                                                    Zones
                                                                </div>
                                                                <div className="flex flex-col gap-0.5">
                                                                    {domains.map(
                                                                        (d) => {
                                                                            const isSelected =
                                                                                d.domain ===
                                                                                baseDomain;
                                                                            return (
                                                                                <button
                                                                                    key={
                                                                                        d.domain
                                                                                    }
                                                                                    type="button"
                                                                                    onClick={() => {
                                                                                        setBaseDomain(
                                                                                            d.domain,
                                                                                        );
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
                                                                                            {
                                                                                                d.domain
                                                                                            }
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
                                                                        },
                                                                    )}
                                                                </div>

                                                                <div className="my-1 border-t border-line/60" />

                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setUseCustomDomain(
                                                                            true,
                                                                        );
                                                                        setCustomDomain(
                                                                            resolvedDomain,
                                                                        );
                                                                        setDomainDropdownOpen(
                                                                            false,
                                                                        );
                                                                    }}
                                                                    className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs text-soft transition hover:bg-badge hover:text-ink"
                                                                >
                                                                    <Plus className="size-3.5 text-soft" />
                                                                    <span>
                                                                        Enter
                                                                        custom
                                                                        full
                                                                        domain…
                                                                    </span>
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
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
                                                            isLocalServer
                                                                ? 'dev.test'
                                                                : 'example.com'
                                                        }
                                                        className="w-48 rounded-xl border-0 bg-surface px-3 py-2.5 font-mono text-sm text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-brand"
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
                                                            ExternalDNS
                                                            Auto-Sync
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
                                                    via ExternalDNS. An A-record
                                                    for{' '}
                                                    <strong className="font-mono text-emerald-950 dark:text-emerald-100">
                                                        {resolvedDomain}
                                                    </strong>{' '}
                                                    will be synchronized to
                                                    Cloudflare automatically
                                                    once launched. Traefik
                                                    automatically handles Let's
                                                    Encrypt SSL certificates.
                                                </p>
                                            </div>
                                        ) : currentServer?.ip &&
                                          ![
                                              '127.0.0.1',
                                              'localhost',
                                              'local',
                                          ].includes(currentServer.ip) ? (
                                            <div className="mt-2.5 rounded-xl border border-line bg-paper/60 p-3 text-xs">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-1.5 font-medium text-ink">
                                                        <Globe className="size-3.5 text-soft" />
                                                        <span>
                                                            DNS for GoDaddy,
                                                            Namecheap & External
                                                            Registrars
                                                        </span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={handleCopyDns}
                                                        className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
                                                    >
                                                        {dnsCopied ? (
                                                            <>
                                                                <Check className="size-3 text-ok" />
                                                                <span>
                                                                    Copied!
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Copy className="size-3" />
                                                                <span>
                                                                    Copy DNS
                                                                    Record
                                                                </span>
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                                <p className="mt-1 text-[11px] leading-relaxed text-soft">
                                                    For domains registered on
                                                    GoDaddy or external DNS, add
                                                    an{' '}
                                                    <strong className="text-ink">
                                                        A record
                                                    </strong>{' '}
                                                    pointing traffic to your
                                                    server:
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
                                                                : subdomain ||
                                                                  '@'}{' '}
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
                                                    💡 <strong>Pro-Tip:</strong>{' '}
                                                    Using{' '}
                                                    <code className="rounded bg-badge px-1 py-0.5 font-mono text-ink">
                                                        *
                                                    </code>{' '}
                                                    as host in GoDaddy routes
                                                    all companion apps to this
                                                    server. Traefik
                                                    automatically issues Let's
                                                    Encrypt SSL certificates
                                                    once traffic arrives.
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
                                                                setDatabase(
                                                                    dbOption.id,
                                                                )
                                                            }
                                                            className={cn(
                                                                'flex flex-col rounded-xl p-2.5 text-left ring-1 transition',
                                                                database ===
                                                                    dbOption.id
                                                                    ? 'bg-ok-tint text-ink ring-ok/30 dark:bg-emerald-500/10 dark:ring-emerald-500/50'
                                                                    : 'bg-badge/40 text-soft ring-line/70 hover:bg-badge hover:text-ink',
                                                            )}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-xs font-semibold">
                                                                    {
                                                                        dbOption.label
                                                                    }
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
                                                    setAdminEmail(
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="admin@example.com"
                                                className="w-full rounded-xl border-0 bg-surface py-2.5 pr-3 pl-9 text-sm text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-brand"
                                            />
                                            <Mail className="pointer-events-none absolute top-3 left-3 size-4 text-soft" />
                                        </div>
                                    </div>

                                    {/* Integrations & Wiring */}
                                    {!appSupportsMail && !appSupportsSso ? (
                                        <div className="rounded-xl border border-line/70 bg-badge/30 p-3.5 text-xs">
                                            <div className="flex items-center gap-2 font-medium text-ink">
                                                <Sparkles className="size-3.5 text-brand" />
                                                <span>
                                                    Standalone Deployment
                                                </span>
                                            </div>
                                            <p className="mt-1 text-[11px] leading-relaxed text-soft">
                                                {currentApp.name} operates 100%
                                                self-contained with built-in
                                                authentication, embedded SQLite
                                                storage, and automatic Traefik
                                                SSL routing. No external mail
                                                relay or SSO provider needed.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2.5 rounded-xl bg-badge/40 p-3.5 ring-1 ring-line/50">
                                            <span className="block text-xs font-semibold text-ink">
                                                Companion Integrations
                                            </span>
                                            <div className="flex flex-col gap-2.5">
                                                {appSupportsMail &&
                                                    (clusterHasMail ? (
                                                        <label className="flex cursor-pointer items-start gap-2.5 text-xs text-ink">
                                                            <input
                                                                type="checkbox"
                                                                checked={
                                                                    wireMail
                                                                }
                                                                onChange={(e) =>
                                                                    setWireMail(
                                                                        e.target
                                                                            .checked,
                                                                    )
                                                                }
                                                                className="mt-0.5 rounded border-line text-brand focus:ring-brand"
                                                            />
                                                            <div>
                                                                <span className="font-medium">
                                                                    Connect
                                                                    Stalwart
                                                                    Mail Relay
                                                                    (SMTP)
                                                                </span>
                                                                <p className="text-[11px] text-soft">
                                                                    Stalwart
                                                                    detected on
                                                                    cluster.
                                                                    Automates
                                                                    transactional
                                                                    and
                                                                    notification
                                                                    emails.
                                                                </p>
                                                            </div>
                                                        </label>
                                                    ) : (
                                                        <div className="flex items-start gap-2 rounded-lg bg-surface/70 p-2.5 text-xs text-soft ring-1 ring-line/60">
                                                            <Mail className="mt-0.5 size-3.5 shrink-0 text-faint" />
                                                            <div>
                                                                <span className="font-medium text-ink">
                                                                    Stalwart
                                                                    Mail Relay:
                                                                    Not
                                                                    installed
                                                                </span>
                                                                <p className="text-[11px] text-faint">
                                                                    {
                                                                        currentApp.name
                                                                    }{' '}
                                                                    will use
                                                                    local
                                                                    mail/fallback.
                                                                    You can
                                                                    install
                                                                    Stalwart
                                                                    anytime from
                                                                    Tools.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ))}

                                                {appSupportsSso &&
                                                    (clusterHasSso ? (
                                                        <label className="flex cursor-pointer items-start gap-2.5 text-xs text-ink">
                                                            <input
                                                                type="checkbox"
                                                                checked={
                                                                    wireSso
                                                                }
                                                                onChange={(e) =>
                                                                    setWireSso(
                                                                        e.target
                                                                            .checked,
                                                                    )
                                                                }
                                                                className="mt-0.5 rounded border-line text-brand focus:ring-brand"
                                                            />
                                                            <div>
                                                                <span className="font-medium">
                                                                    Connect
                                                                    Zitadel
                                                                    Single
                                                                    Sign-On
                                                                    (OIDC)
                                                                </span>
                                                                <p className="text-[11px] text-soft">
                                                                    Zitadel
                                                                    detected on
                                                                    cluster.
                                                                    Registers
                                                                    OAuth2/OIDC
                                                                    client for
                                                                    one-click
                                                                    team login.
                                                                </p>
                                                            </div>
                                                        </label>
                                                    ) : (
                                                        <div className="flex items-start gap-2 rounded-lg bg-surface/70 p-2.5 text-xs text-soft ring-1 ring-line/60">
                                                            <Shield className="mt-0.5 size-3.5 shrink-0 text-faint" />
                                                            <div>
                                                                <span className="font-medium text-ink">
                                                                    Zitadel SSO:
                                                                    Not
                                                                    installed
                                                                </span>
                                                                <p className="text-[11px] text-faint">
                                                                    App will use
                                                                    standard
                                                                    administrator
                                                                    login
                                                                    credentials.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    )}
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
                                                    {currentServer?.ip ??
                                                        'local'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="block text-[10px] text-faint uppercase">
                                                    Live Address
                                                </span>
                                                <span className="font-mono font-semibold text-brand">
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
                                                            ExternalDNS
                                                            Auto-Sync
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
                                                            ✉️ Stalwart SMTP
                                                            Mail
                                                        </span>
                                                    )}
                                                    {wireSso && (
                                                        <span className="rounded-full bg-badge px-2 py-0.5 text-[10px] font-medium text-ink">
                                                            🔑 Zitadel SSO
                                                            (OIDC)
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Shared Commons Services Notice */}
                                    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3.5 text-xs">
                                        <div className="flex items-start gap-2.5">
                                            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                                            <div className="flex-1 space-y-1.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-semibold text-ink">
                                                        Shared Commons Services
                                                    </span>
                                                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                                        Redis / Databases
                                                    </span>
                                                </div>
                                                <p className="text-[11px] leading-relaxed text-soft">
                                                    Deploying companion apps
                                                    that join the shared Commons
                                                    may restart shared cluster
                                                    services (like Redis). Any
                                                    running companion apps
                                                    sharing Redis on this server
                                                    may briefly disconnect and
                                                    reset in-memory
                                                    cache/sessions.
                                                </p>
                                                <label className="flex cursor-pointer items-center gap-2 pt-1 select-none">
                                                    <input
                                                        type="checkbox"
                                                        checked={
                                                            confirmCommonsRestart
                                                        }
                                                        onChange={(e) =>
                                                            setConfirmCommonsRestart(
                                                                e.target
                                                                    .checked,
                                                            )
                                                        }
                                                        className="size-4 rounded border-line text-brand focus:ring-brand"
                                                    />
                                                    <span className="text-[11px] font-medium text-ink">
                                                        I confirm and allow
                                                        Commons service restarts
                                                        if required
                                                    </span>
                                                </label>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Readiness Notice */}
                                    <div className="rounded-xl border border-line bg-surface p-3 text-xs text-soft">
                                        <p className="font-medium text-ink">
                                            Ready to deploy?
                                        </p>
                                        <p className="mt-0.5 text-[11px] leading-relaxed">
                                            Clicking{' '}
                                            <strong className="text-ink">
                                                Launch
                                            </strong>{' '}
                                            triggers LaraKube's orchestrator to
                                            deploy FrankenPHP pods, configure
                                            Traefik ingress, mount persistent
                                            PVC volumes, and auto-sync
                                            credentials to OpenBao.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {submitError && (
                            <div className="mx-5 mb-3 flex items-start gap-2 rounded-xl border border-accent/30 bg-accent-tint px-3 py-2.5 text-xs text-accent sm:mx-6">
                                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                                <span>{submitError}</span>
                            </div>
                        )}

                        {/* Modal Footer Actions */}
                        <div className="flex items-center justify-between border-t border-line px-5 py-4 sm:px-6">
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
                                        onClick={handleClose}
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
                                            (currentStep === 3 &&
                                                !resolvedDomain)
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
                )}
            </div>

            {showRestartConfirmDialog && (
                <div
                    className="fixed inset-0 z-60 flex items-center justify-center bg-ink/50 p-6 backdrop-blur-xs"
                    onClick={() => setShowRestartConfirmDialog(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        className="w-full max-w-[460px] rounded-2xl border border-line bg-surface p-6 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                                <AlertTriangle className="size-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-ink">
                                    Restart Shared Services?
                                </h3>
                                <p className="text-xs text-soft">
                                    Shared Commons services may restart
                                </p>
                            </div>
                        </div>

                        <div className="mt-4 space-y-2 rounded-xl border border-line bg-paper/60 p-3.5 text-xs leading-relaxed text-soft">
                            <p>
                                Deploying{' '}
                                <strong className="text-ink">
                                    {currentApp.name}
                                </strong>{' '}
                                onto{' '}
                                <strong className="text-ink">
                                    {currentServer?.name}
                                </strong>{' '}
                                joins the cluster's shared Commons
                                infrastructure (e.g. <strong>Redis</strong> or
                                databases).
                            </p>
                            <p className="text-[11px] text-faint">
                                ⚠️ <strong>Notice:</strong> If this deployment
                                requires updating or restarting Redis, any
                                companion apps sharing Redis on this cluster
                                will briefly disconnect and in-memory caches and
                                active sessions will be reset.
                            </p>
                        </div>

                        <div className="mt-6 flex items-center justify-end gap-2.5">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() =>
                                    setShowRestartConfirmDialog(false)
                                }
                            >
                                <XCircle className="size-4" />
                                <span>Cancel</span>
                            </Button>
                            <Button
                                type="button"
                                variant="primary"
                                onClick={() => {
                                    setConfirmCommonsRestart(true);
                                    setShowRestartConfirmDialog(false);
                                    executeLaunch(true);
                                }}
                            >
                                <RotateCw className="size-4" />
                                <span>Allow Restart & Launch</span>
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Replaces the stepper body once a Quick Launch is submitted: live log,
 * then (on success) the admin URL and any bootstrap credentials, in place —
 * no redirect to the Activity Log, which already has its own floating widget
 * for anyone who wants the raw log elsewhere.
 */
function LaunchedRunPanel({
    run,
    tool,
    appName,
    adminPath,
    credentials,
    credentialsLoading,
    onClose,
    onRetry,
}: {
    run: LaunchedRun;
    tool: LaunchedTool | null;
    appName: string;
    adminPath?: string;
    credentials: ToolCredentials | null;
    credentialsLoading: boolean;
    onClose: () => void;
    onRetry: () => void;
}) {
    const isRunning = run.status === 'running';
    const isSucceeded = run.status === 'succeeded';
    const isFailed = !isRunning && !isSucceeded;
    const [statusLabel, statusTone] = runStatus[
        run.status as keyof typeof runStatus
    ] ?? ['Unknown', 'muted'];
    const hasCredentials =
        credentials !== null && Object.keys(credentials).length > 0;

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper/60 p-4">
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
                        <span className="truncate text-sm font-semibold text-ink">
                            {run.label}
                        </span>
                    </div>
                    <StatusPill tone={statusTone}>{statusLabel}</StatusPill>
                </div>

                {isRunning && (
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-soft">
                        <RefreshCw className="size-3 shrink-0 animate-spin" />
                        <span>
                            Watch live progress in the Activity panel at the
                            bottom right — this stays open until it finishes.
                        </span>
                    </p>
                )}

                {isSucceeded && tool && (
                    <div className="mt-4 space-y-3 rounded-xl border border-line bg-surface p-4">
                        <div className="flex items-center gap-2 text-ok">
                            <CheckCircle2 className="size-4.5 shrink-0" />
                            <span className="text-sm font-semibold text-ink">
                                {appName} is ready
                            </span>
                        </div>

                        {(() => {
                            const adminUrl = `https://${tool.domain}${adminPath ?? ''}`;

                            return (
                                <div className="flex items-center justify-between gap-2 rounded-lg bg-paper/60 px-3 py-2">
                                    <div className="min-w-0">
                                        <span className="block text-[10px] text-faint uppercase">
                                            Admin URL
                                        </span>
                                        <span className="block truncate font-mono text-xs text-brand">
                                            {adminUrl}
                                        </span>
                                    </div>
                                    <Link
                                        href={open().url}
                                        method="post"
                                        data={{ url: adminUrl }}
                                        as="button"
                                        title="Open in default browser"
                                        className={buttonClass(
                                            'secondary',
                                            'sm',
                                        )}
                                    >
                                        <ExternalLink className="size-3.5" />
                                        <span>Open</span>
                                    </Link>
                                </div>
                            );
                        })()}

                        {credentialsLoading && (
                            <p className="flex items-center gap-1.5 text-xs text-soft">
                                <RefreshCw className="size-3 animate-spin" />
                                <span>Checking for bootstrap credentials…</span>
                            </p>
                        )}

                        {!credentialsLoading && hasCredentials && (
                            <div className="space-y-2">
                                {credentials?.admin_email && (
                                    <CredentialRow
                                        label="Admin Email"
                                        value={credentials.admin_email}
                                    />
                                )}
                                {credentials?.admin_password && (
                                    <CredentialRow
                                        label="Admin Password"
                                        value={credentials.admin_password}
                                    />
                                )}
                            </div>
                        )}

                        {!credentialsLoading && !hasCredentials && (
                            <p className="text-xs text-soft">
                                No seeded admin account — the first person to
                                open the URL above claims it.
                            </p>
                        )}
                    </div>
                )}

                {isFailed && (
                    <div className="mt-4 flex items-start gap-2 rounded-xl border border-accent/30 bg-accent-tint p-4 text-xs text-accent">
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                        <span>
                            The deployment failed. Check the Activity panel at
                            the bottom right, or open the full entry below for
                            the complete log.
                        </span>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between border-t border-line px-5 py-4 sm:px-6">
                <Link
                    href={showRunRoute(run.id).url}
                    className="inline-flex items-center gap-1 text-xs text-soft hover:text-ink hover:underline"
                >
                    <span>View in Activity</span>
                    <ExternalLink className="size-3" />
                </Link>
                <div className="flex items-center gap-2">
                    {isFailed && (
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={onRetry}
                        >
                            <ArrowLeft className="size-3.5" />
                            <span>Back to Review</span>
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="primary"
                        disabled={isRunning}
                        onClick={onClose}
                    >
                        <Check className="size-3.5" />
                        <span>Done</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}

function CredentialRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-paper/60 px-3 py-2">
            <div className="min-w-0">
                <span className="block text-[10px] text-faint uppercase">
                    {label}
                </span>
                <span className="block truncate font-mono text-xs text-ink">
                    {value}
                </span>
            </div>
            <CopyButton value={value} size="sm" />
        </div>
    );
}
