import { useState } from 'react';
import { router } from '@inertiajs/react';
import {
    Activity,
    Cpu,
    Layers,
    Minus,
    Plus,
    RotateCw,
    Sliders,
    X,
    Check,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import StatusPill from '@/components/status-pill';
import { replicas, autoscale, resources } from '@/routes/projects/scaling';
import type { Project, ProjectEnvironment } from '@/types/larakube';

const COMPONENT_LABELS: Record<string, { label: string; desc: string }> = {
    web: {
        label: 'Web Server',
        desc: 'HTTP request handling & Nginx/PHP workers',
    },
    horizon: {
        label: 'Horizon Worker',
        desc: 'Laravel Horizon queue manager & supervisor',
    },
    queues: { label: 'Queue Worker', desc: 'Background jobs & queue workers' },
    reverb: {
        label: 'Reverb WebSocket',
        desc: 'Real-time WebSocket connection server',
    },
    ssr: {
        label: 'SSR Server',
        desc: 'Server-side rendering runtime (Node.js)',
    },
    scheduler: { label: 'Scheduler', desc: 'Periodic cron task runner' },
};

const RESOURCE_TIERS = [
    {
        id: 'eco',
        name: 'Eco',
        req: '100m CPU · 128Mi RAM',
        limit: '250m CPU · 256Mi RAM',
        desc: 'Lightweight background workers or dev environments',
    },
    {
        id: 'standard',
        name: 'Standard',
        req: '250m CPU · 512Mi RAM',
        limit: '500m CPU · 1Gi RAM',
        desc: 'Recommended default for general production workloads',
    },
    {
        id: 'pro',
        name: 'Pro',
        req: '1.0 CPU · 2Gi RAM',
        limit: '2.0 CPU · 4Gi RAM',
        desc: 'High-throughput APIs, heavy queue processing, or SSR',
    },
];

export default function WorkloadScalingCard({
    project,
    activeEnv,
    activeEnvConfig,
}: {
    project: Project;
    activeEnv: string;
    activeEnvConfig: ProjectEnvironment;
}) {
    const components = activeEnvConfig.components ?? ['web'];
    const [submittingComponent, setSubmittingComponent] = useState<
        string | null
    >(null);

    // Modal states
    const [autoscaleModalComp, setAutoscaleModalComp] = useState<string | null>(
        null,
    );
    const [resourcesModalComp, setResourcesModalComp] = useState<string | null>(
        null,
    );

    function handleReplicaDelta(
        component: string,
        currentCount: number,
        delta: number,
    ) {
        const newCount = Math.max(0, currentCount + delta);
        setSubmittingComponent(component);
        router.post(
            replicas({ project: project.id }).url,
            {
                environment: activeEnv,
                component,
                count: newCount,
            },
            {
                preserveScroll: true,
                onFinish: () => setSubmittingComponent(null),
            },
        );
    }

    function handleResetReplicas(component: string) {
        setSubmittingComponent(component);
        router.post(
            replicas({ project: project.id }).url,
            {
                environment: activeEnv,
                component,
                reset: true,
            },
            {
                preserveScroll: true,
                onFinish: () => setSubmittingComponent(null),
            },
        );
    }

    return (
        <Card
            label={`Workload Scaling & Sizing · ${activeEnv.toUpperCase()}`}
            action={
                <div className="flex items-center gap-1.5 text-xs text-soft">
                    <Activity className="size-3.5 text-soft" />
                    <span>
                        {components.length} Scalable{' '}
                        {components.length === 1 ? 'Workload' : 'Workloads'}
                    </span>
                </div>
            }
        >
            <div className="divide-y divide-line">
                {components.map((comp) => {
                    const meta = COMPONENT_LABELS[comp] ?? {
                        label: comp,
                        desc: 'Application component',
                    };
                    const currentReplicas =
                        activeEnvConfig.replicas?.[comp] ?? 1;
                    const autoscaleConfig = activeEnvConfig.autoscale?.[comp];
                    const isAutoscaled = Boolean(autoscaleConfig);
                    const compResources = activeEnvConfig.resources?.[comp];
                    const isSubmitting = submittingComponent === comp;

                    return (
                        <div
                            key={comp}
                            className="flex flex-col gap-3 py-3 first:pt-1 last:pb-1"
                        >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <Layers className="size-4 text-ink" />
                                        <span className="text-sm font-semibold text-ink">
                                            {meta.label}
                                        </span>
                                        <span className="font-mono text-xs text-soft">
                                            ({comp})
                                        </span>
                                        {isAutoscaled ? (
                                            <StatusPill tone="ok">
                                                HPA: {autoscaleConfig?.min}..
                                                {autoscaleConfig?.max} @{' '}
                                                {autoscaleConfig?.cpu}%
                                            </StatusPill>
                                        ) : (
                                            <StatusPill tone="muted">
                                                {currentReplicas}{' '}
                                                {currentReplicas === 1
                                                    ? 'pod'
                                                    : 'pods'}
                                            </StatusPill>
                                        )}
                                    </div>
                                    <div className="text-xs text-soft">
                                        {meta.desc}
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    {/* Replica Stepper when not autoscaled */}
                                    {!isAutoscaled ? (
                                        <div className="flex items-center rounded-lg border border-line bg-surface p-0.5 shadow-xs">
                                            <button
                                                type="button"
                                                disabled={
                                                    isSubmitting ||
                                                    currentReplicas <= 0
                                                }
                                                onClick={() =>
                                                    handleReplicaDelta(
                                                        comp,
                                                        currentReplicas,
                                                        -1,
                                                    )
                                                }
                                                className="flex size-7 items-center justify-center rounded-md text-soft hover:bg-badge hover:text-ink disabled:opacity-30"
                                                title="Decrease replicas"
                                            >
                                                <Minus className="size-3.5" />
                                            </button>
                                            <span className="min-w-8 text-center font-mono text-xs font-semibold text-ink">
                                                {currentReplicas}
                                            </span>
                                            <button
                                                type="button"
                                                disabled={isSubmitting}
                                                onClick={() =>
                                                    handleReplicaDelta(
                                                        comp,
                                                        currentReplicas,
                                                        1,
                                                    )
                                                }
                                                className="flex size-7 items-center justify-center rounded-md text-soft hover:bg-badge hover:text-ink disabled:opacity-30"
                                                title="Increase replicas"
                                            >
                                                <Plus className="size-3.5" />
                                            </button>
                                            {activeEnvConfig.replicas?.[comp] !=
                                                null && (
                                                <button
                                                    type="button"
                                                    disabled={isSubmitting}
                                                    onClick={() =>
                                                        handleResetReplicas(
                                                            comp,
                                                        )
                                                    }
                                                    className="flex size-7 items-center justify-center rounded-md text-soft hover:bg-badge hover:text-ink disabled:opacity-30"
                                                    title="Reset to default replicas"
                                                >
                                                    <RotateCw className="size-3" />
                                                </button>
                                            )}
                                        </div>
                                    ) : null}

                                    {/* Autoscale Toggle / Config Button */}
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() =>
                                            setAutoscaleModalComp(comp)
                                        }
                                        className="gap-1.5"
                                    >
                                        <Sliders className="size-3.5" />
                                        <span>
                                            {isAutoscaled
                                                ? 'HPA Config'
                                                : 'Autoscale'}
                                        </span>
                                    </Button>

                                    {/* Resource Sizing Button */}
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() =>
                                            setResourcesModalComp(comp)
                                        }
                                        className="gap-1.5"
                                    >
                                        <Cpu className="size-3.5" />
                                        <span>Compute Sizing</span>
                                    </Button>
                                </div>
                            </div>

                            {/* Resource Footprint Pill */}
                            <div className="flex items-center gap-2 text-xs text-soft">
                                <span className="font-medium text-soft">
                                    Allocation:
                                </span>
                                {compResources ? (
                                    <span className="font-mono text-ink">
                                        Req:{' '}
                                        {compResources.requests?.cpu ?? '50m'} /{' '}
                                        {compResources.requests?.memory ??
                                            '128Mi'}{' '}
                                        · Limit:{' '}
                                        {compResources.limits?.cpu ?? '1'} /{' '}
                                        {compResources.limits?.memory ?? '1Gi'}
                                    </span>
                                ) : (
                                    <span className="text-soft italic">
                                        Inherits cluster defaults (50m / 512Mi
                                        standard)
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Autoscale Modal */}
            {autoscaleModalComp && (
                <AutoscaleModal
                    project={project}
                    activeEnv={activeEnv}
                    component={autoscaleModalComp}
                    existing={activeEnvConfig.autoscale?.[autoscaleModalComp]}
                    onClose={() => setAutoscaleModalComp(null)}
                />
            )}

            {/* Resource Sizing Modal */}
            {resourcesModalComp && (
                <ResourcesModal
                    project={project}
                    activeEnv={activeEnv}
                    component={resourcesModalComp}
                    existing={activeEnvConfig.resources?.[resourcesModalComp]}
                    onClose={() => setResourcesModalComp(null)}
                />
            )}
        </Card>
    );
}

function AutoscaleModal({
    project,
    activeEnv,
    component,
    existing,
    onClose,
}: {
    project: Project;
    activeEnv: string;
    component: string;
    existing?: { min: number; max: number; cpu: number };
    onClose: () => void;
}) {
    const [min, setMin] = useState(existing?.min ?? 1);
    const [max, setMax] = useState(existing?.max ?? 5);
    const [cpu, setCpu] = useState(existing?.cpu ?? 70);
    const [submitting, setSubmitting] = useState(false);

    function handleSubmit(disable = false) {
        setSubmitting(true);
        router.post(
            autoscale({ project: project.id }).url,
            {
                environment: activeEnv,
                component,
                min,
                max,
                cpu,
                disable,
            },
            {
                preserveScroll: true,
                onFinish: () => {
                    setSubmitting(false);
                    onClose();
                },
            },
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-6 backdrop-blur-xs">
            <div className="w-full max-w-[460px] rounded-2xl bg-surface p-6 shadow-2xl ring-1 ring-line">
                <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
                    <div className="flex items-center gap-2">
                        <Sliders className="size-4 text-ink" />
                        <h3 className="text-base font-semibold text-ink">
                            Autoscaling (HPA) · {component}
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-soft hover:bg-badge hover:text-ink"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                <div className="flex flex-col gap-4 text-sm">
                    <p className="text-xs text-soft">
                        Horizontal Pod Autoscaler dynamically scales your pods
                        up and down based on real-time CPU consumption.
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-soft">
                                Minimum Pods
                            </label>
                            <input
                                type="number"
                                min={1}
                                max={max}
                                value={min}
                                onChange={(e) => setMin(Number(e.target.value))}
                                className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-sm text-ink focus:border-ink focus:outline-hidden"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-soft">
                                Maximum Pods
                            </label>
                            <input
                                type="number"
                                min={min}
                                max={100}
                                value={max}
                                onChange={(e) => setMax(Number(e.target.value))}
                                className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-sm text-ink focus:border-ink focus:outline-hidden"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium text-soft">
                            Target CPU Utilization (%)
                        </label>
                        <input
                            type="number"
                            min={10}
                            max={95}
                            value={cpu}
                            onChange={(e) => setCpu(Number(e.target.value))}
                            className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-sm text-ink focus:border-ink focus:outline-hidden"
                        />
                        <span className="text-[11px] text-soft">
                            Pods scale up when average CPU exceeds {cpu}%.
                        </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between border-t border-line pt-3">
                        {existing ? (
                            <Button
                                variant="danger"
                                size="sm"
                                disabled={submitting}
                                onClick={() => handleSubmit(true)}
                                className="gap-1.5"
                            >
                                <RotateCw className="size-3.5" />
                                <span>Disable HPA</span>
                            </Button>
                        ) : (
                            <div />
                        )}

                        <div className="flex items-center gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={onClose}
                                className="gap-1.5"
                            >
                                <X className="size-3.5" />
                                <span>Cancel</span>
                            </Button>
                            <Button
                                variant="primary"
                                size="sm"
                                disabled={submitting || min > max}
                                onClick={() => handleSubmit(false)}
                                className="gap-1.5"
                            >
                                <Check className="size-3.5" />
                                <span>Apply HPA</span>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ResourcesModal({
    project,
    activeEnv,
    component,
    existing,
    onClose,
}: {
    project: Project;
    activeEnv: string;
    component: string;
    existing?: {
        requests?: { cpu?: string; memory?: string };
        limits?: { cpu?: string; memory?: string };
    };
    onClose: () => void;
}) {
    const [selectedTier, setSelectedTier] = useState<string>('standard');
    const [customReqCpu, setCustomReqCpu] = useState(
        existing?.requests?.cpu ?? '250m',
    );
    const [customReqMem, setCustomReqMem] = useState(
        existing?.requests?.memory ?? '512Mi',
    );
    const [customLimCpu, setCustomLimCpu] = useState(
        existing?.limits?.cpu ?? '500m',
    );
    const [customLimMem, setCustomLimMem] = useState(
        existing?.limits?.memory ?? '1Gi',
    );
    const [submitting, setSubmitting] = useState(false);

    function handleApply(reset = false) {
        setSubmitting(true);
        const payload: Record<string, any> = {
            environment: activeEnv,
            component,
            reset,
        };

        if (!reset) {
            if (selectedTier === 'custom') {
                payload.tier = 'custom';
                payload.requests_cpu = customReqCpu;
                payload.requests_memory = customReqMem;
                payload.limits_cpu = customLimCpu;
                payload.limits_memory = customLimMem;
            } else {
                payload.tier = selectedTier;
            }
        }

        router.post(resources({ project: project.id }).url, payload, {
            preserveScroll: true,
            onFinish: () => {
                setSubmitting(false);
                onClose();
            },
        });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-6 backdrop-blur-xs">
            <div className="w-full max-w-[500px] rounded-2xl bg-surface p-6 shadow-2xl ring-1 ring-line">
                <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
                    <div className="flex items-center gap-2">
                        <Cpu className="size-4 text-ink" />
                        <h3 className="text-base font-semibold text-ink">
                            Compute Resources & Sizing · {component}
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-soft hover:bg-badge hover:text-ink"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                <div className="flex flex-col gap-4 text-sm">
                    <p className="text-xs text-soft">
                        Configure Kubernetes CPU and memory requests
                        (guaranteed) and limits (hard ceiling) for this
                        container.
                    </p>

                    <div className="flex flex-col gap-2">
                        {RESOURCE_TIERS.map((tier) => {
                            const isSelected = selectedTier === tier.id;
                            return (
                                <button
                                    key={tier.id}
                                    type="button"
                                    onClick={() => setSelectedTier(tier.id)}
                                    className={`flex items-start justify-between rounded-xl border p-3 text-left transition ${
                                        isSelected
                                            ? 'border-ink bg-paper ring-1 ring-ink'
                                            : 'border-line bg-surface hover:bg-paper'
                                    }`}
                                >
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-ink">
                                                {tier.name}
                                            </span>
                                            {tier.id === 'standard' && (
                                                <StatusPill tone="ok">
                                                    Recommended
                                                </StatusPill>
                                            )}
                                        </div>
                                        <div className="mt-0.5 text-xs text-soft">
                                            {tier.desc}
                                        </div>
                                        <div className="mt-1 font-mono text-[11px] text-ink">
                                            Requests: {tier.req} · Limits:{' '}
                                            {tier.limit}
                                        </div>
                                    </div>
                                    {isSelected ? (
                                        <Check className="mt-0.5 size-4 shrink-0 text-ink" />
                                    ) : null}
                                </button>
                            );
                        })}

                        {/* Custom Tier Option */}
                        <button
                            type="button"
                            onClick={() => setSelectedTier('custom')}
                            className={`flex items-start justify-between rounded-xl border p-3 text-left transition ${
                                selectedTier === 'custom'
                                    ? 'border-ink bg-paper ring-1 ring-ink'
                                    : 'border-line bg-surface hover:bg-paper'
                            }`}
                        >
                            <div>
                                <span className="font-semibold text-ink">
                                    Custom Allocation
                                </span>
                                <div className="mt-0.5 text-xs text-soft">
                                    Specify fine-grained CPU and RAM quantities
                                </div>
                            </div>
                            {selectedTier === 'custom' ? (
                                <Check className="mt-0.5 size-4 shrink-0 text-ink" />
                            ) : null}
                        </button>
                    </div>

                    {selectedTier === 'custom' && (
                        <div className="grid grid-cols-2 gap-3 border-t border-line pt-3">
                            <div>
                                <label className="mb-1 block text-[11px] font-medium text-soft">
                                    Requests CPU (e.g. 100m, 1)
                                </label>
                                <input
                                    type="text"
                                    value={customReqCpu}
                                    onChange={(e) =>
                                        setCustomReqCpu(e.target.value)
                                    }
                                    className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-xs text-ink"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-[11px] font-medium text-soft">
                                    Requests RAM (e.g. 256Mi, 1Gi)
                                </label>
                                <input
                                    type="text"
                                    value={customReqMem}
                                    onChange={(e) =>
                                        setCustomReqMem(e.target.value)
                                    }
                                    className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-xs text-ink"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-[11px] font-medium text-soft">
                                    Limits CPU
                                </label>
                                <input
                                    type="text"
                                    value={customLimCpu}
                                    onChange={(e) =>
                                        setCustomLimCpu(e.target.value)
                                    }
                                    className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-xs text-ink"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-[11px] font-medium text-soft">
                                    Limits RAM
                                </label>
                                <input
                                    type="text"
                                    value={customLimMem}
                                    onChange={(e) =>
                                        setCustomLimMem(e.target.value)
                                    }
                                    className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-xs text-ink"
                                />
                            </div>
                        </div>
                    )}

                    <div className="mt-2 flex items-center justify-between border-t border-line pt-3">
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={submitting}
                            onClick={() => handleApply(true)}
                            className="gap-1.5 text-soft"
                        >
                            <RotateCw className="size-3.5" />
                            <span>Reset to Default</span>
                        </Button>

                        <div className="flex items-center gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={onClose}
                                className="gap-1.5"
                            >
                                <X className="size-3.5" />
                                <span>Cancel</span>
                            </Button>
                            <Button
                                variant="primary"
                                size="sm"
                                disabled={submitting}
                                onClick={() => handleApply(false)}
                                className="gap-1.5"
                            >
                                <Check className="size-3.5" />
                                <span>Apply Resources</span>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
