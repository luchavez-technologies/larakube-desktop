import { useState } from 'react';
import { router } from '@inertiajs/react';
import {
    Plus,
    X,
    Sparkles,
    HeartPulse,
    Layers,
    Trash2,
    XCircle,
    Cpu,
    Radio,
    Clock,
    Flame,
    Bot,
    Search,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import { cn } from '@/lib/utils';
import type { Project, ProjectEnvironment } from '@/types/larakube';

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
}: {
    project: Project;
    currentEnv: ProjectEnvironment;
}) {
    const isLaravel =
        project.framework === 'laravel' ||
        project.framework === null ||
        project.framework === undefined;

    const [submitting, setSubmitting] = useState(false);
    const [featureToRemove, setFeatureToRemove] =
        useState<FeatureDefinition | null>(null);
    const [healing, setHealing] = useState(false);

    // Active features from project blueprint or environment
    const activeFeatureIds = currentEnv.features ?? project.features ?? [];

    const activeFeatures = AVAILABLE_FEATURES.filter((f) =>
        activeFeatureIds.includes(f.id),
    );

    // Any unlisted strings in activeFeatureIds that aren't in AVAILABLE_FEATURES
    const customFeatureIds = activeFeatureIds.filter(
        (id) => !AVAILABLE_FEATURES.some((f) => f.id === id),
    );

    const inactiveFeatures = AVAILABLE_FEATURES.filter(
        (f) => !activeFeatureIds.includes(f.id),
    );

    const handleAdd = (featureId: string) => {
        if (submitting) return;

        setSubmitting(true);
        router.post(
            `/projects/${project.id}/features/add`,
            { feature: featureId },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => setSubmitting(false),
            },
        );
    };

    const handleConfirmRemove = () => {
        if (!featureToRemove || submitting) return;

        setSubmitting(true);
        router.post(
            `/projects/${project.id}/features/remove`,
            { feature: featureToRemove.id },
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

    const handleHeal = () => {
        setHealing(true);
        router.post(
            `/projects/${project.id}/heal`,
            { environment: currentEnv.name },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => setHealing(false),
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
                    {activeFeatureIds.length} active
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
                                                <div className="text-xs font-semibold text-ink">
                                                    {feature.label}
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

                            {customFeatureIds.map((id) => (
                                <div
                                    key={id}
                                    className="flex items-center justify-between gap-2.5 rounded-xl border border-line bg-surface p-2.5 shadow-2xs"
                                >
                                    <div className="text-xs font-semibold text-ink">
                                        {id}
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
                            ))}
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
                                    onClick={() => handleAdd(feature.id)}
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

                {/* Sync notice */}
                <div className="flex flex-col gap-2 rounded-xl border border-line bg-paper/50 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[11px] leading-relaxed text-soft">
                        Modifying features updates Kubernetes deployment
                        manifests. Run Heal Infrastructure or Rebuild / Up to
                        apply.
                    </p>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={healing}
                        onClick={handleHeal}
                        className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
                    >
                        <HeartPulse
                            className={cn(
                                'size-3.5 text-brand',
                                healing && 'animate-spin',
                            )}
                        />
                        <span>
                            {healing ? 'Healing…' : 'Heal Infrastructure'}
                        </span>
                    </Button>
                </div>
            </div>

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
                                <p className="mt-1 text-xs leading-relaxed text-soft">
                                    This removes the {featureToRemove.label}{' '}
                                    workload from your project configuration.
                                    Its Kubernetes deployment will be pruned
                                    upon your next Heal or Up.
                                </p>
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
                                        : 'Remove Feature'}
                                </span>
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
}
