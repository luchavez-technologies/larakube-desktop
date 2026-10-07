import { useState, useMemo, useEffect } from 'react';
import { router } from '@inertiajs/react';
import {
    Zap,
    Rocket,
    X,
    Server as ServerIcon,
    Globe,
    Mail,
    Check,
} from 'lucide-react';
import Button from '@/components/button';
import ToolLogo from '@/components/tool-logo';
import type { Server } from '@/types/larakube';

export type QuickLaunchAppId =
    | 'pocketbase'
    | 'n8n'
    | 'wordpress'
    | 'uptime-kuma';

interface AppOption {
    id: QuickLaunchAppId;
    name: string;
    description: string;
    tagline: string;
    defaultSubdomain: string;
    defaultDb?: string;
    availableDbs?: Array<{ id: string; label: string; desc: string }>;
}

const APPS: AppOption[] = [
    {
        id: 'pocketbase',
        name: 'PocketBase',
        tagline: 'Instant Backend',
        description:
            'Lightweight SQLite database with realtime subscriptions and built-in auth.',
        defaultSubdomain: 'pb',
    },
    {
        id: 'n8n',
        name: 'n8n Automation',
        tagline: 'Workflow Automation',
        description:
            'Fair-code node-based engine connecting 400+ apps and AI services.',
        defaultSubdomain: 'n8n',
        defaultDb: 'sqlite',
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
            'Blazing fast ServerSideUp FrankenPHP pod with instant SQLite or Plex MySQL.',
        defaultSubdomain: 'blog',
        defaultDb: 'sqlite',
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
    {
        id: 'uptime-kuma',
        name: 'Uptime Kuma',
        tagline: 'Service Monitor',
        description:
            'Self-hosted monitoring tool for HTTP, TCP, Ping, and public status pages.',
        defaultSubdomain: 'status',
    },
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

    // Sync defaults when app or server changes
    useEffect(() => {
        if (!isOpen) return;
        setSubdomain(currentApp.defaultSubdomain);
        if (currentApp.availableDbs && currentApp.availableDbs.length > 0) {
            // Check if active Commons has MySQL for WordPress or Postgres for n8n
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

    if (!isOpen) {
        return null;
    }

    const resolvedDomain = useCustomDomain
        ? customDomain.trim().toLowerCase()
        : subdomain.trim().toLowerCase()
          ? baseDomain
              ? `${subdomain.trim().toLowerCase()}.${baseDomain.trim().toLowerCase()}`
              : `${subdomain.trim().toLowerCase()}.example.com`
          : baseDomain || 'example.com';

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedServerName || !resolvedDomain) return;

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
                className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-2xl ring-1 ring-line"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-line pb-4">
                    <div className="flex items-center gap-2.5">
                        <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-xl">
                            <Zap className="size-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-ink">
                                1-Click Quick Launch
                            </h2>
                            <p className="text-xs text-soft">
                                Instant production companion deployment
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-soft hover:bg-badge hover:text-ink"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                    {/* App Selector Grid */}
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-soft">
                            Select Featured Application
                        </label>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {APPS.map((app) => (
                                <button
                                    key={app.id}
                                    type="button"
                                    onClick={() => setSelectedAppId(app.id)}
                                    className={`flex flex-col items-center justify-center rounded-xl p-3 text-center ring-1 transition ${
                                        selectedAppId === app.id
                                            ? 'bg-primary/10 ring-primary text-ink shadow-xs'
                                            : 'bg-badge/40 text-soft ring-line/70 hover:bg-badge hover:text-ink'
                                    }`}
                                >
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
                                    <span className="mt-2 text-xs font-semibold">
                                        {app.name}
                                    </span>
                                    <span className="line-clamp-1 text-[10px] text-faint">
                                        {app.tagline}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* App Description Banner */}
                    <div className="rounded-xl bg-badge/50 p-3 text-xs text-soft ring-1 ring-line/50">
                        <p className="font-medium text-ink">
                            {currentApp.name}
                        </p>
                        <p className="mt-0.5 text-xs text-soft">
                            {currentApp.description}
                        </p>
                    </div>

                    {/* Target Server */}
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-soft">
                            Target Server
                        </label>
                        {readyServers.length > 0 ? (
                            <div className="relative">
                                <select
                                    value={selectedServerName}
                                    onChange={(e) =>
                                        setSelectedServerName(e.target.value)
                                    }
                                    className="focus:ring-primary w-full rounded-xl border-0 bg-surface py-2.5 pr-3 pl-9 text-sm text-ink ring-1 ring-line outline-none focus:ring-2"
                                >
                                    {readyServers.map((s) => (
                                        <option key={s.name} value={s.name}>
                                            {s.name} ({s.provider.toUpperCase()}{' '}
                                            · {s.ip ?? 'local'})
                                        </option>
                                    ))}
                                </select>
                                <ServerIcon className="pointer-events-none absolute top-3 left-3 size-4 text-soft" />
                            </div>
                        ) : (
                            <div className="rounded-xl bg-warn-tint p-3 text-xs text-warn ring-1 ring-warn-line">
                                <p className="font-semibold">
                                    No ready servers available
                                </p>
                                <p className="mt-0.5">
                                    Please create or start a server before
                                    launching applications.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Domain & Address */}
                    <div>
                        <div className="mb-1.5 flex items-center justify-between">
                            <label className="text-xs font-medium text-soft">
                                Domain / Host Address
                            </label>
                            <button
                                type="button"
                                onClick={() =>
                                    setUseCustomDomain(!useCustomDomain)
                                }
                                className="text-primary text-[11px] hover:underline"
                            >
                                {useCustomDomain
                                    ? 'Use Subdomain format'
                                    : '+ Custom full domain'}
                            </button>
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
                                            setSubdomain(e.target.value)
                                        }
                                        placeholder="subdomain"
                                        className="focus:ring-primary w-full rounded-xl border-0 bg-surface py-2.5 pr-2 pl-9 font-mono text-sm text-ink ring-1 ring-line outline-none focus:ring-2"
                                        required
                                    />
                                    <Globe className="pointer-events-none absolute top-3 left-3 size-4 text-soft" />
                                </div>
                                <span className="text-sm font-semibold text-soft">
                                    .
                                </span>
                                <input
                                    type="text"
                                    value={baseDomain}
                                    onChange={(e) =>
                                        setBaseDomain(e.target.value)
                                    }
                                    placeholder="example.com"
                                    className="focus:ring-primary w-44 rounded-xl border-0 bg-surface px-3 py-2.5 font-mono text-sm text-ink ring-1 ring-line outline-none focus:ring-2"
                                    required
                                />
                            </div>
                        )}
                        <p className="mt-1 text-[11px] text-faint">
                            Live address:{' '}
                            <span className="font-mono font-semibold text-ink">
                                https://{resolvedDomain}
                            </span>
                        </p>
                    </div>

                    {/* Database Engine Selector (for tools that offer DB choices like WordPress and n8n) */}
                    {currentApp.availableDbs && (
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-soft">
                                Storage & Database Engine
                            </label>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {currentApp.availableDbs.map((dbOption) => (
                                    <button
                                        key={dbOption.id}
                                        type="button"
                                        onClick={() => setDatabase(dbOption.id)}
                                        className={`flex flex-col rounded-xl p-2.5 text-left ring-1 transition ${
                                            database === dbOption.id
                                                ? 'bg-ok-tint text-ink ring-ok/30 dark:bg-emerald-500/10 dark:ring-emerald-500/50'
                                                : 'bg-badge/40 text-soft ring-line/70 hover:bg-badge hover:text-ink'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-semibold">
                                                {dbOption.label}
                                            </span>
                                            {database === dbOption.id && (
                                                <Check className="size-3.5 text-ok dark:text-emerald-400" />
                                            )}
                                        </div>
                                        <span className="mt-0.5 text-[10px] text-faint">
                                            {dbOption.desc}
                                        </span>
                                    </button>
                                ))}
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
                                onChange={(e) => setAdminEmail(e.target.value)}
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
                                <span>Connect Stalwart Mail Relay (SMTP)</span>
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
                                    Connect Zitadel Single Sign-On (OIDC)
                                </span>
                            </label>
                        </div>
                    </div>

                    {/* Modal Footer Actions */}
                    <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-line pt-4">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={onClose}
                        >
                            <X className="size-3.5" />
                            <span>Cancel</span>
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            disabled={submitting || readyServers.length === 0}
                        >
                            <Rocket className="size-3.5" />
                            <span>
                                {submitting
                                    ? 'Deploying…'
                                    : `Launch ${currentApp.name}`}
                            </span>
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
