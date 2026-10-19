import { useEffect, useMemo, useState } from 'react';
import { Link } from '@inertiajs/react';
import {
    Background,
    BackgroundVariant,
    Controls,
    ReactFlow,
    ReactFlowProvider,
    useReactFlow,
    type Edge,
    type Node,
} from '@xyflow/react';
import { ArrowLeft, Network, PanelRight, Sparkles, X } from 'lucide-react';
import AppLayout from '@/layouts/app-layout';
import Button, { buttonClass } from '@/components/button';
import { cn } from '@/lib/utils';
import { InfrastructureNode } from '@/components/simulator/nodes/infrastructure-node';
import { PacketEdge } from '@/components/simulator/edges/packet-edge';
import StepInspector from '@/components/simulator/step-inspector';
import SimulatorControls from '@/components/simulator/simulator-controls';
import { getScenarios } from '@/components/simulator/scenarios';
import type { SimulatorPageProps } from '@/components/simulator/types';

const NODE_TYPES = {
    infrastructure: InfrastructureNode,
};

const EDGE_TYPES = {
    packet: PacketEdge,
};

/**
 * Inner Flow Canvas with useReactFlow for auto-centering and viewport tracking.
 */
function SimulatorCanvas({
    nodes,
    edges,
    showInspector,
    currentScenarioKey,
}: {
    nodes: Node[];
    edges: Edge[];
    showInspector: boolean;
    currentScenarioKey: string;
}) {
    const { fitView } = useReactFlow();

    // Auto-center and fit all nodes whenever scenario changes or inspector toggles
    useEffect(() => {
        const timer = setTimeout(() => {
            void fitView({ padding: 0.25, duration: 350 });
        }, 60);

        return () => clearTimeout(timer);
    }, [currentScenarioKey, showInspector, fitView, nodes.length]);

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            minZoom={0.4}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
        >
            <Background
                variant={BackgroundVariant.Dots}
                gap={18}
                size={1}
                color="var(--color-line, #e4e4e8)"
            />
            <Controls className="!rounded-xl !border !border-line !bg-surface !shadow-md" />
        </ReactFlow>
    );
}

