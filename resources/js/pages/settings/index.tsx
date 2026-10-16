import { Deferred, Form, router, useForm } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
    AlertTriangle,
    Archive,
    ArrowRightLeft,
    Check,
    ChevronDown,
    ChevronRight,
    Heart,
    Laptop,
    Layers,
    Moon,
    RotateCw,
    Save,
    Sun,
    Trash2,
    XCircle,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import SelectMenu from '@/components/select-menu';
import SponsorButton from '@/components/sponsor-button';
import { sendJson } from '@/lib/http';
import { forgetToolStatus } from '@/lib/tool-status';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/page-header';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import WslCheck, { type WslState } from '@/components/setup/wsl-check';

type AgentInfo = {
    name: string;
    installed: boolean;
    bridged: boolean;
};

type ThemeMode = 'system' | 'light' | 'dark';

type SettingsProps = {
    settings: {
        theme?: ThemeMode;
        localTld: string;
        email: string | null;
        defaultCloudProvider: string;
        shareToken: string | null;
        hideProjects?: boolean;
        experimental?: boolean;
        cliChannel?: string;
        demoMode?: boolean;
        demoHiddenServers?: string[];
        detectedAgents: Record<string, AgentInfo>;
    };
    allowedTlds: string[];
    cloudProviders: Record<string, string>;
    contexts?: string[];
    currentContext?: string | null;
    windows?: boolean;
    wsl?: WslState | null;
    serverNames?: string[] | null;
};

type SettingsForm = {
    theme?: ThemeMode;
    localTld: string;
    email: string;
    defaultCloudProvider: string;
    shareToken: string;
    hideProjects: boolean;
    experimental: boolean;
    cliChannel: string;
    demoMode: boolean;
    demoHiddenServers: string[];
};

const themeOptions: {
    id: ThemeMode;
    label: string;
    description: string;
    icon: typeof Laptop;
}[] = [
    {
        id: 'system',
        label: 'System',
        description: 'Sync with OS theme',
        icon: Laptop,
    },
    {
        id: 'light',
        label: 'Light',
        description: 'Crisp light mode',
        icon: Sun,
    },
    {
        id: 'dark',
        label: 'Dark',
        description: 'High-contrast dark mode',
        icon: Moon,
    },
];

