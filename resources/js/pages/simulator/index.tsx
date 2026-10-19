import { useEffect, useMemo, useState } from 'react';
import {
    Background,
    BackgroundVariant,
    Controls,
    MiniMap,
    ReactFlow,
    type Edge,
    type Node,
} from '@xyflow/react';
import { Network, Sparkles } from 'lucide-react';
import AppLayout from '@/layouts/app-layout';
import { InfrastructureNode } from '@/components/simulator/nodes/infrastructure-node';
import { PacketEdge } from '@/components/simulator/edges/packet-edge';
import StepInspector from '@/components/simulator/step-inspector';
import SimulatorControls from '@/components/simulator/simulator-controls';
import { getScenarios } from '@/components/simulator/scenarios';
import type {
    ScenarioKind,
    SimulatorPageProps,
} from '@/components/simulator/types';

const NODE_TYPES = {
    infrastructure: InfrastructureNode,
};

const EDGE_TYPES = {
    packet: PacketEdge,
};

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
        useState<ScenarioKind>('healthy_web');
    const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [speed, setSpeed] = useState<number>(1);

    // Resolve active target parameters
    const activeTarget = useMemo(() => {
        if (selectedTargetId.startsWith('project:')) {
            const id = Number(selectedTargetId.replace('project:', ''));
            const p = projects.find((proj) => proj.id === id);
            if (p) {
                return {
                    name: p.name,
                    host: p.webHost || `${p.name}.dev.test`,
                    framework: p.framework || 'laravel',
                    databaseDriver: p.database || 'pgsql',
                    databaseName: `${p.name}_db`,
                };
            }
        }

        const presetId = selectedTargetId.replace('preset:', '');
        const preset = presets.find((pr) => pr.id === presetId) || presets[0];

        return {
            name: preset?.name || 'Laravel 12 (FrankenPHP)',
            host: preset?.webHost || 'laravel.dev.test',
            framework: preset?.framework || 'laravel',
            databaseDriver: preset?.database || 'pgsql',
            databaseName: preset?.databaseName || 'tenant_laravel_db',
        };
    }, [selectedTargetId, projects, presets]);

    // Generate dynamic scenarios for target
    const scenarios = useMemo(() => {
        return getScenarios(
            activeTarget.host,
            activeTarget.framework,
            activeTarget.databaseDriver,
            activeTarget.databaseName,
        );
    }, [activeTarget]);

    const activeScenario = scenarios[currentScenarioKey];
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

        const xSpacing = 280;
        const startX = 40;
        const yPos = 160;

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

        // Add return edge back to client if completed and healthy
        if (
            currentStepIndex === totalSteps - 1 &&
            activeScenario.tone === 'ok' &&
            totalSteps >= 2
        ) {
            const lastHop = activeScenario.hops[totalSteps - 1];
            generatedEdges.push({
                id: `return-edge-${lastHop.id}-client`,
                type: 'packet',
                source: lastHop.id,
                target: 'client',
                data: {
                    isActive: true,
                    isReturn: true,
                    label: '200 OK (Stream)',
                },
                style: {
                    strokeDasharray: '4,4',
                },
            });
        }

        return { nodes: generatedNodes, edges: generatedEdges };
    }, [activeScenario, currentStepIndex]);

    return (
        <AppLayout title="Request Simulator — LaraKube">
            <div className="flex h-[calc(100vh-4.5rem)] flex-col gap-3 p-4">
                {/* Header bar */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="flex size-7 items-center justify-center rounded-xl bg-brand/15 text-brand">
                                <Network className="size-4" />
                            </span>
                            <h1 className="text-xl font-bold tracking-tight text-ink">
                                Life of a Request Simulator (Holo-Trace)
                            </h1>
                            <span className="flex items-center gap-1 rounded-full bg-ok/15 px-2 py-0.5 text-[10px] font-semibold text-ok">
                                <Sparkles className="size-3" /> Interactive
                                Classroom
                            </span>
                        </div>
                        <p className="mt-0.5 text-xs text-soft">
                            Trace HTTP requests in real time from client browser
                            through Cloudflare, Traefik Ingress, K8s Services,
                            application pods, and Plex Commons.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {servers.length > 0 && (
                            <span className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-soft shadow-2xs">
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
                    </div>
                </div>

                {/* Main Workspace: Canvas + Inspector Sidebar */}
                <div className="relative flex flex-1 gap-3 overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
                    {/* React Flow Canvas */}
                    <div className="h-full flex-1">
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            nodeTypes={NODE_TYPES}
                            edgeTypes={EDGE_TYPES}
                            fitView
                            fitViewOptions={{ padding: 0.2 }}
                            minZoom={0.4}
                            maxZoom={1.5}
                            proOptions={{ hideAttribution: true }}
                        >
                            <Background
                                variant={BackgroundVariant.Dots}
                                gap={16}
                                size={1}
                                color="var(--color-line, #e4e4e8)"
                            />
                            <Controls className="!rounded-xl !border !border-line !bg-surface !shadow-md" />
                            <MiniMap
                                className="!rounded-xl !border !border-line !bg-surface !shadow-md"
                                nodeColor="#3b82f6"
                                maskColor="rgba(0, 0, 0, 0.1)"
                                zoomable
                                pannable
                            />
                        </ReactFlow>
                    </div>

                    {/* Step Inspector Sidebar */}
                    <div className="w-[360px] overflow-y-auto border-l border-line bg-paper/30 p-3">
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
                        />
                    </div>
                </div>

                {/* Bottom Controls Bar */}
                <SimulatorControls
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
                />
            </div>
        </AppLayout>
    );
}
