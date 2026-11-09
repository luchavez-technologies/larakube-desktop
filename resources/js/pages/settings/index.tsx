import { Head, router, useForm, usePage } from '@inertiajs/react';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import {
    AlertTriangle,
    Bot,
    Laptop,
    Layers,
    RotateCw,
    Save,
    Sliders,
} from 'lucide-react';
import Button from '@/components/button';
import PageHeader from '@/components/page-header';
import AdvancedTab from './advanced-tab';
import AiMcpTab from './ai-mcp-tab';
import DangerZoneTab from './danger-zone-tab';
import GeneralTab from './general-tab';
import KubernetesTab from './kubernetes-tab';
import type {
    SettingsForm,
    SettingsProps,
    SettingsTab,
    ThemeMode,
} from './types';
import UpdatesDiagnosticsTab from './updates-diagnostics-tab';

export default function SettingsIndex({
    settings,
    allowedTlds,
    cloudProviders,
    availableEditors = [],
    allEditors = [],
    contexts = [],
    currentContext = null,
    windows = false,
    wsl = null,
    serverNames,
    projectGroupNames = [],
    projectPaths = [],
}: SettingsProps) {
    const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
        if (typeof window !== 'undefined') {
            if (window.location.search.includes('action=updates')) {
                return 'updates-diagnostics';
            }
            if (window.location.search.includes('action=uninstall')) {
                return 'danger-zone';
            }
        }
        return 'general';
    });

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
        demoHiddenProjectGroups: settings.demoHiddenProjectGroups ?? [],
        demoHiddenProjects: settings.demoHiddenProjects ?? [],
        defaultEditor: settings.defaultEditor ?? 'vscode',
    });

    const { props: sharedProps } = usePage<{
        demoMode?: boolean;
        versions?: {
            desktop: string;
            cli: string | null;
            channel?: 'canary' | 'stable';
            cliDetectedChannel?: string | null;
            cliChannelMismatch?: boolean;
        };
    }>();

    useEffect(() => {
        if (typeof sharedProps.demoMode === 'boolean') {
            form.setData('demoMode', sharedProps.demoMode);
        }
    }, [sharedProps.demoMode]);

    const demoModeOnly = ['settings'];

    function toggleDemoModeNow(nextDemoMode: boolean) {
        form.setData('demoMode', nextDemoMode);
        router.post(
            '/settings/demo-mode',
            {
                demoMode: nextDemoMode,
                demoHiddenServers: form.data.demoHiddenServers,
                demoHiddenProjectGroups: form.data.demoHiddenProjectGroups,
                demoHiddenProjects: form.data.demoHiddenProjects,
            },
            { only: demoModeOnly, preserveScroll: true, preserveState: true },
        );
    }

    function toggleHiddenServer(name: string, hidden: boolean) {
        const nextHidden = hidden
            ? [...form.data.demoHiddenServers, name]
            : form.data.demoHiddenServers.filter((n) => n !== name);
        form.setData('demoHiddenServers', nextHidden);
        router.post(
            '/settings/demo-mode',
            {
                demoMode: form.data.demoMode,
                demoHiddenServers: nextHidden,
                demoHiddenProjectGroups: form.data.demoHiddenProjectGroups,
                demoHiddenProjects: form.data.demoHiddenProjects,
            },
            { only: demoModeOnly, preserveScroll: true, preserveState: true },
        );
    }

    function toggleHiddenProjectGroup(name: string, hidden: boolean) {
        const nextHidden = hidden
            ? [...form.data.demoHiddenProjectGroups, name]
            : form.data.demoHiddenProjectGroups.filter((n) => n !== name);
        form.setData('demoHiddenProjectGroups', nextHidden);
        router.post(
            '/settings/demo-mode',
            {
                demoMode: form.data.demoMode,
                demoHiddenServers: form.data.demoHiddenServers,
                demoHiddenProjectGroups: nextHidden,
                demoHiddenProjects: form.data.demoHiddenProjects,
            },
            { only: demoModeOnly, preserveScroll: true, preserveState: true },
        );
    }

    function toggleHiddenProject(path: string, hidden: boolean) {
        const nextHidden = hidden
            ? [...form.data.demoHiddenProjects, path]
            : form.data.demoHiddenProjects.filter((p) => p !== path);
        form.setData('demoHiddenProjects', nextHidden);
        router.post(
            '/settings/demo-mode',
            {
                demoMode: form.data.demoMode,
                demoHiddenServers: form.data.demoHiddenServers,
                demoHiddenProjectGroups: form.data.demoHiddenProjectGroups,
                demoHiddenProjects: nextHidden,
            },
            { only: demoModeOnly, preserveScroll: true, preserveState: true },
        );
    }

    function selectReleaseChannel(channel: string) {
        form.setData('cliChannel', channel);
        router.post(
            '/settings',
            { ...form.data, cliChannel: channel },
            { preserveScroll: true, preserveState: true },
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
        form.post('/settings', { preserveScroll: true });
    }

    const saveAction = (
        <Button
            type="submit"
            size="xs"
            variant="secondary"
            disabled={form.processing}
            className="h-6 gap-1 px-2 text-[11px]"
            title="Save changes in this section"
        >
            <Save className="size-3" />
            <span>{form.processing ? 'Saving…' : 'Save'}</span>
        </Button>
    );

    const tabs: Array<{
        id: SettingsTab;
        label: string;
        icon: typeof Laptop;
    }> = [
        {
            id: 'general',
            label: 'General',
            icon: Laptop,
        },
        {
            id: 'ai-mcp',
            label: 'AI & MCP',
            icon: Bot,
        },
        {
            id: 'advanced',
            label: 'Advanced',
            icon: Sliders,
        },
        {
            id: 'kubernetes',
            label: 'Kubernetes',
            icon: Layers,
        },
        {
            id: 'updates-diagnostics',
            label: 'Updates & Diagnostics',
            icon: RotateCw,
        },
        {
            id: 'danger-zone',
            label: 'Danger Zone',
            icon: AlertTriangle,
        },
    ];

    return (
        <>
            <Head title="Settings" />
            <PageHeader
                title="Settings"
                meta={
                    <span>
                        Consolidated LaraKube CLI & Global Configuration
                    </span>
                }
            />

            <div className="space-y-6">
                {/* Tab Navigation (matching Mail's tab bar) */}
                <div className="flex border-b border-line">
                    <div className="flex flex-wrap gap-1">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;

                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`relative flex items-center gap-2 px-4 py-3 text-xs font-medium transition ${
                                        isActive
                                            ? 'text-brand'
                                            : tab.id === 'danger-zone'
                                              ? 'text-accent/80 hover:text-accent'
                                              : 'text-soft hover:text-ink'
                                    }`}
                                >
                                    <Icon className="size-4" />
                                    <span>{tab.label}</span>
                                    {isActive && (
                                        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-brand" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Tab Content */}
                <div className="max-w-4xl">
                    <form onSubmit={submit}>
                        {activeTab === 'general' && (
                            <GeneralTab
                                form={form}
                                allowedTlds={allowedTlds}
                                availableEditors={availableEditors}
                                allEditors={allEditors}
                                activeTheme={activeTheme}
                                selectTheme={selectTheme}
                                saveAction={saveAction}
                            />
                        )}

                        {activeTab === 'ai-mcp' && (
                            <AiMcpTab
                                mcpHttp={settings.mcpHttp}
                                detectedAgents={settings.detectedAgents}
                            />
                        )}

                        {activeTab === 'advanced' && (
                            <AdvancedTab
                                form={form}
                                cloudProviders={cloudProviders}
                                serverNames={serverNames}
                                projectGroupNames={projectGroupNames}
                                projectPaths={projectPaths}
                                toggleDemoModeNow={toggleDemoModeNow}
                                toggleHiddenServer={toggleHiddenServer}
                                toggleHiddenProjectGroup={
                                    toggleHiddenProjectGroup
                                }
                                toggleHiddenProject={toggleHiddenProject}
                                selectReleaseChannel={selectReleaseChannel}
                                saveAction={saveAction}
                                cliVersions={sharedProps.versions}
                            />
                        )}

                        {activeTab === 'kubernetes' && (
                            <KubernetesTab
                                contexts={contexts}
                                currentContext={currentContext}
                            />
                        )}

                        {activeTab === 'updates-diagnostics' && (
                            <UpdatesDiagnosticsTab
                                windows={windows}
                                wsl={wsl}
                            />
                        )}

                        {activeTab === 'danger-zone' && (
                            <DangerZoneTab windows={windows} />
                        )}
                    </form>
                </div>
            </div>
        </>
    );
}