export default function SettingsIndex({
    settings,
    allowedTlds,
    cloudProviders,
    contexts = [],
    currentContext = null,
    windows = false,
    wsl = null,
    serverNames,
}: SettingsProps) {
    const [activeTheme, setActiveTheme] = useState<ThemeMode>(
        settings.theme ?? 'system',
    );

    useEffect(() => {
        if (settings.theme) {
            setActiveTheme(settings.theme);
        }
    }, [settings.theme]);

    const form = useForm<SettingsForm>({
        theme: settings.theme ?? 'system',
        localTld: settings.localTld,
        email: settings.email ?? '',
        defaultCloudProvider: settings.defaultCloudProvider,
        shareToken: settings.shareToken ?? '',
        hideProjects: settings.hideProjects ?? false,
        experimental: settings.experimental ?? false,
        cliChannel: settings.cliChannel ?? 'canary',
        demoMode: settings.demoMode ?? false,
        demoHiddenServers: settings.demoHiddenServers ?? [],
    });

    function toggleHiddenServer(name: string, hidden: boolean) {
        form.setData(
            'demoHiddenServers',
            hidden
                ? [...form.data.demoHiddenServers, name]
                : form.data.demoHiddenServers.filter((n) => n !== name),
        );
    }

    function selectTheme(theme: ThemeMode) {
        setActiveTheme(theme);
        form.setData('theme', theme);

        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const isDark =
            theme === 'dark' || (theme === 'system' && media.matches);

        if (isDark) {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light');
        } else {
            document.documentElement.classList.remove('dark');
            if (theme === 'light') {
                document.documentElement.classList.add('light');
            } else {
                document.documentElement.classList.remove('light');
            }
        }

        router.post(
            '/settings/theme',
            { theme },
            { preserveScroll: true, preserveState: true },
        );
    }

    function submit(e: FormEvent) {
        e.preventDefault();
        form.post('/settings');
    }

    return (
        <AppLayout title="Settings">
            <PageHeader
                title="Settings"
                meta={
                    <span>
                        Consolidated LaraKube CLI & Global Configuration
                    </span>
                }
            />

            <UpdatesCard />
            <DiagnosticsCard />
            {windows && wsl?.state === 'stale' && <WslCheck wsl={wsl} />}
            {windows && <LinuxCard />}

            <div className="grid grid-cols-[1fr_360px] items-start gap-6">
                <form onSubmit={submit} className="space-y-5">
                    {/* Appearance & Theme */}
                    <Card label="Appearance & Theme">
                        <div className="space-y-3">
                            <p className="text-xs text-soft">
                                Choose your interface theme preference. System
                                automatically synchronizes with your operating
                                system's light or dark mode.
                            </p>
                            <div className="grid grid-cols-3 gap-3">
                                {themeOptions.map((option) => {
                                    const Icon = option.icon;
                                    const isSelected =
                                        activeTheme === option.id;
                                    return (
                                        <button
                                            key={option.id}
                                            type="button"
                                            onClick={() =>
                                                selectTheme(option.id)
                                            }
                                            className={cn(
                                                'group relative flex flex-col items-start gap-2.5 rounded-xl border p-3.5 text-left transition-all',
                                                isSelected
                                                    ? 'border-brand/60 bg-brand/[0.04] shadow-xs ring-1 ring-brand/40'
                                                    : 'hover:border-line-hover border-line bg-surface shadow-2xs hover:bg-paper/60',
                                            )}
                                        >
                                            <div className="flex w-full items-center justify-between">
                                                <div
                                                    className={cn(
                                                        'flex size-8 items-center justify-center rounded-lg border transition-colors',
                                                        isSelected
                                                            ? 'border-brand/30 bg-brand/10 text-brand'
                                                            : 'border-line bg-paper text-soft group-hover:text-ink',
                                                    )}
                                                >
                                                    <Icon className="size-4" />
                                                </div>
                                                {isSelected && (
                                                    <span className="flex size-5 items-center justify-center rounded-full bg-brand text-white">
                                                        <Check className="size-3 stroke-[2.5]" />
                                                    </span>
                                                )}
                                            </div>
                                            <div>
                                                <span
                                                    className={cn(
                                                        'block text-xs font-semibold',
                                                        isSelected
                                                            ? 'text-ink'
                                                            : 'text-soft group-hover:text-ink',
                                                    )}
                                                >
                                                    {option.label}
                                                </span>
                                                <span className="mt-0.5 block text-[11px] leading-relaxed text-soft">
                                                    {option.description}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </Card>

                    {/* Domain & Networking */}
                    <Card label="Local Domain & TLD">
                        <div className="space-y-3">
                            <p className="text-xs text-soft">
                                Sets the local vanity domain suffix used by the
                                LaraKube cluster and Traefik ingress.
                            </p>
                            <div className="flex items-center gap-3">
                                <label className="text-xs font-medium text-ink">
                                    Global Local TLD:
                                </label>
                                <SelectMenu
                                    value={form.data.localTld}
                                    triggerClassName="h-8 py-1.5 text-xs"
                                    onChange={(value) =>
                                        form.setData('localTld', value)
                                    }
                                    options={allowedTlds.map((tld) => ({
                                        value: tld,
                                        label: `.${tld}`,
                                    }))}
                                />
                            </div>
                            <p className="text-[11px] text-soft">
                                Note: Projects can override this individually in
                                their project settings.
                            </p>
                        </div>
                    </Card>

                    {/* Workspace Navigation */}
                    <Card label="Workspace Navigation Mode">
                        <div className="space-y-3">
                            <label className="flex cursor-pointer items-start gap-3">
                                <input
                                    type="checkbox"
                                    checked={form.data.hideProjects}
                                    onChange={(e) =>
                                        form.setData(
                                            'hideProjects',
                                            e.target.checked,
                                        )
                                    }
                                    className="mt-0.5 size-4 rounded border-line text-brand accent-brand focus:ring-brand"
                                />
                                <div>
                                    <span className="block text-xs font-medium text-ink">
                                        Hide Projects (Cluster Tools & Servers
                                        Only Mode)
                                    </span>
                                    <span className="mt-0.5 block text-xs leading-relaxed text-soft">
                                        Streamlines the sidebar and fleet
                                        dashboard for operators who exclusively
                                        manage servers, Ingress, DNS, and
                                        Cluster Tools (PocketBase, Vaultwarden,
                                        Uptime Kuma, Stalwart, etc.) without
                                        application repos.
                                    </span>
                                </div>
                            </label>

                            <div className="flex items-center justify-between gap-3 border-t border-line/60 pt-3">
                                <div>
                                    <span className="block text-xs font-medium text-ink">
                                        Welcome wizard
                                    </span>
                                    <span className="mt-0.5 block text-xs leading-relaxed text-soft">
                                        Redo the first-run questions (what
                                        you're using LaraKube Desktop for, which
                                        cloud providers you deploy to).
                                    </span>
                                </div>
                                <Form method="post" action="/onboarding/reset">
                                    {({ processing }) => (
                                        <Button
                                            type="submit"
                                            variant="secondary"
                                            size="sm"
                                            disabled={processing}
                                        >
                                            <RotateCw className="size-3.5" />
                                            <span>Redo onboarding</span>
                                        </Button>
                                    )}
                                </Form>
                            </div>
                        </div>
                    </Card>

                    {/* Experimental */}
                    <Card label="Experimental features">
                        <label className="flex cursor-pointer items-start gap-3">
                            <input
                                type="checkbox"
                                checked={form.data.experimental}
                                onChange={(e) =>
                                    form.setData(
                                        'experimental',
                                        e.target.checked,
                                    )
                                }
                                className="mt-0.5 size-4 rounded border-line text-brand accent-brand focus:ring-brand"
                            />
                            <div>
                                <span className="block text-xs font-medium text-ink">
                                    Show experimental features
                                </span>
                                <span className="mt-0.5 block text-xs leading-relaxed text-soft">
                                    Adds features that are still being tried out
                                    to the sidebar, such as Workspaces (a
                                    browser editor with your repository on your
                                    own server). They can change or break
                                    between releases. Save to apply.
                                </span>
                            </div>
                        </label>
                    </Card>

                    {/* Demo Mode */}
                    <Card label="Demo Mode">
                        <div className="space-y-3">
                            <label className="flex cursor-pointer items-start gap-3">
                                <input
                                    type="checkbox"
                                    checked={form.data.demoMode}
                                    onChange={(e) =>
                                        form.setData(
                                            'demoMode',
                                            e.target.checked,
                                        )
                                    }
                                    className="mt-0.5 size-4 rounded border-line text-brand accent-brand focus:ring-brand"
                                />
                                <div>
                                    <span className="block text-xs font-medium text-ink">
                                        Mask sensitive values on screen
                                    </span>
                                    <span className="mt-0.5 block text-xs leading-relaxed text-soft">
                                        For presenting on a shared screen. IP
                                        addresses and account identifiers show
                                        as a placeholder with a click-to-reveal
                                        button, and the servers checked below
                                        drop out of the Servers list entirely.
                                        Reversible — turn it off and everything
                                        comes back exactly as it was. Save to
                                        apply.
                                    </span>
                                </div>
                            </label>

                            <div className="border-t border-line/60 pt-3">
                                <span className="mb-1.5 block text-xs font-medium text-ink">
                                    Hide these servers while Demo Mode is on
                                </span>
                                <Deferred
                                    data="serverNames"
                                    fallback={
                                        <p className="text-xs text-soft">
                                            Asking the LaraKube CLI…
                                        </p>
                                    }
                                >
                                    {serverNames == null ? (
                                        <p className="text-xs text-soft">
                                            The LaraKube CLI isn't ready yet.
                                        </p>
                                    ) : serverNames.length === 0 ? (
                                        <p className="text-xs text-soft">
                                            No servers yet.
                                        </p>
                                    ) : (
                                        <div className="max-h-44 space-y-1.5 overflow-y-auto">
                                            {serverNames.map((name) => (
                                                <label
                                                    key={name}
                                                    className="flex cursor-pointer items-center gap-2.5 text-xs"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={form.data.demoHiddenServers.includes(
                                                            name,
                                                        )}
                                                        onChange={(e) =>
                                                            toggleHiddenServer(
                                                                name,
                                                                e.target
                                                                    .checked,
                                                            )
                                                        }
                                                        className="size-3.5 rounded border-line text-brand accent-brand focus:ring-brand"
                                                    />
                                                    <span className="font-mono text-ink">
                                                        {name}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </Deferred>
                            </div>
                        </div>
                    </Card>

                    {/* Cloud Providers */}
                    <Card label="Default Cloud Provider">
                        <div className="space-y-2">
                            <SelectMenu
                                value={form.data.defaultCloudProvider}
                                triggerClassName="h-8 py-1.5 text-xs"
                                onChange={(value) =>
                                    form.setData('defaultCloudProvider', value)
                                }
                                options={Object.entries(cloudProviders).map(
                                    ([slug, label]) => ({
                                        value: slug,
                                        label: `${label} (${slug})`,
                                    }),
                                )}
                            />
                            <p className="text-xs leading-relaxed text-soft">
                                Pre-selected on the Create Server page.
                                Connecting accounts and tokens for each provider
                                happens there, or from Setup's Cloud accounts
                                card.
                            </p>
                        </div>
                    </Card>

                    {/* LaraKube CLI Channel */}
                    <Card label="LaraKube CLI Release Channel">
                        <div className="space-y-3">
                            <p className="text-xs leading-relaxed text-soft">
                                Choose whether to receive early develop updates
                                (Canary) or official releases (Stable).
                            </p>
                            <div className="flex items-center gap-3">
                                <label className="text-xs font-medium text-ink">
                                    Release Channel:
                                </label>
                                <SelectMenu
                                    value={form.data.cliChannel}
                                    triggerClassName="h-8 py-1.5 text-xs"
                                    onChange={(value) =>
                                        form.setData('cliChannel', value)
                                    }
                                    options={[
                                        {
                                            value: 'canary',
                                            label: 'Canary (Pre-release develop builds · Recommended for testing)',
                                        },
                                        {
                                            value: 'stable',
                                            label: 'Stable (Official tagged releases)',
                                        },
                                    ]}
                                />
                            </div>
                        </div>
                    </Card>

                    {/* General / Let's Encrypt */}
                    <Card label="General & SSL">
                        <div className="space-y-3">
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-ink">
                                    Default Let's Encrypt Email
                                </label>
                                <input
                                    type="email"
                                    value={form.data.email}
                                    onChange={(e) =>
                                        form.setData('email', e.target.value)
                                    }
                                    placeholder="dev@example.com"
                                    className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand"
                                />
                            </div>
                        </div>
                    </Card>

                    <div>
                        <Button
                            type="submit"
                            size="md"
                            disabled={form.processing}
                        >
                            <Save className="size-4" />
                            <span>
                                {form.processing ? 'Saving…' : 'Save Settings'}
                            </span>
                        </Button>
                    </div>
                </form>

                <div className="flex flex-col gap-5">
                    {/* Kubernetes Contexts Card */}
                    <KubeContextsCard
                        contexts={contexts}
                        currentContext={currentContext}
                    />

                    {/* AI Agent Bridge Card */}
                    <Card label="AI Agent Bridge (MCP)">
                        <div className="space-y-3">
                            <p className="text-xs leading-relaxed text-soft">
                                LaraKube equips your AI assistants with an
                                official MCP server:
                            </p>
                            <div className="space-y-1.5 rounded-lg border border-line bg-paper p-2.5 text-[11px]">
                                <p className="font-semibold text-ink">
                                    🛠 larakube-cli
                                </p>
                                <p className="text-soft">
                                    Inspects architectural DNA, patches
                                    blueprints, and runs orchestration verbs.
                                </p>
                            </div>

                            <div className="border-t border-line pt-3">
                                <p className="mb-2 text-xs font-medium text-ink">
                                    Connect Your AI Agent
                                </p>
                                <div className="space-y-2">
                                    {Object.entries(
                                        settings.detectedAgents,
                                    ).map(([slug, agent]) => (
                                        <div
                                            key={slug}
                                            className="flex items-center justify-between gap-2 rounded-lg border border-line bg-paper px-2.5 py-2 text-xs"
                                        >
                                            <div className="min-w-0">
                                                <p className="truncate font-medium text-ink">
                                                    {agent.name}
                                                </p>
                                                <p className="text-[10px] text-soft">
                                                    {agent.bridged
                                                        ? 'MCP Configured'
                                                        : agent.installed
                                                          ? 'Installed'
                                                          : 'Not detected'}
                                                </p>
                                            </div>
                                            <Form
                                                method="post"
                                                action={`/settings/bridge/${slug}`}
                                            >
                                                {({ processing }) => (
                                                    <Button
                                                        type="submit"
                                                        variant="secondary"
                                                        size="sm"
                                                        disabled={processing}
                                                    >
                                                        {agent.bridged
                                                            ? 'Re-link'
                                                            : 'Connect'}
                                                    </Button>
                                                )}
                                            </Form>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Support LaraKube Card */}
                    <Card label="Support LaraKube">
                        <div className="space-y-3">
                            <p className="text-xs leading-relaxed text-soft">
                                LaraKube is open source software built and
                                maintained by{' '}
                                <span className="font-semibold text-ink">
                                    LuchTech
                                </span>
                                . Your sponsorship directly funds new cloud
                                drivers, security audits, and continuous
                                features.
                            </p>
                            <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3 py-2.5">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <Heart className="size-3.5 fill-[#ea4aaa]/20 text-[#ea4aaa]" />
                                        <span className="truncate text-xs font-medium text-ink">
                                            GitHub Sponsors
                                        </span>
                                    </div>
                                    <p className="mt-0.5 truncate text-[10px] text-soft">
                                        Support luchavez-technologies
                                    </p>
                                </div>
                                <SponsorButton />
                            </div>
                        </div>
                    </Card>

                    <UninstallCard windows={windows} />
                </div>
            </div>
        </AppLayout>
    );
}

function KubeContextsCard({
    contexts,
    currentContext,
}: {
    contexts: string[];
    currentContext: string | null;
}) {
    function switchContext(name: string) {
        router.post('/context/switch', { context: name });
    }

    function removeContext(name: string) {
        if (
            confirm(
                `Are you sure you want to remove context "${name}" from ~/.kube/config?`,
            )
        ) {
            router.post('/context/remove', { context: name });
        }
    }

    function backupContexts() {
        router.post('/context/backup');
    }

    return (
        <Card
            label="Kubernetes Contexts"
            action={
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={backupContexts}
                    title="Backup ~/.kube/config"
                >
                    <Archive className="size-3.5" />
                    <span>Backup</span>
                </Button>
            }
        >
            <div className="space-y-3">
                <p className="text-xs leading-relaxed text-soft">
                    Clusters found in your local kubeconfig. LaraKube
                    orchestrates against the active context.
                </p>

                {contexts.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-soft">
                        No Kubernetes contexts detected.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {contexts.map((c) => {
                            const isActive = c === currentContext;
                            return (
                                <div
                                    key={c}
                                    className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 text-xs transition-colors ${
                                        isActive
                                            ? 'border-brand/30 bg-brand/5 shadow-xs'
                                            : 'border-line bg-paper'
                                    }`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <Layers className="size-3.5 shrink-0 text-soft" />
                                            <span
                                                className="truncate font-mono text-[11px] font-medium text-ink"
                                                title={c}
                                            >
                                                {c}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-1.5">
                                        {isActive ? (
                                            <StatusPill tone="ok">
                                                Active
                                            </StatusPill>
                                        ) : (
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => switchContext(c)}
                                                title="Switch to this context"
                                            >
                                                <ArrowRightLeft className="size-3" />
                                                <span>Switch</span>
                                            </Button>
                                        )}

                                        {!isActive && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="text-danger hover:text-danger hover:bg-danger/10 px-2"
                                                onClick={() => removeContext(c)}
                                                title="Remove context"
                                            >
                                                <Trash2 className="size-3" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </Card>
    );
}

type UpdateStatus = {
    enabled: boolean;
    version: string;
    state: 'idle' | 'checking' | 'downloading' | 'ready' | 'current' | 'error';
    latest: string | null;
    percent: number;
    message: string | null;
};

function xsrf(): string {
    return decodeURIComponent(
        document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/)?.[1] ?? '',
    );
}

async function updatesCall(path: string, method: 'GET' | 'POST') {
    const response = await fetch(path, {
        method,
        headers: { Accept: 'application/json', 'X-XSRF-TOKEN': xsrf() },
    });

    return response.ok ? ((await response.json()) as UpdateStatus) : null;
}

function UpdatesCard() {
    const [status, setStatus] = useState<UpdateStatus | null>(null);
    const busy =
        status?.state === 'checking' || status?.state === 'downloading';

    useEffect(() => {
        let alive = true;
        const load = () =>
            updatesCall('/updates', 'GET').then(
                (next) => alive && setStatus(next),
            );

        void load();
        const timer = setInterval(load, busy ? 1500 : 10000);

        return () => {
            alive = false;
            clearInterval(timer);
        };
    }, [busy]);

    if (!status) {
        return null;
    }

    const line = !status.enabled
        ? 'Updates are off in this build.'
        : status.state === 'checking'
          ? 'Checking for updates…'
          : status.state === 'downloading'
            ? `Downloading ${status.latest ?? 'the update'}… ${status.percent}%`
            : status.state === 'ready'
              ? `${status.latest} is ready. Restart to finish updating.`
              : status.state === 'current'
                ? 'You have the latest version.'
                : status.state === 'error'
                  ? `The update check failed: ${status.message}`
                  : 'LaraKube Desktop also checks each time it opens.';

    return (
        <div className="mb-5">
            <Card
                label="App updates"
                action={
                    status.enabled ? (
                        status.state === 'ready' ? (
                            <Button
                                type="button"
                                onClick={() =>
                                    updatesCall('/updates/install', 'POST')
                                }
                            >
                                Restart to update
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                variant="secondary"
                                disabled={busy}
                                onClick={() =>
                                    updatesCall('/updates/check', 'POST').then(
                                        setStatus,
                                    )
                                }
                            >
                                Check for updates
                            </Button>
                        )
                    ) : undefined
                }
            >
                <p className="text-sm">
                    <span className="font-medium">
                        Version {status.version}
                    </span>
                    <span className="text-soft"> · {line}</span>
                </p>
            </Card>
        </div>
    );
}

function LinuxCard() {
    const [confirming, setConfirming] = useState(false);
    const [working, setWorking] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [dangerOpen, setDangerOpen] = useState(false);

    const update = async () => {
        setUpdating(true);
        setError(null);
        setUpdateSuccess(null);

        const result = await fetch('/setup/wsl/update', {
            method: 'POST',
            headers: { Accept: 'application/json', 'X-XSRF-TOKEN': xsrf() },
        })
            .then(
                (response) =>
                    response.json() as Promise<{
                        ok: boolean;
                        message: string;
                    }>,
            )
            .catch(() => ({
                ok: false,
                message: 'LaraKube Desktop could not reach itself. Try again.',
            }));

        setUpdating(false);

        if (!result.ok) {
            setError(result.message);

            return;
        }

        setUpdateSuccess(result.message);
        forgetToolStatus();
    };

    const reset = async () => {
        setWorking(true);
        setError(null);
        setUpdateSuccess(null);

        const result = await fetch('/setup/wsl/reset', {
            method: 'POST',
            headers: { Accept: 'application/json', 'X-XSRF-TOKEN': xsrf() },
        })
            .then(
                (response) =>
                    response.json() as Promise<{
                        ok: boolean;
                        message: string;
                    }>,
            )
            .catch(() => ({
                ok: false,
                message: 'LaraKube Desktop could not reach itself. Try again.',
            }));

        setWorking(false);

        if (!result.ok) {
            setError(result.message);

            return;
        }

        forgetToolStatus();
        router.visit('/readiness');
    };

    return (
        <div className="mb-5 space-y-3">
            <Card label="LaraKube Linux">
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4 text-sm">
                        <div>
                            <p className="font-medium text-ink">
                                Distro & Toolchain Update
                            </p>
                            <p className="mt-0.5 text-xs text-soft">
                                Updates the LaraKube CLI and cloud tools inside
                                your WSL distro. Preserves all your projects and
                                dotfiles in{' '}
                                <code className="font-mono text-ink">
                                    /home/larakube
                                </code>
                                .
                            </p>
                        </div>
                        <Button
                            type="button"
                            variant="secondary"
                            disabled={updating || working}
                            onClick={() => void update()}
                        >
                            <RotateCw
                                className={cn(
                                    'size-3.5',
                                    updating && 'animate-spin',
                                )}
                            />
                            <span>
                                {updating
                                    ? 'Updating…'
                                    : 'Update LaraKube Linux'}
                            </span>
                        </Button>
                    </div>

                    {updateSuccess && (
                        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <Check className="size-3.5" />
                            <span>{updateSuccess}</span>
                        </div>
                    )}

                    {error && !confirming && (
                        <p className="text-xs text-accent">{error}</p>
                    )}

                    {/* Collapsible Danger Zone */}
                    <div className="border-t border-line/70 pt-3.5">
                        <button
                            type="button"
                            onClick={() => setDangerOpen(!dangerOpen)}
                            className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-soft transition-colors hover:text-ink"
                        >
                            {dangerOpen ? (
                                <ChevronDown className="size-3.5" />
                            ) : (
                                <ChevronRight className="size-3.5" />
                            )}
                            <span>Danger Zone (Factory Reset)</span>
                        </button>

                        {dangerOpen && (
                            <div className="mt-3 rounded-xl border border-accent/20 bg-accent/[0.03] p-4 text-sm">
                                {confirming ? (
                                    <div className="space-y-3">
                                        <div className="flex items-start gap-2 text-accent">
                                            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                                            <div>
                                                <p className="text-xs font-semibold">
                                                    Factory Reset Confirmation
                                                </p>
                                                <p className="mt-1 text-xs text-soft">
                                                    This deletes the{' '}
                                                    <code className="font-mono text-ink">
                                                        larakube-ubuntu
                                                    </code>{' '}
                                                    WSL distro. As a safety
                                                    guarantee, your projects
                                                    will automatically be backed
                                                    up to your Windows{' '}
                                                    <code className="font-mono text-ink">
                                                        %LOCALAPPDATA%\LaraKube\backups\
                                                    </code>{' '}
                                                    directory before
                                                    unregistering.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 pt-1">
                                            <Button
                                                type="button"
                                                variant="danger"
                                                disabled={working}
                                                onClick={() => void reset()}
                                            >
                                                <Trash2 className="size-3.5" />
                                                <span>
                                                    {working
                                                        ? 'Resetting…'
                                                        : 'Delete and reset'}
                                                </span>
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                disabled={working}
                                                onClick={() => {
                                                    setConfirming(false);
                                                    setError(null);
                                                }}
                                            >
                                                <XCircle className="size-3.5" />
                                                <span>Cancel</span>
                                            </Button>
                                        </div>
                                        {error && (
                                            <p className="text-xs text-accent">
                                                {error}
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <p className="text-xs font-semibold text-ink">
                                                Reset LaraKube Linux
                                            </p>
                                            <p className="mt-0.5 text-xs text-soft">
                                                Completely unregisters the
                                                distro to start over fresh.
                                                Automatically backs up existing
                                                projects first.
                                            </p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            onClick={() => setConfirming(true)}
                                        >
                                            <Trash2 className="size-3.5 text-accent" />
                                            <span>Reset LaraKube Linux…</span>
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
}

function DiagnosticsCard() {
    const [report, setReport] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        setLoading(true);
        const result = await sendJson<{ report: string }>(
            '/diagnostics',
            'GET',
        );
        setReport(
            result.ok
                ? result.data.report
                : 'Could not gather the details. Try again.',
        );
        setLoading(false);
    };

    return (
        <div className="mb-5">
            <Card
                label="Diagnostics"
                action={
                    report ? (
                        <div className="flex items-center gap-1">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                    void sendJson('/diagnostics/folder', 'POST')
                                }
                            >
                                Show log folder
                            </Button>
                            <CopyButton value={report} />
                        </div>
                    ) : (
                        <Button
                            type="button"
                            variant="secondary"
                            disabled={loading}
                            onClick={() => void load()}
                        >
                            {loading ? 'Gathering…' : 'Show diagnostics'}
                        </Button>
                    )
                }
            >
                {report ? (
                    <pre className="max-h-80 overflow-auto rounded-lg bg-term px-3 py-2 font-mono text-xs whitespace-pre-wrap text-term-bright">
                        {report}
                    </pre>
                ) : (
                    <p className="text-sm text-soft">
                        The details someone needs to help with a problem:
                        versions, LaraKube Linux, the CLI, the last failed runs
                        and the end of the app log. Passwords and tokens are
                        removed.
                    </p>
                )}
            </Card>
        </div>
    );
}

function UninstallCard({ windows }: { windows: boolean }) {
    const isDarwin = !windows;
    const [open, setOpen] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const [removeCli, setRemoveCli] = useState(true);
    const [removeShellPath, setRemoveShellPath] = useState(true);
    const [purgeClusterData, setPurgeClusterData] = useState(false);
    const [removeWsl, setRemoveWsl] = useState(windows);
    const [purgeAppData, setPurgeAppData] = useState(true);
    const [trashAppBundle, setTrashAppBundle] = useState(isDarwin);

    useEffect(() => {
        if (
            typeof window !== 'undefined' &&
            window.location.search.includes('action=uninstall')
        ) {
            setOpen(true);
        }
    }, []);

    const handleUninstall = async () => {
        setWorking(true);
        setError(null);
        try {
            const res = await sendJson<{ success: boolean; actions: string[] }>(
                '/uninstall',
                'POST',
                {
                    removeCli,
                    removeShellPath,
                    purgeClusterData,
                    removeWsl,
                    purgeAppData,
                    trashAppBundle,
                },
            );

            if (res.ok && res.data.success) {
                setSuccessMessage(
                    'Uninstallation complete. LaraKube Desktop is quitting…',
                );
            } else {
                setError(
                    res.data.message ??
                        'Uninstallation could not be completed.',
                );
                setWorking(false);
            }
        } catch (e: any) {
            setError(e?.message ?? 'Failed to execute uninstallation.');
            setWorking(false);
        }
    };

    return (
        <Card label="Danger Zone">
            <div className="space-y-3">
                <button
                    type="button"
                    onClick={() => setOpen(!open)}
                    className="flex w-full cursor-pointer items-center justify-between text-xs font-medium text-soft transition-colors hover:text-ink"
                >
                    <span className="flex items-center gap-1.5 font-semibold text-accent">
                        <AlertTriangle className="size-3.5" />
                        Uninstall LaraKube Desktop & Clean Up
                    </span>
                    {open ? (
                        <ChevronDown className="size-3.5" />
                    ) : (
                        <ChevronRight className="size-3.5" />
                    )}
                </button>

                {open && (
                    <div className="mt-2 space-y-4 rounded-xl border border-accent/20 bg-accent/[0.03] p-4 text-xs">
                        <p className="leading-relaxed text-soft">
                            Configure what components are removed from this
                            computer. You can choose to preserve CLI tools if
                            you wish to continue using them from your terminal.
                        </p>

                        <div className="space-y-2.5">
                            <label className="flex cursor-pointer items-start gap-2.5">
                                <input
                                    type="checkbox"
                                    checked={removeCli}
                                    onChange={(e) => {
                                        setRemoveCli(e.target.checked);
                                        if (!e.target.checked) {
                                            setRemoveShellPath(false);
                                        }
                                    }}
                                    className="mt-0.5 size-4 rounded border-line text-accent accent-accent focus:ring-accent"
                                />
                                <div>
                                    <span className="font-medium text-ink">
                                        Remove LaraKube CLI & Companion Tools
                                    </span>
                                    <span className="block text-[11px] text-soft">
                                        Deletes{' '}
                                        <code className="font-mono text-ink">
                                            ~/.larakube/bin
                                        </code>{' '}
                                        (contains larakube, kubectl, tofu, k9s,
                                        tea, gh).
                                    </span>
                                </div>
                            </label>

                            <label className="flex cursor-pointer items-start gap-2.5">
                                <input
                                    type="checkbox"
                                    checked={removeShellPath}
                                    onChange={(e) =>
                                        setRemoveShellPath(e.target.checked)
                                    }
                                    className="mt-0.5 size-4 rounded border-line text-accent accent-accent focus:ring-accent"
                                />
                                <div>
                                    <span className="font-medium text-ink">
                                        Remove PATH Export from Shell Profiles
                                    </span>
                                    <span className="block text-[11px] text-soft">
                                        Cleans PATH lines from{' '}
                                        <code className="font-mono text-ink">
                                            ~/.zshrc
                                        </code>
                                        ,{' '}
                                        <code className="font-mono text-ink">
                                            ~/.bashrc
                                        </code>
                                        , and{' '}
                                        <code className="font-mono text-ink">
                                            ~/.profile
                                        </code>
                                        .
                                    </span>
                                </div>
                            </label>

                            <label className="flex cursor-pointer items-start gap-2.5">
                                <input
                                    type="checkbox"
                                    checked={purgeClusterData}
                                    onChange={(e) =>
                                        setPurgeClusterData(e.target.checked)
                                    }
                                    className="mt-0.5 size-4 rounded border-line text-accent accent-accent focus:ring-accent"
                                />
                                <div>
                                    <span className="font-medium text-ink">
                                        Purge Cluster Credentials & Local State
                                    </span>
                                    <span className="block text-[11px] text-amber-600 dark:text-amber-400">
                                        ⚠️ Deletes{' '}
                                        <code className="font-mono text-ink">
                                            ~/.larakube
                                        </code>{' '}
                                        (kubeconfigs, OpenTofu state, secrets).
                                        Leave unchecked to keep access to live
                                        cloud clusters.
                                    </span>
                                </div>
                            </label>

                            {windows && (
                                <label className="flex cursor-pointer items-start gap-2.5">
                                    <input
                                        type="checkbox"
                                        checked={removeWsl}
                                        onChange={(e) =>
                                            setRemoveWsl(e.target.checked)
                                        }
                                        className="mt-0.5 size-4 rounded border-line text-accent accent-accent focus:ring-accent"
                                    />
                                    <div>
                                        <span className="font-medium text-ink">
                                            Remove LaraKube Linux (WSL 2) Distro
                                        </span>
                                        <span className="block text-[11px] text-soft">
                                            Unregisters{' '}
                                            <code className="font-mono text-ink">
                                                larakube-ubuntu
                                            </code>{' '}
                                            to reclaim disk space. Projects are
                                            backed up to{' '}
                                            <code className="font-mono text-ink">
                                                %LOCALAPPDATA%\LaraKube\backups
                                            </code>{' '}
                                            first.
                                        </span>
                                    </div>
                                </label>
                            )}

                            <label className="flex cursor-pointer items-start gap-2.5">
                                <input
                                    type="checkbox"
                                    checked={purgeAppData}
                                    onChange={(e) =>
                                        setPurgeAppData(e.target.checked)
                                    }
                                    className="mt-0.5 size-4 rounded border-line text-accent accent-accent focus:ring-accent"
                                />
                                <div>
                                    <span className="font-medium text-ink">
                                        Purge Local Application Cache & Logs
                                    </span>
                                    <span className="block text-[11px] text-soft">
                                        Clears cached session files, logs, and
                                        internal desktop database.
                                    </span>
                                </div>
                            </label>

                            {isDarwin && (
                                <label className="flex cursor-pointer items-start gap-2.5">
                                    <input
                                        type="checkbox"
                                        checked={trashAppBundle}
                                        onChange={(e) =>
                                            setTrashAppBundle(e.target.checked)
                                        }
                                        className="mt-0.5 size-4 rounded border-line text-accent accent-accent focus:ring-accent"
                                    />
                                    <div>
                                        <span className="font-medium text-ink">
                                            Move LaraKube.app to macOS Trash
                                        </span>
                                        <span className="block text-[11px] text-soft">
                                            Moves{' '}
                                            <code className="font-mono text-ink">
                                                /Applications/LaraKube.app
                                            </code>{' '}
                                            to Trash and exits.
                                        </span>
                                    </div>
                                </label>
                            )}
                        </div>

                        {successMessage ? (
                            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 font-medium text-emerald-600 dark:text-emerald-400">
                                <Check className="size-4 shrink-0" />
                                <span>{successMessage}</span>
                            </div>
                        ) : confirming ? (
                            <div className="space-y-3 border-t border-accent/20 pt-2">
                                <div className="flex items-start gap-2 text-accent">
                                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                                    <div>
                                        <p className="font-semibold">
                                            Confirm Uninstallation
                                        </p>
                                        <p className="mt-0.5 text-[11px] text-soft">
                                            This will execute the selected
                                            cleanup actions and close LaraKube
                                            Desktop immediately. Are you sure
                                            you want to proceed?
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="danger"
                                        disabled={working}
                                        onClick={() => void handleUninstall()}
                                    >
                                        <Trash2 className="size-3.5" />
                                        <span>
                                            {working
                                                ? 'Uninstalling…'
                                                : 'Confirm & Uninstall'}
                                        </span>
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        disabled={working}
                                        onClick={() => {
                                            setConfirming(false);
                                            setError(null);
                                        }}
                                    >
                                        <XCircle className="size-3.5" />
                                        <span>Cancel</span>
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="border-t border-accent/20 pt-2">
                                <Button
                                    type="button"
                                    variant="danger"
                                    onClick={() => setConfirming(true)}
                                >
                                    <Trash2 className="size-3.5" />
                                    <span>Uninstall LaraKube Desktop…</span>
                                </Button>
                            </div>
                        )}

                        {error && (
                            <p className="text-xs text-accent">{error}</p>
                        )}
                    </div>
                )}
            </div>
        </Card>
    );
}
