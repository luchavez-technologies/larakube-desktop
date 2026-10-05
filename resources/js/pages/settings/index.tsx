import { Form, router, useForm } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Archive, ArrowRightLeft, Layers, Save, Trash2 } from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import PageHeader from '@/components/page-header';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';

type AgentInfo = {
    name: string;
    installed: boolean;
    bridged: boolean;
};

type SettingsProps = {
    settings: {
        localTld: string;
        email: string | null;
        aiProvider: string;
        defaultCloudProvider: string;
        hasDoToken: boolean;
        hasHetznerToken: boolean;
        shareToken: string | null;
        hideProjects?: boolean;
        experimental?: boolean;
        cliChannel?: string;
        detectedAgents: Record<string, AgentInfo>;
    };
    allowedTlds: string[];
    aiProviders: Record<string, string>;
    cloudProviders: Record<string, string>;
    contexts?: string[];
    currentContext?: string | null;
};

type SettingsForm = {
    localTld: string;
    email: string;
    aiProvider: string;
    aiKey: string;
    defaultCloudProvider: string;
    doToken: string;
    hetznerToken: string;
    shareToken: string;
    hideProjects: boolean;
    experimental: boolean;
    cliChannel: string;
};

export default function SettingsIndex({
    settings,
    allowedTlds,
    aiProviders,
    cloudProviders,
    contexts = [],
    currentContext = null,
}: SettingsProps) {
    const form = useForm<SettingsForm>({
        localTld: settings.localTld,
        email: settings.email ?? '',
        aiProvider: settings.aiProvider,
        aiKey: '',
        defaultCloudProvider: settings.defaultCloudProvider,
        doToken: '',
        hetznerToken: '',
        shareToken: settings.shareToken ?? '',
        hideProjects: settings.hideProjects ?? false,
        experimental: settings.experimental ?? false,
        cliChannel: settings.cliChannel ?? 'canary',
    });

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

            <div className="grid grid-cols-[1fr_360px] items-start gap-6">
                <form onSubmit={submit} className="space-y-5">
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
                                <select
                                    value={form.data.localTld}
                                    onChange={(e) =>
                                        form.setData('localTld', e.target.value)
                                    }
                                    className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink outline-none focus:ring-2 focus:ring-brand"
                                >
                                    {allowedTlds.map((tld) => (
                                        <option key={tld} value={tld}>
                                            .{tld}
                                        </option>
                                    ))}
                                </select>
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
                                    onChange={(e) => {
                                        form.setData(
                                            'hideProjects',
                                            e.target.checked,
                                        );
                                        localStorage.setItem(
                                            'larakube_hide_projects',
                                            String(e.target.checked),
                                        );
                                    }}
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

                    {/* Cloud Providers */}
                    <Card label="Cloud Providers & Tokens">
                        <div className="space-y-4">
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-ink">
                                    Default Cloud Provider
                                </label>
                                <select
                                    value={form.data.defaultCloudProvider}
                                    onChange={(e) =>
                                        form.setData(
                                            'defaultCloudProvider',
                                            e.target.value,
                                        )
                                    }
                                    className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink outline-none focus:ring-2 focus:ring-brand"
                                >
                                    {Object.entries(cloudProviders).map(
                                        ([slug, label]) => (
                                            <option key={slug} value={slug}>
                                                {label} ({slug})
                                            </option>
                                        ),
                                    )}
                                </select>
                            </div>

                            <div>
                                <div className="flex items-center justify-between">
                                    <label className="mb-1.5 block text-xs font-medium text-ink">
                                        DigitalOcean API Token
                                    </label>
                                    {settings.hasDoToken && (
                                        <StatusPill tone="ok">
                                            Configured
                                        </StatusPill>
                                    )}
                                </div>
                                <input
                                    type="password"
                                    value={form.data.doToken}
                                    onChange={(e) =>
                                        form.setData('doToken', e.target.value)
                                    }
                                    placeholder={
                                        settings.hasDoToken
                                            ? '••••••••••••••••••••••••'
                                            : 'dop_v1_...'
                                    }
                                    className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-brand"
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between">
                                    <label className="mb-1.5 block text-xs font-medium text-ink">
                                        Hetzner Cloud Token
                                    </label>
                                    {settings.hasHetznerToken && (
                                        <StatusPill tone="ok">
                                            Configured
                                        </StatusPill>
                                    )}
                                </div>
                                <input
                                    type="password"
                                    value={form.data.hetznerToken}
                                    onChange={(e) =>
                                        form.setData(
                                            'hetznerToken',
                                            e.target.value,
                                        )
                                    }
                                    placeholder={
                                        settings.hasHetznerToken
                                            ? '••••••••••••••••••••••••'
                                            : 'Token from Hetzner Console'
                                    }
                                    className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-brand"
                                />
                            </div>
                        </div>
                    </Card>

                    {/* AI Configuration */}
                    <Card label="AI Provider">
                        <div className="space-y-4">
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-ink">
                                    Preferred AI Provider
                                </label>
                                <select
                                    value={form.data.aiProvider}
                                    onChange={(e) =>
                                        form.setData(
                                            'aiProvider',
                                            e.target.value,
                                        )
                                    }
                                    className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink outline-none focus:ring-2 focus:ring-brand"
                                >
                                    {Object.entries(aiProviders).map(
                                        ([slug, label]) => (
                                            <option key={slug} value={slug}>
                                                {label}
                                            </option>
                                        ),
                                    )}
                                </select>
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-ink">
                                    API Key (Update key for selected provider)
                                </label>
                                <input
                                    type="password"
                                    value={form.data.aiKey}
                                    onChange={(e) =>
                                        form.setData('aiKey', e.target.value)
                                    }
                                    placeholder="sk-..."
                                    className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-brand"
                                />
                            </div>
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
                                <select
                                    value={form.data.cliChannel}
                                    onChange={(e) =>
                                        form.setData(
                                            'cliChannel',
                                            e.target.value,
                                        )
                                    }
                                    className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink outline-none focus:ring-2 focus:ring-brand"
                                >
                                    <option value="canary">
                                        Canary (Pre-release develop builds ·
                                        Recommended for testing)
                                    </option>
                                    <option value="stable">
                                        Stable (Official tagged releases)
                                    </option>
                                </select>
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