export default function SimulatorIndex({
    projects,
    servers,
    presets,
    initialProjectId,
}: SimulatorPageProps) {
    const initialTargetId = initialProjectId
        ? `project:${initialProjectId}`
        : `preset:${presets[0]?.id ?? 'laravel-postgres'}`;

    const [selectedTargetId, setSelectedTargetId] =
        useState<string>(initialTargetId);
    const [currentScenarioKey, setCurrentScenarioKey] =
        useState<string>('healthy_web');
    const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [speed, setSpeed] = useState<number>(1);
    const [showInspector, setShowInspector] = useState<boolean>(true);

    // Resolve active target parameters
    const activeTarget = useMemo(() => {
        if (selectedTargetId.startsWith('project:')) {
            const id = Number(selectedTargetId.replace('project:', ''));
            const p = projects.find((proj) => proj.id === id);
            if (p) {
                return {
                    id: p.id,
                    name: p.name,
                    host: p.webHost || `${p.name}.dev.test`,
                    framework: p.framework || 'laravel',
                    databaseDriver: p.database || null,
                    databaseName: p.database ? `${p.name}_db` : null,
                };
            }
        }

        const presetId = selectedTargetId.replace('preset:', '');
        const preset = presets.find((pr) => pr.id === presetId) || presets[0];

        return {
            id: null,
            name: preset?.name || 'Laravel 12 (FrankenPHP)',
            host: preset?.webHost || 'laravel.dev.test',
            framework: preset?.framework || 'laravel',
            databaseDriver: preset?.database || null,
            databaseName: preset?.databaseName || null,
        };
    }, [selectedTargetId, projects, presets]);

    // Back link target
    const backHref = initialProjectId
        ? `/projects/${initialProjectId}`
        : '/dashboard';
    const backLabel = initialProjectId
        ? `Back to ${activeTarget.name}`
        : 'Exit to Dashboard';

    // Generate dynamic scenarios for target
    const scenariosMap = useMemo(() => {
        return getScenarios(
            activeTarget.host,
            activeTarget.framework,
            activeTarget.databaseDriver,
            activeTarget.databaseName,
        );
    }, [activeTarget]);

    const scenariosList = useMemo(
        () => Object.values(scenariosMap),
        [scenariosMap],
    );

    // Ensure active scenario is valid for this workload
    useEffect(() => {
        if (!scenariosMap[currentScenarioKey]) {
            setCurrentScenarioKey(scenariosList[0]?.id ?? 'healthy_web');
        }
    }, [scenariosMap, scenariosList, currentScenarioKey]);

    const activeScenario = scenariosMap[currentScenarioKey] ??
        scenariosList[0] ?? {
            id: 'healthy_web',
            name: 'Web Request',
            description: '',
            statusCode: 200,
            tone: 'ok',
            hops: [],
        };

    const totalSteps = activeScenario.hops.length;
    const activeHop =
        activeScenario.hops[currentStepIndex] ?? activeScenario.hops[0];

    // Reset step when scenario or target changes
    useEffect(() => {
        setCurrentStepIndex(0);
        setIsPlaying(false);
    }, [currentScenarioKey, selectedTargetId]);

    // Automated Playback loop
    useEffect(() => {
        if (!isPlaying) return;

        const intervalMs = Math.round(2200 / speed);
        const timer = setInterval(() => {
            setCurrentStepIndex((prev) => {
                if (prev >= totalSteps - 1) {
                    setIsPlaying(false);
                    return prev;
                }
                return prev + 1;
            });
        }, intervalMs);

        return () => clearInterval(timer);
    }, [isPlaying, speed, totalSteps]);

    // Build React Flow Nodes & Edges
    const { nodes, edges } = useMemo(() => {
        const generatedNodes: Node[] = [];
        const generatedEdges: Edge[] = [];

        const xSpacing = 240;
        const startX = 40;
        const yPos = 200;

        activeScenario.hops.forEach((hop, idx) => {
            const isHopActive = idx === currentStepIndex;
            const isHopVisited = idx < currentStepIndex;
            const isHopFailed =
                activeScenario.tone === 'bad' &&
                idx === activeScenario.hops.length - 1;

            generatedNodes.push({
                id: hop.id,
                type: 'infrastructure',
                position: { x: startX + idx * xSpacing, y: yPos },
                data: {
                    hop,
                    isActive: isHopActive,
                    isVisited: isHopVisited,
                    isFailed: isHopFailed && isHopActive,
                    onClick: () => {
                        setCurrentStepIndex(idx);
                        setIsPlaying(false);
                    },
                },
            });

            // Connect edge from previous node to this node
            if (idx > 0) {
                const prevHop = activeScenario.hops[idx - 1];
                const isEdgeActive = currentStepIndex >= idx;
                const isEdgeFailed =
                    activeScenario.tone === 'bad' &&
                    idx === activeScenario.hops.length - 1 &&
                    currentStepIndex >= idx;

                generatedEdges.push({
                    id: `edge-${prevHop.id}-${hop.id}`,
                    type: 'packet',
                    source: prevHop.id,
                    target: hop.id,
                    data: {
                        isActive: isEdgeActive,
                        isReturn: false,
                        isFailed: isEdgeFailed,
                        label: `${hop.technicalDetails.latencyMs}ms`,
                    },
                });
            }
        });

        return { nodes: generatedNodes, edges: generatedEdges };
    }, [activeScenario, currentStepIndex]);

    return (
        <AppLayout title="Request Simulator — LaraKube">
            <div className="flex h-[calc(100vh-4.5rem)] flex-col gap-3 p-4">
                {/* Header bar with Prominent Exit / Back Navigation */}
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <Link
                            href={backHref}
                            className={cn(
                                buttonClass('secondary', 'sm'),
                                'gap-1.5 text-xs font-semibold text-ink shadow-2xs hover:border-brand/40',
                            )}
                            title="Exit Simulator and return"
                        >
                            <ArrowLeft className="size-3.5" />
                            <span>{backLabel}</span>
                        </Link>

                        <div className="h-4 w-px bg-line" />

                        <div className="flex items-center gap-2">
                            <span className="flex size-7 items-center justify-center rounded-xl bg-brand/15 text-brand">
                                <Network className="size-4" />
                            </span>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-base font-bold tracking-tight text-ink">
                                        Life of a Request Simulator
                                    </h1>
                                    <span className="flex items-center gap-1 rounded-full bg-ok/15 px-2 py-0.5 text-[10px] font-semibold text-ok">
                                        <Sparkles className="size-3" />{' '}
                                        Interactive
                                    </span>
                                </div>
                                <p className="text-[11px] text-soft">
                                    Trace packets from browser through
                                    Cloudflare, Ingress, Pods, and Databases.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {servers.length > 0 && (
                            <span className="hidden rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-soft shadow-2xs md:inline-block">
                                Cluster:{' '}
                                <span className="font-semibold text-ink">
                                    {servers[0]?.name}
                                </span>
                            </span>
                        )}
                        <span className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink shadow-2xs">
                            Host:{' '}
                            <span className="font-mono text-brand">
                                {activeTarget.host}
                            </span>
                        </span>

                        <Button
                            variant={showInspector ? 'primary' : 'secondary'}
                            size="sm"
                            onClick={() => setShowInspector(!showInspector)}
                            className="gap-1.5 text-xs"
                            title="Toggle technical inspector drawer"
                        >
                            <PanelRight className="size-3.5" />
                            <span>
                                {showInspector ? 'Hide Drawer' : 'Inspect'}
                            </span>
                        </Button>

                        <Link
                            href={backHref}
                            className={cn(
                                buttonClass('ghost', 'sm'),
                                'hover:bg-hover size-8 p-0 text-soft hover:text-ink',
                            )}
                            title="Close Simulator"
                        >
                            <X className="size-4" />
                        </Link>
                    </div>
                </div>

                {/* Main Workspace: Full Canvas + Flush Inspector Sidebar */}
                <div className="relative flex flex-1 overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
                    {/* React Flow Canvas (with Auto-centering Provider) */}
                    <div className="h-full min-w-0 flex-1">
                        <ReactFlowProvider>
                            <SimulatorCanvas
                                nodes={nodes}
                                edges={edges}
                                showInspector={showInspector}
                                currentScenarioKey={currentScenarioKey}
                            />
                        </ReactFlowProvider>
                    </div>

                    {/* Step Inspector Sidebar (Flush, native panel) */}
                    {showInspector && activeHop && (
                        <aside className="w-[340px] shrink-0 border-l border-line bg-surface">
                            <StepInspector
                                hop={activeHop}
                                stepIndex={currentStepIndex}
                                totalSteps={totalSteps}
                                onNext={() =>
                                    setCurrentStepIndex((prev) =>
                                        Math.min(totalSteps - 1, prev + 1),
                                    )
                                }
                                onPrev={() =>
                                    setCurrentStepIndex((prev) =>
                                        Math.max(0, prev - 1),
                                    )
                                }
                                hasNext={currentStepIndex < totalSteps - 1}
                                hasPrev={currentStepIndex > 0}
                                isFailed={
                                    activeScenario.tone === 'bad' &&
                                    currentStepIndex ===
                                        activeScenario.hops.length - 1
                                }
                                onClose={() => setShowInspector(false)}
                            />
                        </aside>
                    )}
                </div>

                {/* Bottom Controls Bar */}
                <SimulatorControls
                    scenarios={scenariosList}
                    currentScenarioKey={currentScenarioKey}
                    onSelectScenario={(key) => setCurrentScenarioKey(key)}
                    isPlaying={isPlaying}
                    onTogglePlay={() => setIsPlaying((prev) => !prev)}
                    onReset={() => {
                        setCurrentStepIndex(0);
                        setIsPlaying(false);
                    }}
                    speed={speed}
                    onChangeSpeed={(spd) => setSpeed(spd)}
                    projects={projects}
                    presets={presets}
                    selectedTargetId={selectedTargetId}
                    onSelectTarget={(id) => setSelectedTargetId(id)}
                    currentStepIndex={currentStepIndex}
                    totalSteps={totalSteps}
                    onNext={() =>
                        setCurrentStepIndex((prev) =>
                            Math.min(totalSteps - 1, prev + 1),
                        )
                    }
                    onPrev={() =>
                        setCurrentStepIndex((prev) => Math.max(0, prev - 1))
                    }
                />
            </div>
        </AppLayout>
    );
}
