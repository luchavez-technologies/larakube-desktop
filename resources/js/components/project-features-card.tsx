import { useState } from 'react';
import { router } from '@inertiajs/react';
import {
    Plus,
    X,
    Sparkles,
    Layers,
    Trash2,
    XCircle,
    Cpu,
    Radio,
    Clock,
    Flame,
    Bot,
    Search,
    RotateCw,
    Save,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import { up } from '@/routes/projects';
import { cn } from '@/lib/utils';
import type { PodInfo, Project, ProjectEnvironment } from '@/types/larakube';

type FeatureDefinition = {
    id: string;
    label: string;
    description: string;
    icon: typeof Layers;
};

const AVAILABLE_FEATURES: FeatureDefinition[] = [
    {
        id: 'queues',
        label: 'Queues',
        description: 'Standard background queue worker pod',
        icon: Cpu,
    },
    {
        id: 'horizon',
        label: 'Horizon',
        description: 'Redis queue supervisor & real-time dashboard',
        icon: Layers,
    },
    {
        id: 'reverb',
        label: 'Reverb',
        description: 'WebSocket server for real-time events',
        icon: Radio,
    },
    {
        id: 'scheduler',
        label: 'Scheduler',
        description: 'Automated cron runner (artisan schedule:run)',
        icon: Clock,
    },
    {
        id: 'ssr',
        label: 'Inertia SSR',
        description: 'Node server-side rendering daemon',
        icon: Flame,
    },
    {
        id: 'ai',
        label: 'Laravel AI',
        description: 'LLM agent integration runner',
        icon: Bot,
    },
    {
        id: 'scout',
        label: 'Scout',
        description: 'Full-text search engine integration',
        icon: Search,
    },
];

export default function ProjectFeaturesCard({
    project,
    currentEnv,
    pods = [],
}: {
    project: Project;
    currentEnv: ProjectEnvironment;
    pods?: PodInfo[];
}) {
    const isLaravel =
        project.framework === 'laravel' ||
        project.framework === null ||
        project.framework === undefined;

    const [submitting, setSubmitting] = useState(false);
    const [rebuilding, setRebuilding] = useState(false);
    const [reloading, setReloading] = useState(false);
    const [featureToAdd, setFeatureToAdd] = useState<FeatureDefinition | null>(
        null,
    );
    const [featureToRemove, setFeatureToRemove] =
        useState<FeatureDefinition | null>(null);

    // Active features from project blueprint or environment
    const activeFeatureIds = currentEnv.features ?? project.features ?? [];

    const activeFeatures = AVAILABLE_FEATURES.filter((f) =>
        activeFeatureIds.includes(f.id),
    );

    // Any unlisted strings in activeFeatureIds that aren't in AVAILABLE_FEATURES
    const customFeatureIds = activeFeatureIds.filter(
        (id) => !AVAILABLE_FEATURES.some((f) => f.id === id),
    );

    // Filter inactive features, applying mutex between Horizon and Queues
    const inactiveFeatures = AVAILABLE_FEATURES.filter((f) => {
        if (activeFeatureIds.includes(f.id)) return false;

        // Smart Queue Mutex: hide Queues if Horizon is active, and vice versa
        if (f.id === 'queues' && activeFeatureIds.includes('horizon')) {
            return false;
        }
        if (f.id === 'horizon' && activeFeatureIds.includes('queues')) {
            return false;
        }

        return true;
    });

    const getFeaturePodInfo = (featureId: string) => {
        const pod = pods.find((p) => {
            const name = p.name.toLowerCase();
            const component = p.component.toLowerCase();
            return (
                component === featureId ||
                (featureId === 'horizon' && name.includes('horizon')) ||
                (featureId === 'queues' &&
                    (name.includes('queues') ||
                        name.includes('worker') ||
                        component === 'queues')) ||
                (featureId === 'reverb' && name.includes('reverb')) ||
                (featureId === 'scheduler' && name.includes('scheduler')) ||
                (featureId === 'ssr' &&
                    (name.includes('ssr') ||
                        name.includes('node-ssr') ||
                        component === 'ssr')) ||
                (featureId === 'octane' &&
                    (name.includes('web') || component === 'web')) ||
                name.includes(featureId)
            );
        });

        if (!pod) {
            return {
                state: 'configured' as const,
                label: '○ Configured (Needs Up)',
            };
        }

        const isRunning =
            pod.statusTone === 'ok' &&
            (pod.statusText?.toLowerCase() === 'running' ||
                pod.phase?.toLowerCase() === 'running');

        if (isRunning) {
            return { state: 'running' as const, label: '● Running', pod };
        }

        const isFailing =
            pod.statusTone === 'bad' ||
            pod.statusTone === 'warn' ||
            pod.statusText?.toLowerCase().includes('crash') ||
            pod.statusText?.toLowerCase().includes('backoff') ||
            pod.statusText?.toLowerCase().includes('error');

        if (isFailing) {
            return {
                state: 'failing' as const,
                label: `● ${pod.statusText || 'Failing'}`,
                pod,
            };
        }

        return {
            state: 'pending' as const,
            label: `○ ${pod.statusText || 'Pending'}`,
            pod,
        };
    };

    const handleConfirmAdd = () => {
        if (!featureToAdd || submitting) return;

        setSubmitting(true);
        router.post(
            `/projects/${project.id}/features/add`,
            {
                feature: featureToAdd.id,
                environment: currentEnv.name,
            },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => {
                    setSubmitting(false);
                    setFeatureToAdd(null);
                },
            },
        );
    };

    const handleConfirmRemove = () => {
        if (!featureToRemove || submitting) return;

        setSubmitting(true);
        router.post(
            `/projects/${project.id}/features/remove`,
            {
                feature: featureToRemove.id,
                environment: currentEnv.name,
            },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => {
                    setSubmitting(false);
                    setFeatureToRemove(null);
                },
            },
        );
    };

    const hasReloadableFeatures =
        activeFeatureIds.some((id) =>
            ['horizon', 'queues', 'octane'].includes(id),
        ) || project.serverVariation === 'frankenphp';

    const handleRebuild = () => {
        setRebuilding(true);
        router.post(
            up(project.id).url,
            { environment: currentEnv.name },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => setRebuilding(false),
            },
        );
    };

    const handleReload = () => {
        setReloading(true);
        router.post(
            `/projects/${project.id}/reload`,
            { environment: currentEnv.name },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => setReloading(false),
            },
        );
    };

    if (!isLaravel) {
        return null;
    }

    return (
        <Card
            label="Workload Features & Workers"
            action={
                <span className="font-mono text-[11px] text-soft">
                    {activeFeatureIds.length} configured
                </span>
            }
        >
            <div className="space-y-4">
                {/* Active Features */}
                <div>
                    <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-semibold text-ink">
                            Active Features
                        </span>
                    </div>

                    {activeFeatureIds.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-line bg-paper/30 p-3 text-center text-xs text-soft">
                            No workload worker features configured yet. Click a
                            preset below to add one.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                            {activeFeatures.map((feature) => {
                                const Icon = feature.icon;
                                const podStatus = getFeaturePodInfo(feature.id);
                                return (
                                    <div
                                        key={feature.id}
                                        className="flex items-start justify-between gap-2.5 rounded-xl border border-line bg-surface p-2.5 shadow-2xs"
                                    >
                                        <div className="flex min-w-0 items-start gap-2.5">
                                            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                                                <Icon className="size-3.5" />
                                            </span>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-xs font-semibold text-ink">
                                                        {feature.label}
                                                    </span>
                                                    {podStatus.state ===
                                                        'running' && (
                                                        <span className="py-0.2 inline-flex items-center gap-1 rounded bg-ok-tint px-1.5 font-mono text-[10px] font-medium text-ok dark:bg-emerald-500/15 dark:text-emerald-400">
                                                            {podStatus.label}
                                                        </span>
                                                    )}
                                                    {podStatus.state ===
                                                        'failing' && (
                                                        <span className="py-0.2 inline-flex items-center gap-1 rounded bg-accent-tint px-1.5 font-mono text-[10px] font-medium text-accent">
                                                            {podStatus.label}
                                                        </span>
                                                    )}
                                                    {(podStatus.state ===
                                                        'configured' ||
                                                        podStatus.state ===
                                                            'pending') && (
                                                        <span className="py-0.2 inline-flex items-center gap-1 rounded bg-line/60 px-1.5 font-mono text-[10px] text-soft">
                                                            {podStatus.label}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="truncate text-[11px] leading-tight text-soft">
                                                    {feature.description}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            disabled={submitting}
                                            onClick={() =>
                                                setFeatureToRemove(feature)
                                            }
                                            className="rounded p-1 text-soft transition hover:bg-accent-tint hover:text-accent disabled:opacity-50"
                                            title={`Remove ${feature.label}`}
                                        >
                                            <X className="size-3.5" />
                                        </button>
                                    </div>
                                );
                            })}

                            {customFeatureIds.map((id) => {
                                const podStatus = getFeaturePodInfo(id);
                                return (
                                    <div
                                        key={id}
                                        className="flex items-center justify-between gap-2.5 rounded-xl border border-line bg-surface p-2.5 shadow-2xs"
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-xs font-semibold text-ink">
                                                {id}
                                            </span>
                                            {podStatus.state === 'running' && (
                                                <span className="py-0.2 inline-flex items-center gap-1 rounded bg-ok-tint px-1.5 font-mono text-[10px] font-medium text-ok dark:bg-emerald-500/15 dark:text-emerald-400">
                                                    {podStatus.label}
                                                </span>
                                            )}
                                            {podStatus.state === 'failing' && (
                                                <span className="py-0.2 inline-flex items-center gap-1 rounded bg-accent-tint px-1.5 font-mono text-[10px] font-medium text-accent">
                                                    {podStatus.label}
                                                </span>
                                            )}
                                            {(podStatus.state ===
                                                'configured' ||
                                                podStatus.state ===
                                                    'pending') && (
                                                <span className="py-0.2 inline-flex items-center gap-1 rounded bg-line/60 px-1.5 font-mono text-[10px] text-soft">
                                                    {podStatus.label}
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            disabled={submitting}
                                            onClick={() =>
                                                setFeatureToRemove({
                                                    id,
                                                    label: id,
                                                    description:
                                                        'Custom feature workload',
                                                    icon: Layers,
                                                })
                                            }
                                            className="rounded p-1 text-soft transition hover:bg-accent-tint hover:text-accent disabled:opacity-50"
                                            title={`Remove ${id}`}
                                        >
                                            <X className="size-3.5" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Quick Add Presets */}
                {inactiveFeatures.length > 0 && (
                    <div>
                        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink">
                            <Sparkles className="size-3.5 text-brand" />
                            <span>Quick Add Presets</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {inactiveFeatures.map((feature) => (
                                <button
                                    key={feature.id}
                                    type="button"
                                    disabled={submitting}
                                    onClick={() => setFeatureToAdd(feature)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line bg-paper/60 px-2.5 py-1 text-xs font-medium text-ink transition hover:border-brand/40 hover:bg-brand/5 hover:text-brand disabled:opacity-50"
                                    title={`Add ${feature.label}: ${feature.description}`}
                                >
                                    <Plus className="size-3 text-soft" />
                                    <span>{feature.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Sync notice & Rebuild action */}
                <div className="flex flex-col gap-2 rounded-xl border border-line bg-paper/50 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[11px] leading-relaxed text-soft">
                        Workload manifests are auto-healed on save. Run Rebuild
                        / Up to start or update pods in your cluster.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        {hasReloadableFeatures && (
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={reloading}
                                onClick={handleReload}
                                className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
                                title="Gracefully reload Horizon, queue workers, and Octane without rebuilding images (larakube reload)"
                            >
                                <RotateCw
                                    className={cn(
                                        'size-3.5 text-brand',
                                        reloading && 'animate-spin',
                                    )}
                                />
                                <span>
                                    {reloading
                                        ? 'Reloading…'
                                        : 'Reload Workers'}
                                </span>
                            </Button>
                        )}
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={rebuilding}
                            onClick={handleRebuild}
                            className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
                        >
                            <RotateCw
                                className={cn(
                                    'size-3.5 text-brand',
                                    rebuilding && 'animate-spin',
                                )}
                            />
                            <span>
                                {rebuilding
                                    ? 'Rebuilding…'
                                    : 'Rebuild / Up Project'}
                            </span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* Confirmation Modal for Adding Feature */}
            {featureToAdd && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
                    <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
                        <div className="flex items-start gap-3.5">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand ring-1 ring-brand/20">
                                <Plus className="size-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-base font-semibold text-ink">
                                    Add {featureToAdd.label} Workload?
                                </h3>
                                <p className="mt-1.5 text-xs leading-relaxed text-soft">
                                    Adding {featureToAdd.label} will update your
                                    blueprint and auto-heal its Kubernetes
                                    deployment manifest.
                                </p>
                                <div className="mt-3 rounded-lg border border-warn/30 bg-warn-tint/60 p-2.5 text-xs font-medium text-ink">
                                    A project Rebuild / Up is needed for the new
                                    workload pod to start running.
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex items-center justify-end gap-2.5">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={submitting}
                                onClick={() => setFeatureToAdd(null)}
                                className="gap-1.5 text-xs"
                            >
                                <XCircle className="size-3.5" />
                                <span>Cancel</span>
                            </Button>
                            <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                disabled={submitting}
                                onClick={handleConfirmAdd}
                                className="gap-1.5 text-xs"
                            >
                                <Save
                                    className={cn(
                                        'size-3.5',
                                        submitting && 'animate-spin',
                                    )}
                                />
                                <span>
                                    {submitting ? 'Saving…' : 'Add & Auto-Heal'}
                                </span>
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmation Modal for Removing Feature */}
            {featureToRemove && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
                    <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
                        <div className="flex items-start gap-3.5">
                            <div className="bg-danger/10 text-danger ring-danger/20 flex size-10 shrink-0 items-center justify-center rounded-xl ring-1">
                                <Trash2 className="size-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-base font-semibold text-ink">
                                    Remove {featureToRemove.label}?
                                </h3>
                                <p className="mt-1.5 text-xs leading-relaxed text-soft">
                                    This removes the {featureToRemove.label}{' '}
                                    workload from your project configuration and
                                    prunes its Kubernetes deployment manifest.
                                </p>
                                <div className="mt-3 rounded-lg border border-warn/30 bg-warn-tint/60 p-2.5 text-xs font-medium text-ink">
                                    Run Rebuild / Up after removing to terminate
                                    any active pods in the cluster.
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex items-center justify-end gap-2.5">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={submitting}
                                onClick={() => setFeatureToRemove(null)}
                                className="gap-1.5 text-xs"
                            >
                                <XCircle className="size-3.5" />
                                <span>Cancel</span>
                            </Button>
                            <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                disabled={submitting}
                                onClick={handleConfirmRemove}
                                className="gap-1.5 text-xs"
                            >
                                <Trash2
                                    className={cn(
                                        'size-3.5',
                                        submitting && 'animate-spin',
                                    )}
                                />
                                <span>
                                    {submitting
                                        ? 'Removing…'
                                        : 'Remove & Auto-Heal'}
                                </span>
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
}
