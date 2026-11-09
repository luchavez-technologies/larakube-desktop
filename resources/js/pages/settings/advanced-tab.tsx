import { Deferred, router } from '@inertiajs/react';
import type { InertiaFormProps } from '@inertiajs/react';
import { AlertTriangle, Eye, EyeOff, RotateCw } from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import SelectMenu from '@/components/select-menu';
import type { SettingsForm } from './types';

type AdvancedTabProps = {
    form: InertiaFormProps<SettingsForm>;
    cloudProviders: Record<string, string>;
    serverNames?: string[] | null;
    projectGroupNames: string[];
    projectPaths: { path: string; label: string }[];
    toggleDemoModeNow: (nextDemoMode: boolean) => void;
    toggleHiddenServer: (name: string, hidden: boolean) => void;
    toggleHiddenProjectGroup: (name: string, hidden: boolean) => void;
    toggleHiddenProject: (path: string, hidden: boolean) => void;
    selectReleaseChannel: (channel: string) => void;
    saveAction: React.ReactNode;
    cliVersions?: {
        cli: string | null;
        cliDetectedChannel?: string | null;
        cliChannelMismatch?: boolean;
    };
};

export default function AdvancedTab({
    form,
    cloudProviders,
    serverNames,
    projectGroupNames,
    projectPaths,
    toggleDemoModeNow,
    toggleHiddenServer,
    toggleHiddenProjectGroup,
    toggleHiddenProject,
    selectReleaseChannel,
    saveAction,
    cliVersions,
}: AdvancedTabProps) {
    return (
        <div className="space-y-5">
            {/* Experimental */}
            <Card label="Experimental features" action={saveAction}>
                <label className="flex cursor-pointer items-start gap-3">
                    <input
                        type="checkbox"
                        checked={form.data.experimental}
                        onChange={(e) =>
                            form.setData('experimental', e.target.checked)
                        }
                        className="mt-0.5 size-4 rounded border-line text-brand accent-brand focus:ring-brand"
                    />
                    <div>
                        <span className="block text-xs font-medium text-ink">
                            Show experimental features
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-soft">
                            Adds features that are still being tried out to the
                            sidebar, such as Workspaces (a browser editor with
                            your repository on your own server). They can change
                            or break between releases. Save to apply.
                        </span>
                    </div>
                </label>
            </Card>

            {/* Demo Mode */}
            <Card
                label="Demo Mode"
                action={
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            size="xs"
                            variant={
                                form.data.demoMode ? 'primary' : 'secondary'
                            }
                            onClick={() =>
                                toggleDemoModeNow(!form.data.demoMode)
                            }
                            className="h-6 gap-1 px-2 text-[11px]"
                        >
                            {form.data.demoMode ? (
                                <EyeOff className="size-3" />
                            ) : (
                                <Eye className="size-3" />
                            )}
                            <span>
                                {form.data.demoMode
                                    ? 'Demo Mode On'
                                    : 'Enable Demo Mode'}
                            </span>
                        </Button>
                        {saveAction}
                    </div>
                }
            >
                <div className="space-y-3">
                    <label className="flex cursor-pointer items-start gap-3">
                        <input
                            type="checkbox"
                            checked={form.data.demoMode}
                            onChange={(e) =>
                                toggleDemoModeNow(e.target.checked)
                            }
                            className="mt-0.5 size-4 rounded border-line text-brand accent-brand focus:ring-brand"
                        />
                        <div>
                            <span className="block text-xs font-medium text-ink">
                                Mask sensitive values on screen & hide selected
                                servers
                            </span>
                            <span className="mt-0.5 block text-xs leading-relaxed text-soft">
                                For presenting on a shared screen. IP addresses
                                and account identifiers show as a placeholder
                                with a click-to-reveal button, and the servers
                                checked below drop out of Dashboard, Servers,
                                and service pages entirely. Reversible — turn it
                                off and everything comes back immediately.
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
                                                        e.target.checked,
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

                    <div className="border-t border-line/60 pt-3">
                        <span className="mb-1.5 block text-xs font-medium text-ink">
                            Hide these project groups while Demo Mode is on
                        </span>
                        {projectGroupNames.length === 0 ? (
                            <p className="text-xs text-soft">
                                No project groups yet.
                            </p>
                        ) : (
                            <div className="max-h-44 space-y-1.5 overflow-y-auto">
                                {projectGroupNames.map((name) => (
                                    <label
                                        key={name}
                                        className="flex cursor-pointer items-center gap-2.5 text-xs"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={form.data.demoHiddenProjectGroups.includes(
                                                name,
                                            )}
                                            onChange={(e) =>
                                                toggleHiddenProjectGroup(
                                                    name,
                                                    e.target.checked,
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
                    </div>

                    <div className="border-t border-line/60 pt-3">
                        <span className="mb-1.5 block text-xs font-medium text-ink">
                            Hide these projects while Demo Mode is on
                        </span>
                        {projectPaths.length === 0 ? (
                            <p className="text-xs text-soft">
                                No projects yet.
                            </p>
                        ) : (
                            <div className="max-h-44 space-y-1.5 overflow-y-auto">
                                {projectPaths.map(({ path, label }) => (
                                    <label
                                        key={path}
                                        className="flex cursor-pointer items-center gap-2.5 text-xs"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={form.data.demoHiddenProjects.includes(
                                                path,
                                            )}
                                            onChange={(e) =>
                                                toggleHiddenProject(
                                                    path,
                                                    e.target.checked,
                                                )
                                            }
                                            className="size-3.5 rounded border-line text-brand accent-brand focus:ring-brand"
                                        />
                                        <span className="font-mono text-ink">
                                            {label}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </Card>

            {/* Cloud Providers */}
            <Card label="Default Cloud Provider" action={saveAction}>
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
                        Pre-selected on the Create Server page. Connecting
                        accounts and tokens for each provider happens there, or
                        from Setup's Cloud accounts card.
                    </p>
                </div>
            </Card>

            {/* Unified Release Channel */}
            <Card
                label="Release Channel (Desktop & CLI)"
                action={
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            size="xs"
                            variant="secondary"
                            onClick={() =>
                                router.post(
                                    '/settings/sync-cli',
                                    {},
                                    {
                                        preserveScroll: true,
                                        preserveState: true,
                                    },
                                )
                            }
                            className="h-6 gap-1 px-2 text-[11px]"
                            title="Re-sync CLI binary with the selected release channel"
                        >
                            <RotateCw className="size-3" />
                            <span>Sync CLI</span>
                        </Button>
                        {saveAction}
                    </div>
                }
            >
                <div className="space-y-3">
                    <p className="text-xs leading-relaxed text-soft">
                        Desktop and the LaraKube CLI are tightly coupled and
                        share a single unified release channel. Switching
                        channels updates the Desktop updater feed and
                        immediately syncs your local CLI binary in the
                        background so they never drift out of sync.
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                        <label className="text-xs font-medium text-ink">
                            Release Channel:
                        </label>
                        <SelectMenu
                            value={form.data.cliChannel}
                            triggerClassName="h-8 py-1.5 text-xs"
                            onChange={(value) => selectReleaseChannel(value)}
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
                    {cliVersions?.cliChannelMismatch && (
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                                <span>
                                    Installed CLI (
                                    <code className="font-mono font-semibold">
                                        {cliVersions.cli}
                                    </code>
                                    ) appears to be on the{' '}
                                    <strong className="font-semibold">
                                        {cliVersions.cliDetectedChannel}
                                    </strong>{' '}
                                    channel while your unified channel is set to{' '}
                                    <strong className="font-semibold">
                                        {form.data.cliChannel}
                                    </strong>
                                    .
                                </span>
                            </div>
                            <Button
                                type="button"
                                size="xs"
                                variant="secondary"
                                onClick={() =>
                                    router.post(
                                        '/settings/sync-cli',
                                        {},
                                        {
                                            preserveScroll: true,
                                            preserveState: true,
                                        },
                                    )
                                }
                            >
                                <RotateCw className="size-3" />
                                <span>Align CLI Now</span>
                            </Button>
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
}
