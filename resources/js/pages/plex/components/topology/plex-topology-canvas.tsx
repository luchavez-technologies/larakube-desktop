import { useEffect, useMemo, useState } from 'react';
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
import '@xyflow/react/dist/style.css';
import {
    Boxes,
    Code2,
    Layers,
    Maximize2,
    Minimize2,
    Network,
    PanelRight,
    Search,
    Wrench,
    X,
} from 'lucide-react';
import Button from '@/components/button';
import { cn } from '@/lib/utils';
import type {
    PlexCommonsServicesReport,
    PlexStatus,
    PlexTenant,
    PodMetrics,
    Server as ServerModel,
} from '@/types/larakube';
import { ConduitEdge } from './conduit-edge';
import { ConsumerNode } from './consumer-node';
import { EngineNode } from './engine-node';
import TopologyInspector from './topology-inspector';
import type {
    TopologyConsumer,
    TopologyConsumerNodeData,
    TopologyEngineNodeData,
    TopologyProject,
    TopologySelection,
    TopologyTool,
} from './types';

const NODE_TYPES = {
    consumer: ConsumerNode,
    app: ConsumerNode,
    engine: EngineNode,
};

const EDGE_TYPES = {
    conduit: ConduitEdge,
};

function TopologyFlow({
    nodes,
    edges,
    isFullscreen,
    consumerFilter,
    onSelectNode,
    onSelectEdge,
}: {
    nodes: Node[];
    edges: Edge[];
    isFullscreen: boolean;
    consumerFilter: string;
    onSelectNode: (node: Node) => void;
    onSelectEdge: (edge: Edge) => void;
}) {
    const { fitView } = useReactFlow();

    useEffect(() => {
        const timer = setTimeout(() => {
            void fitView({ padding: 0.22, duration: 400 });
        }, 120);
        return () => clearTimeout(timer);
    }, [fitView, nodes.length, isFullscreen, consumerFilter]);

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodeClick={(_, node) => onSelectNode(node)}
            onEdgeClick={(_, edge) => onSelectEdge(edge)}
            fitView
            fitViewOptions={{ padding: 0.22 }}
            minZoom={0.25}
            maxZoom={1.6}
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

export default function PlexTopologyCanvas({
    server,
    projects,
    plex,
    services,
    podMetrics,
}: {
    server: ServerModel;
    projects: TopologyProject[];
    plex?: PlexStatus | null;
    services?: PlexCommonsServicesReport | null;
    podMetrics?: PodMetrics | null;
}) {
    const [selection, setSelection] = useState<TopologySelection>(null);
    const [showInspector, setShowInspector] = useState<boolean>(true);
    const [consumerFilter, setConsumerFilter] = useState<
        'all' | 'apps' | 'tools' | 'custom'
    >('all');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

    // Escape key listener to exit fullscreen
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isFullscreen) {
                setIsFullscreen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isFullscreen]);

    // 1. Extract strictly active engines from services report
    const activeEngines = useMemo(() => {
        if (!services?.categories) return [];
        const engines: Array<{
            driver: string;
            label: string;
            categoryKey: string;
            categoryLabel: string;
            port?: number | string;
            ready: boolean;
            tenants: PlexTenant[];
        }> = [];

        const allTenants: PlexTenant[] = [
            ...(plex?.tenants?.project ?? []),
            ...(plex?.tenants?.tool ?? []),
            ...(plex?.tenants?.custom ?? []),
        ];

        services.categories.forEach((cat) => {
            cat.options.forEach((opt) => {
                // Strictly opt.enabled so only deployed engines appear
                if (opt.enabled) {
                    const portDetail = opt.details?.find((d) =>
                        d.label.toLowerCase().includes('port'),
                    );
                    let engineTenants = allTenants.filter((t) => {
                        if (
                            cat.key === 'database' &&
                            (t.databaseService
                                ?.toLowerCase()
                                .includes(opt.driver) ||
                                Boolean(t.database))
                        ) {
                            return true;
                        }
                        if (
                            cat.key === 'cache' &&
                            t.redisIndex !== null &&
                            t.redisIndex !== undefined
                        ) {
                            return true;
                        }
                        if (cat.key === 'storage' && Boolean(t.s3Bucket)) {
                            return true;
                        }
                        return false;
                    });

                    // For Render engine (Headless Chrome), associate Documenso (PDF certificate sealing)
                    if (
                        cat.key === 'render' ||
                        opt.driver.includes('headless') ||
                        opt.driver.includes('chrome')
                    ) {
                        const documensoTenant = allTenants.find(
                            (t) =>
                                Boolean(t.clusterTool?.requiresRender) ||
                                (t.clusterTool?.tool ?? t.name).includes(
                                    'documenso',
                                ),
                        );
                        if (documensoTenant) {
                            engineTenants = [
                                {
                                    ...documensoTenant,
                                    name: 'documenso-pdf-sealing',
                                    database: 'CDP (:9222)',
                                },
                            ];
                        }
                    }

                    engines.push({
                        driver: opt.driver,
                        label: opt.label,
                        categoryKey: cat.key,
                        categoryLabel: cat.label,
                        port: portDetail?.value ?? undefined,
                        ready: opt.ready,
                        tenants: engineTenants,
                    });
                }
            });
        });

        return engines;
    }, [services, plex]);

    // 2. Extract and group cluster tools from plex.tenants.tool & cluster project tenants
    const toolGroups = useMemo<TopologyTool[]>(() => {
        const toolsMap = new Map<string, TopologyTool>();
        // Include tool tenants plus any project tenant matching Outline's legacy notes-storage
        const allToolTenants = [
            ...(plex?.tenants?.tool ?? []),
            ...(plex?.tenants?.project ?? []).filter(
                (t) => Boolean(t.clusterTool) || t.name.startsWith('notes-'),
            ),
        ];

        for (const tenant of allToolTenants) {
            const slug =
                tenant.clusterTool?.tool ??
                (tenant.name.startsWith('notes-') ? 'outline' : tenant.name);
            const existing = toolsMap.get(slug);

            const dbs = tenant.database ? [tenant.database] : [];
            const redis =
                tenant.redisIndex !== null && tenant.redisIndex !== undefined
                    ? [tenant.redisIndex]
                    : [];
            const s3 = tenant.s3Bucket ? [tenant.s3Bucket] : [];
            const usesRender =
                Boolean(tenant.clusterTool?.requiresRender) ||
                slug.startsWith('documenso');

            if (existing) {
                existing.databases = Array.from(
                    new Set([...existing.databases, ...dbs]),
                );
                existing.redisIndexes = Array.from(
                    new Set([...existing.redisIndexes, ...redis]),
                );
                existing.s3Buckets = Array.from(
                    new Set([...existing.s3Buckets, ...s3]),
                );
                existing.usesRender = existing.usesRender || usesRender;
                existing.tenants.push(tenant);
                if (!existing.clusterTool && tenant.clusterTool) {
                    existing.clusterTool = tenant.clusterTool;
                    existing.name = tenant.clusterTool.name || existing.name;
                    existing.tagline =
                        tenant.clusterTool.tagline || existing.tagline;
                }
            } else {
                const name =
                    tenant.clusterTool?.name ??
                    (tenant.name.startsWith('notes-')
                        ? 'Outline'
                        : slug.charAt(0).toUpperCase() + slug.slice(1));
                const tagline =
                    tenant.clusterTool?.tagline ??
                    (tenant.name.startsWith('notes-')
                        ? 'Team Wiki & Knowledge Base'
                        : 'Cluster Companion Tool');
                toolsMap.set(slug, {
                    slug,
                    name,
                    tagline,
                    clusterTool: tenant.clusterTool ?? null,
                    databases: dbs,
                    redisIndexes: redis,
                    s3Buckets: s3,
                    usesRender,
                    tenants: [tenant],
                });
            }
        }
        return Array.from(toolsMap.values());
    }, [plex?.tenants?.tool, plex?.tenants?.project]);

    // 2b. Extract custom / external provisioned workloads
    const customTenants = useMemo<PlexTenant[]>(() => {
        const explicitCustom = plex?.tenants?.custom ?? [];
        const localAppNames = new Set(
            projects.map((p) => p.name.toLowerCase()),
        );
        const unlinkedProjectTenants = (plex?.tenants?.project ?? []).filter(
            (t) => {
                if (t.clusterTool || t.name.startsWith('notes-')) return false;
                const tBase = t.name.toLowerCase();
                for (const app of localAppNames) {
                    if (
                        tBase === app ||
                        tBase.startsWith(`${app}_`) ||
                        tBase.startsWith(`${app}-`)
                    ) {
                        return false;
                    }
                }
                return true;
            },
        );
        return [...explicitCustom, ...unlinkedProjectTenants];
    }, [plex?.tenants?.custom, plex?.tenants?.project, projects]);

    // 3. Filter visible consumers based on tab selection & search query
    const visibleConsumers = useMemo<TopologyConsumer[]>(() => {
        const appConsumers: TopologyConsumer[] = projects.map((p) => ({
            kind: 'app',
            project: p,
        }));
        const toolConsumers: TopologyConsumer[] = toolGroups.map((t) => ({
            kind: 'tool',
            tool: t,
        }));
        const customConsumers: TopologyConsumer[] = customTenants.map((t) => ({
            kind: 'custom',
            tenant: t,
        }));

        let list =
            consumerFilter === 'apps'
                ? appConsumers
                : consumerFilter === 'tools'
                  ? toolConsumers
                  : consumerFilter === 'custom'
                    ? customConsumers
                    : [...appConsumers, ...toolConsumers, ...customConsumers];

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter((c) => {
                if (c.kind === 'app') {
                    return (
                        c.project.name.toLowerCase().includes(q) ||
                        c.project.framework.toLowerCase().includes(q) ||
                        (c.project.webHost &&
                            c.project.webHost.toLowerCase().includes(q))
                    );
                } else if (c.kind === 'tool') {
                    return (
                        c.tool.name.toLowerCase().includes(q) ||
                        c.tool.slug.toLowerCase().includes(q) ||
                        c.tool.tagline.toLowerCase().includes(q)
                    );
                } else {
                    return c.tenant.name.toLowerCase().includes(q);
                }
            });
        }

        return list;
    }, [projects, toolGroups, customTenants, consumerFilter, searchQuery]);

    // 4. Build Flow Graph Nodes and Edges
    const { nodes, edges } = useMemo(() => {
        const generatedNodes: Node[] = [];
        const generatedEdges: Edge[] = [];

        const consumerX = 60;
        const consumerYSpacing = 110;
        const engineX = 640;

        // Generate Consumer Nodes (Left column)
        visibleConsumers.forEach((consumer, i) => {
            const isApp = consumer.kind === 'app';
            const isTool = consumer.kind === 'tool';
            const consumerId = isApp
                ? `consumer-app-${consumer.project.id}`
                : isTool
                  ? `consumer-tool-${consumer.tool.slug}`
                  : `consumer-custom-${consumer.tenant.name}`;

            const isSelected = isApp
                ? selection?.type === 'app' &&
                  selection.project.id === consumer.project.id
                : isTool
                  ? selection?.type === 'tool' &&
                    selection.tool.slug === consumer.tool.slug
                  : selection?.type === 'custom' &&
                    selection.tenant.name === consumer.tenant.name;

            let connectedCount = 0;
            if (isApp) {
                if (
                    consumer.project.database &&
                    consumer.project.database !== 'sqlite'
                )
                    connectedCount++;
                if (
                    consumer.project.cache === 'redis' ||
                    consumer.project.plex.includes('redis')
                )
                    connectedCount++;
                if (
                    consumer.project.objectStorage ||
                    consumer.project.plex.includes('s3')
                )
                    connectedCount++;
                if (
                    consumer.project.plex.includes('headless-chrome') ||
                    consumer.project.plex.includes('chrome') ||
                    consumer.project.plex.includes('render')
                )
                    connectedCount++;
            } else if (isTool) {
                if (consumer.tool.databases.length > 0) connectedCount++;
                if (consumer.tool.redisIndexes.length > 0) connectedCount++;
                if (consumer.tool.s3Buckets.length > 0) connectedCount++;
                if (consumer.tool.usesRender) connectedCount++;
            } else {
                if (consumer.tenant.database) connectedCount++;
                if (
                    consumer.tenant.redisIndex !== null &&
                    consumer.tenant.redisIndex !== undefined
                )
                    connectedCount++;
                if (consumer.tenant.s3Bucket) connectedCount++;
            }

            generatedNodes.push({
                id: consumerId,
                type: 'consumer',
                position: { x: consumerX, y: 40 + i * consumerYSpacing },
                data: {
                    consumer,
                    isSelected,
                    connectedCount,
                    onClick: () => {
                        setSelection(
                            isApp
                                ? { type: 'app', project: consumer.project }
                                : isTool
                                  ? { type: 'tool', tool: consumer.tool }
                                  : { type: 'custom', tenant: consumer.tenant },
                        );
                        setShowInspector(true);
                    },
                },
            });
        });

        // Generate Engine Nodes (Right column - balanced & centered vertically)
        const totalConsumerHeight = Math.max(
            visibleConsumers.length * consumerYSpacing,
            420,
        );
        const engineCount = activeEngines.length;
        const engineYSpacing =
            engineCount > 1
                ? Math.min(
                      Math.max(140, totalConsumerHeight / engineCount),
                      200,
                  )
                : 140;
        const engineBlockHeight = Math.max(
            0,
            (engineCount - 1) * engineYSpacing,
        );
        const consumerBlockHeight = Math.max(
            0,
            (visibleConsumers.length - 1) * consumerYSpacing,
        );
        const engineStartY = Math.max(
            40,
            40 + (consumerBlockHeight - engineBlockHeight) / 2,
        );

        activeEngines.forEach((eng, j) => {
            const isSelected =
                selection?.type === 'engine' &&
                selection.engine.driver === eng.driver;

            generatedNodes.push({
                id: `engine-${eng.driver}`,
                type: 'engine',
                position: { x: engineX, y: engineStartY + j * engineYSpacing },
                data: {
                    driver: eng.driver,
                    label: eng.label,
                    categoryKey: eng.categoryKey,
                    categoryLabel: eng.categoryLabel,
                    port: eng.port,
                    ready: eng.ready,
                    podMetrics,
                    tenantsCount: eng.tenants.length,
                    tenants: eng.tenants,
                    isSelected,
                    onClick: () => {
                        setSelection({
                            type: 'engine',
                            engine: {
                                ...eng,
                                tenantsCount: eng.tenants.length,
                                isSelected: true,
                            },
                        });
                        setShowInspector(true);
                    },
                },
            });
        });

        // Helper to compute selection & dimming for conduits
        const isConduitTarget = (
            cid: string,
            consumerKind: 'app' | 'tool' | 'custom',
            consumerIdent: number | string,
            driver: string,
        ) => {
            if (!selection) return { isSelected: false, isDimmed: false };
            if (selection.type === 'conduit') {
                return {
                    isSelected: selection.conduit.id === cid,
                    isDimmed: selection.conduit.id !== cid,
                };
            }
            if (selection.type === 'app' && consumerKind === 'app') {
                const match = selection.project.id === consumerIdent;
                return { isSelected: match, isDimmed: !match };
            }
            if (selection.type === 'tool' && consumerKind === 'tool') {
                const match = selection.tool.slug === consumerIdent;
                return { isSelected: match, isDimmed: !match };
            }
            if (selection.type === 'custom' && consumerKind === 'custom') {
                const match = selection.tenant.name === consumerIdent;
                return { isSelected: match, isDimmed: !match };
            }
            if (selection.type === 'engine') {
                const match = selection.engine.driver === driver;
                return { isSelected: match, isDimmed: !match };
            }
            return { isSelected: false, isDimmed: true };
        };

        // Generate Conduits for visible consumers
        visibleConsumers.forEach((consumer) => {
            if (consumer.kind === 'app') {
                const proj = consumer.project;
                const sourceId = `consumer-app-${proj.id}`;

                // Database Conduit
                if (proj.database && proj.database !== 'sqlite') {
                    const dbEngine =
                        activeEngines.find(
                            (e) =>
                                e.categoryKey === 'database' &&
                                (e.driver.includes(proj.database!) ||
                                    proj.database!.includes(e.driver)),
                        ) ||
                        activeEngines.find((e) => e.categoryKey === 'database');

                    if (dbEngine) {
                        const conduitId = `conduit-app-${proj.id}-${dbEngine.driver}`;
                        const status = isConduitTarget(
                            conduitId,
                            'app',
                            proj.id,
                            dbEngine.driver,
                        );

                        generatedEdges.push({
                            id: conduitId,
                            type: 'conduit',
                            source: sourceId,
                            target: `engine-${dbEngine.driver}`,
                            data: {
                                id: conduitId,
                                fromName: proj.name,
                                toEngine: dbEngine.label,
                                serviceType: 'database',
                                label: `:${dbEngine.port || '5432'}`,
                                details: {
                                    databaseName: `${proj.name}_db`,
                                    port: dbEngine.port || '5432',
                                    protocol: 'TCP (PDO)',
                                },
                                isActive: true,
                                isSelected: status.isSelected,
                                isDimmed: status.isDimmed,
                                onClick: () => {
                                    setSelection({
                                        type: 'conduit',
                                        conduit: {
                                            id: conduitId,
                                            fromName: proj.name,
                                            toEngine: dbEngine.label,
                                            serviceType: 'database',
                                            label: `:${dbEngine.port || '5432'}`,
                                            details: {
                                                databaseName: `${proj.name}_db`,
                                                port: dbEngine.port || '5432',
                                                protocol: 'TCP (PDO)',
                                            },
                                            isActive: true,
                                            isSelected: true,
                                        },
                                    });
                                    setShowInspector(true);
                                },
                            },
                        });
                    }
                }

                // Cache Conduit
                if (proj.cache === 'redis' || proj.plex.includes('redis')) {
                    const redisEngine = activeEngines.find(
                        (e) =>
                            e.driver.includes('redis') ||
                            e.categoryKey === 'cache',
                    );
                    if (redisEngine) {
                        const conduitId = `conduit-app-${proj.id}-${redisEngine.driver}`;
                        const status = isConduitTarget(
                            conduitId,
                            'app',
                            proj.id,
                            redisEngine.driver,
                        );

                        generatedEdges.push({
                            id: conduitId,
                            type: 'conduit',
                            source: sourceId,
                            target: `engine-${redisEngine.driver}`,
                            data: {
                                id: conduitId,
                                fromName: proj.name,
                                toEngine: redisEngine.label,
                                serviceType: 'cache',
                                label: `:${redisEngine.port || '6379'}`,
                                details: {
                                    redisIndex: 0,
                                    port: redisEngine.port || '6379',
                                    protocol: 'RESP (TCP)',
                                },
                                isActive: true,
                                isSelected: status.isSelected,
                                isDimmed: status.isDimmed,
                                onClick: () => {
                                    setSelection({
                                        type: 'conduit',
                                        conduit: {
                                            id: conduitId,
                                            fromName: proj.name,
                                            toEngine: redisEngine.label,
                                            serviceType: 'cache',
                                            label: `:${redisEngine.port || '6379'}`,
                                            details: {
                                                redisIndex: 0,
                                                port:
                                                    redisEngine.port || '6379',
                                                protocol: 'RESP (TCP)',
                                            },
                                            isActive: true,
                                            isSelected: true,
                                        },
                                    });
                                    setShowInspector(true);
                                },
                            },
                        });
                    }
                }

                // Storage Conduit
                if (proj.objectStorage || proj.plex.includes('s3')) {
                    const storageEngine = activeEngines.find(
                        (e) => e.categoryKey === 'storage',
                    );
                    if (storageEngine) {
                        const conduitId = `conduit-app-${proj.id}-${storageEngine.driver}`;
                        const status = isConduitTarget(
                            conduitId,
                            'app',
                            proj.id,
                            storageEngine.driver,
                        );

                        generatedEdges.push({
                            id: conduitId,
                            type: 'conduit',
                            source: sourceId,
                            target: `engine-${storageEngine.driver}`,
                            data: {
                                id: conduitId,
                                fromName: proj.name,
                                toEngine: storageEngine.label,
                                serviceType: 'storage',
                                label: `:${storageEngine.port || '8333'}`,
                                details: {
                                    bucketName: `${proj.name}-media`,
                                    port: storageEngine.port || '8333',
                                    protocol: 'S3 API (HTTP)',
                                },
                                isActive: true,
                                isSelected: status.isSelected,
                                isDimmed: status.isDimmed,
                                onClick: () => {
                                    setSelection({
                                        type: 'conduit',
                                        conduit: {
                                            id: conduitId,
                                            fromName: proj.name,
                                            toEngine: storageEngine.label,
                                            serviceType: 'storage',
                                            label: `:${storageEngine.port || '8333'}`,
                                            details: {
                                                bucketName: `${proj.name}-media`,
                                                port:
                                                    storageEngine.port ||
                                                    '8333',
                                                protocol: 'S3 API (HTTP)',
                                            },
                                            isActive: true,
                                            isSelected: true,
                                        },
                                    });
                                    setShowInspector(true);
                                },
                            },
                        });
                    }
                }

                // Render Conduit for Apps (Browsershot / Headless Chrome)
                if (
                    proj.plex.includes('headless-chrome') ||
                    proj.plex.includes('chrome') ||
                    proj.plex.includes('render')
                ) {
                    const renderEngine = activeEngines.find(
                        (e) =>
                            e.categoryKey === 'render' ||
                            e.driver.includes('headless') ||
                            e.driver.includes('chrome'),
                    );
                    if (renderEngine) {
                        const conduitId = `conduit-app-${proj.id}-${renderEngine.driver}`;
                        const status = isConduitTarget(
                            conduitId,
                            'app',
                            proj.id,
                            renderEngine.driver,
                        );

                        generatedEdges.push({
                            id: conduitId,
                            type: 'conduit',
                            source: sourceId,
                            target: `engine-${renderEngine.driver}`,
                            data: {
                                id: conduitId,
                                fromName: proj.name,
                                toEngine: renderEngine.label,
                                serviceType: 'render',
                                label: `:${renderEngine.port || '9222'}`,
                                details: {
                                    purpose: 'Browsershot & PDF Rendering',
                                    port: renderEngine.port || '9222',
                                    protocol: 'CDP (WebSocket/HTTP)',
                                },
                                isActive: true,
                                isSelected: status.isSelected,
                                isDimmed: status.isDimmed,
                                onClick: () => {
                                    setSelection({
                                        type: 'conduit',
                                        conduit: {
                                            id: conduitId,
                                            fromName: proj.name,
                                            toEngine: renderEngine.label,
                                            serviceType: 'render',
                                            label: `:${renderEngine.port || '9222'}`,
                                            details: {
                                                purpose:
                                                    'Browsershot & PDF Rendering',
                                                port:
                                                    renderEngine.port || '9222',
                                                protocol:
                                                    'CDP (WebSocket/HTTP)',
                                            },
                                            isActive: true,
                                            isSelected: true,
                                        },
                                    });
                                    setShowInspector(true);
                                },
                            },
                        });
                    }
                }
            } else if (consumer.kind === 'tool') {
                // Tool Consumer
                const tool = consumer.tool;
                const sourceId = `consumer-tool-${tool.slug}`;

                // Database Conduit
                if (tool.databases.length > 0) {
                    const dbEngine = activeEngines.find(
                        (e) => e.categoryKey === 'database',
                    );
                    if (dbEngine) {
                        const conduitId = `conduit-tool-${tool.slug}-${dbEngine.driver}`;
                        const status = isConduitTarget(
                            conduitId,
                            'tool',
                            tool.slug,
                            dbEngine.driver,
                        );

                        generatedEdges.push({
                            id: conduitId,
                            type: 'conduit',
                            source: sourceId,
                            target: `engine-${dbEngine.driver}`,
                            data: {
                                id: conduitId,
                                fromName: tool.name,
                                toEngine: dbEngine.label,
                                serviceType: 'database',
                                label: `:${dbEngine.port || '5432'}`,
                                details: {
                                    databaseName: tool.databases.join(', '),
                                    port: dbEngine.port || '5432',
                                    protocol: 'TCP (PostgreSQL)',
                                },
                                isActive: true,
                                isSelected: status.isSelected,
                                isDimmed: status.isDimmed,
                                onClick: () => {
                                    setSelection({
                                        type: 'conduit',
                                        conduit: {
                                            id: conduitId,
                                            fromName: tool.name,
                                            toEngine: dbEngine.label,
                                            serviceType: 'database',
                                            label: `:${dbEngine.port || '5432'}`,
                                            details: {
                                                databaseName:
                                                    tool.databases.join(', '),
                                                port: dbEngine.port || '5432',
                                                protocol: 'TCP (PostgreSQL)',
                                            },
                                            isActive: true,
                                            isSelected: true,
                                        },
                                    });
                                    setShowInspector(true);
                                },
                            },
                        });
                    }
                }

                // Cache Conduit
                if (tool.redisIndexes.length > 0) {
                    const redisEngine = activeEngines.find(
                        (e) =>
                            e.driver.includes('redis') ||
                            e.categoryKey === 'cache',
                    );
                    if (redisEngine) {
                        const conduitId = `conduit-tool-${tool.slug}-${redisEngine.driver}`;
                        const status = isConduitTarget(
                            conduitId,
                            'tool',
                            tool.slug,
                            redisEngine.driver,
                        );

                        generatedEdges.push({
                            id: conduitId,
                            type: 'conduit',
                            source: sourceId,
                            target: `engine-${redisEngine.driver}`,
                            data: {
                                id: conduitId,
                                fromName: tool.name,
                                toEngine: redisEngine.label,
                                serviceType: 'cache',
                                label: `:${redisEngine.port || '6379'}`,
                                details: {
                                    redisIndex: `Index ${tool.redisIndexes.join(', ')}`,
                                    port: redisEngine.port || '6379',
                                    protocol: 'RESP (TCP)',
                                },
                                isActive: true,
                                isSelected: status.isSelected,
                                isDimmed: status.isDimmed,
                                onClick: () => {
                                    setSelection({
                                        type: 'conduit',
                                        conduit: {
                                            id: conduitId,
                                            fromName: tool.name,
                                            toEngine: redisEngine.label,
                                            serviceType: 'cache',
                                            label: `:${redisEngine.port || '6379'}`,
                                            details: {
                                                redisIndex: `Index ${tool.redisIndexes.join(', ')}`,
                                                port:
                                                    redisEngine.port || '6379',
                                                protocol: 'RESP (TCP)',
                                            },
                                            isActive: true,
                                            isSelected: true,
                                        },
                                    });
                                    setShowInspector(true);
                                },
                            },
                        });
                    }
                }

                // Storage Conduit
                if (tool.s3Buckets.length > 0) {
                    const storageEngine = activeEngines.find(
                        (e) => e.categoryKey === 'storage',
                    );
                    if (storageEngine) {
                        const conduitId = `conduit-tool-${tool.slug}-${storageEngine.driver}`;
                        const status = isConduitTarget(
                            conduitId,
                            'tool',
                            tool.slug,
                            storageEngine.driver,
                        );

                        generatedEdges.push({
                            id: conduitId,
                            type: 'conduit',
                            source: sourceId,
                            target: `engine-${storageEngine.driver}`,
                            data: {
                                id: conduitId,
                                fromName: tool.name,
                                toEngine: storageEngine.label,
                                serviceType: 'storage',
                                label: `:${storageEngine.port || '8333'}`,
                                details: {
                                    bucketName: tool.s3Buckets.join(', '),
                                    port: storageEngine.port || '8333',
                                    protocol: 'S3 API (HTTP)',
                                },
                                isActive: true,
                                isSelected: status.isSelected,
                                isDimmed: status.isDimmed,
                                onClick: () => {
                                    setSelection({
                                        type: 'conduit',
                                        conduit: {
                                            id: conduitId,
                                            fromName: tool.name,
                                            toEngine: storageEngine.label,
                                            serviceType: 'storage',
                                            label: `:${storageEngine.port || '8333'}`,
                                            details: {
                                                bucketName:
                                                    tool.s3Buckets.join(', '),
                                                port:
                                                    storageEngine.port ||
                                                    '8333',
                                                protocol: 'S3 API (HTTP)',
                                            },
                                            isActive: true,
                                            isSelected: true,
                                        },
                                    });
                                    setShowInspector(true);
                                },
                            },
                        });
                    }
                }

                // Render / Headless Chrome Conduit (Documenso PDF certificate sealing)
                if (tool.usesRender) {
                    const renderEngine = activeEngines.find(
                        (e) =>
                            e.categoryKey === 'render' ||
                            e.driver.includes('headless') ||
                            e.driver.includes('chrome'),
                    );
                    if (renderEngine) {
                        const conduitId = `conduit-tool-${tool.slug}-${renderEngine.driver}`;
                        const status = isConduitTarget(
                            conduitId,
                            'tool',
                            tool.slug,
                            renderEngine.driver,
                        );

                        generatedEdges.push({
                            id: conduitId,
                            type: 'conduit',
                            source: sourceId,
                            target: `engine-${renderEngine.driver}`,
                            data: {
                                id: conduitId,
                                fromName: tool.name,
                                toEngine: renderEngine.label,
                                serviceType: 'render',
                                label: `:${renderEngine.port || '9222'}`,
                                details: {
                                    purpose:
                                        'Certificate & Document PDF Sealing',
                                    port: renderEngine.port || '9222',
                                    protocol: 'CDP (WebSocket/HTTP)',
                                },
                                isActive: true,
                                isSelected: status.isSelected,
                                isDimmed: status.isDimmed,
                                onClick: () => {
                                    setSelection({
                                        type: 'conduit',
                                        conduit: {
                                            id: conduitId,
                                            fromName: tool.name,
                                            toEngine: renderEngine.label,
                                            serviceType: 'render',
                                            label: `:${renderEngine.port || '9222'}`,
                                            details: {
                                                purpose:
                                                    'Certificate & Document PDF Sealing',
                                                port:
                                                    renderEngine.port || '9222',
                                                protocol:
                                                    'CDP (WebSocket/HTTP)',
                                            },
                                            isActive: true,
                                            isSelected: true,
                                        },
                                    });
                                    setShowInspector(true);
                                },
                            },
                        });
                    }
                }
            } else if (consumer.kind === 'custom') {
                const t = consumer.tenant;
                const sourceId = `consumer-custom-${t.name}`;

                // Database Conduit
                if (t.database) {
                    const dbEngine = activeEngines.find(
                        (e) => e.categoryKey === 'database',
                    );
                    if (dbEngine) {
                        const conduitId = `conduit-custom-${t.name}-${dbEngine.driver}`;
                        const status = isConduitTarget(
                            conduitId,
                            'custom',
                            t.name,
                            dbEngine.driver,
                        );

                        generatedEdges.push({
                            id: conduitId,
                            type: 'conduit',
                            source: sourceId,
                            target: `engine-${dbEngine.driver}`,
                            data: {
                                id: conduitId,
                                fromName: t.name,
                                toEngine: dbEngine.label,
                                serviceType: 'database',
                                label: `:${dbEngine.port || '5432'}`,
                                details: {
                                    databaseName: t.database,
                                    port: dbEngine.port || '5432',
                                    protocol: 'TCP (PostgreSQL)',
                                },
                                isActive: true,
                                isSelected: status.isSelected,
                                isDimmed: status.isDimmed,
                                onClick: () => {
                                    setSelection({
                                        type: 'conduit',
                                        conduit: {
                                            id: conduitId,
                                            fromName: t.name,
                                            toEngine: dbEngine.label,
                                            serviceType: 'database',
                                            label: `:${dbEngine.port || '5432'}`,
                                            details: {
                                                databaseName: t.database,
                                                port: dbEngine.port || '5432',
                                                protocol: 'TCP (PostgreSQL)',
                                            },
                                            isActive: true,
                                            isSelected: true,
                                        },
                                    });
                                    setShowInspector(true);
                                },
                            },
                        });
                    }
                }

                // Redis Cache Conduit
                if (t.redisIndex !== null && t.redisIndex !== undefined) {
                    const redisEngine = activeEngines.find(
                        (e) =>
                            e.driver.includes('redis') ||
                            e.categoryKey === 'cache',
                    );
                    if (redisEngine) {
                        const conduitId = `conduit-custom-${t.name}-${redisEngine.driver}`;
                        const status = isConduitTarget(
                            conduitId,
                            'custom',
                            t.name,
                            redisEngine.driver,
                        );

                        generatedEdges.push({
                            id: conduitId,
                            type: 'conduit',
                            source: sourceId,
                            target: `engine-${redisEngine.driver}`,
                            data: {
                                id: conduitId,
                                fromName: t.name,
                                toEngine: redisEngine.label,
                                serviceType: 'cache',
                                label: `:${redisEngine.port || '6379'}`,
                                details: {
                                    redisIndex: `Index ${t.redisIndex}`,
                                    port: redisEngine.port || '6379',
                                    protocol: 'RESP (TCP)',
                                },
                                isActive: true,
                                isSelected: status.isSelected,
                                isDimmed: status.isDimmed,
                                onClick: () => {
                                    setSelection({
                                        type: 'conduit',
                                        conduit: {
                                            id: conduitId,
                                            fromName: t.name,
                                            toEngine: redisEngine.label,
                                            serviceType: 'cache',
                                            label: `:${redisEngine.port || '6379'}`,
                                            details: {
                                                redisIndex: `Index ${t.redisIndex}`,
                                                port:
                                                    redisEngine.port || '6379',
                                                protocol: 'RESP (TCP)',
                                            },
                                            isActive: true,
                                            isSelected: true,
                                        },
                                    });
                                    setShowInspector(true);
                                },
                            },
                        });
                    }
                }

                // Storage Conduit
                if (t.s3Bucket) {
                    const storageEngine = activeEngines.find(
                        (e) => e.categoryKey === 'storage',
                    );
                    if (storageEngine) {
                        const conduitId = `conduit-custom-${t.name}-${storageEngine.driver}`;
                        const status = isConduitTarget(
                            conduitId,
                            'custom',
                            t.name,
                            storageEngine.driver,
                        );

                        generatedEdges.push({
                            id: conduitId,
                            type: 'conduit',
                            source: sourceId,
                            target: `engine-${storageEngine.driver}`,
                            data: {
                                id: conduitId,
                                fromName: t.name,
                                toEngine: storageEngine.label,
                                serviceType: 'storage',
                                label: `:${storageEngine.port || '8333'}`,
                                details: {
                                    bucketName: t.s3Bucket,
                                    port: storageEngine.port || '8333',
                                    protocol: 'S3 API (HTTP)',
                                },
                                isActive: true,
                                isSelected: status.isSelected,
                                isDimmed: status.isDimmed,
                                onClick: () => {
                                    setSelection({
                                        type: 'conduit',
                                        conduit: {
                                            id: conduitId,
                                            fromName: t.name,
                                            toEngine: storageEngine.label,
                                            serviceType: 'storage',
                                            label: `:${storageEngine.port || '8333'}`,
                                            details: {
                                                bucketName: t.s3Bucket,
                                                port:
                                                    storageEngine.port ||
                                                    '8333',
                                                protocol: 'S3 API (HTTP)',
                                            },
                                            isActive: true,
                                            isSelected: true,
                                        },
                                    });
                                    setShowInspector(true);
                                },
                            },
                        });
                    }
                }
            }
        });

        return { nodes: generatedNodes, edges: generatedEdges };
    }, [visibleConsumers, activeEngines, selection, podMetrics]);

    return (
        <div
            className={cn(
                'flex flex-col gap-3 transition-all',
                isFullscreen
                    ? 'bg-background/95 fixed inset-0 z-50 p-6 backdrop-blur-md'
                    : 'relative',
            )}
        >
            {/* Toolbar Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="flex items-center gap-1.5 rounded-xl border border-line bg-paper/50 px-3 py-1 font-mono text-xs font-semibold text-ink">
                        <Network className="size-3.5 text-brand" />
                        <span>Cluster Context: {server.name}</span>
                    </span>

                    <div className="flex items-center gap-2 font-mono text-[11px] text-faint">
                        <span>{projects.length} Apps</span>
                        <span>•</span>
                        <span>{toolGroups.length} Tools</span>
                        {customTenants.length > 0 && (
                            <>
                                <span>•</span>
                                <span>{customTenants.length} Custom</span>
                            </>
                        )}
                        <span>•</span>
                        <span>{activeEngines.length} Shared Engines</span>
                        <span>•</span>
                        <span>{edges.length} Active Conduits</span>
                    </div>

                    {/* Consumer Filter Tabs */}
                    <div className="flex items-center rounded-lg border border-line bg-paper/70 p-0.5 text-xs">
                        <button
                            type="button"
                            onClick={() => setConsumerFilter('all')}
                            className={cn(
                                'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition',
                                consumerFilter === 'all'
                                    ? 'bg-surface font-semibold text-ink shadow-xs'
                                    : 'text-soft hover:text-ink',
                            )}
                        >
                            <Boxes className="size-3" />
                            <span>
                                All (
                                {projects.length +
                                    toolGroups.length +
                                    customTenants.length}
                                )
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setConsumerFilter('apps')}
                            className={cn(
                                'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition',
                                consumerFilter === 'apps'
                                    ? 'bg-surface font-semibold text-ink shadow-xs'
                                    : 'text-soft hover:text-ink',
                            )}
                        >
                            <Code2 className="size-3" />
                            <span>Apps ({projects.length})</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setConsumerFilter('tools')}
                            className={cn(
                                'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition',
                                consumerFilter === 'tools'
                                    ? 'bg-surface font-semibold text-ink shadow-xs'
                                    : 'text-soft hover:text-ink',
                            )}
                        >
                            <Wrench className="size-3" />
                            <span>Tools ({toolGroups.length})</span>
                        </button>
                        {customTenants.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setConsumerFilter('custom')}
                                className={cn(
                                    'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition',
                                    consumerFilter === 'custom'
                                        ? 'bg-surface font-semibold text-ink shadow-xs'
                                        : 'text-soft hover:text-ink',
                                )}
                            >
                                <Layers className="size-3 text-emerald-500" />
                                <span>Custom ({customTenants.length})</span>
                            </button>
                        )}
                    </div>

                    {/* Search Consumer Filter */}
                    <div className="relative">
                        <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Find consumer..."
                            className="h-7 w-32 rounded-lg border border-line bg-paper/60 pr-6 pl-7 text-xs text-ink transition-all outline-none placeholder:text-faint focus:w-44 focus:border-brand focus:bg-surface focus:ring-1 focus:ring-brand"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute top-1/2 right-2 -translate-y-1/2 text-faint hover:text-ink"
                            >
                                <X className="size-3" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowInspector(!showInspector)}
                        className="gap-1.5 text-xs text-soft hover:text-ink"
                    >
                        <PanelRight className="size-3.5" />
                        <span>
                            {showInspector
                                ? 'Hide Inspector'
                                : 'Show Inspector'}
                        </span>
                    </Button>

                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="gap-1.5 text-xs text-soft hover:text-ink"
                        title={
                            isFullscreen
                                ? 'Exit Fullscreen (Esc)'
                                : 'Expand to Fullscreen'
                        }
                    >
                        {isFullscreen ? (
                            <>
                                <Minimize2 className="size-3.5" />
                                <span>Exit Fullscreen</span>
                            </>
                        ) : (
                            <>
                                <Maximize2 className="size-3.5" />
                                <span>Fullscreen</span>
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {/* Canvas Container */}
            <div
                className={cn(
                    'relative flex overflow-hidden rounded-2xl border border-line bg-surface shadow-xs transition-all duration-200',
                    isFullscreen ? 'min-h-0 flex-1' : 'h-[620px]',
                )}
            >
                <div className="h-full min-w-0 flex-1">
                    <ReactFlowProvider>
                        <TopologyFlow
                            nodes={nodes}
                            edges={edges}
                            isFullscreen={isFullscreen}
                            consumerFilter={consumerFilter}
                            onSelectNode={(n) => {
                                if (n.type === 'consumer' || n.type === 'app') {
                                    const data =
                                        n.data as unknown as TopologyConsumerNodeData;
                                    if (data.consumer) {
                                        setSelection(
                                            data.consumer.kind === 'app'
                                                ? {
                                                      type: 'app',
                                                      project:
                                                          data.consumer.project,
                                                  }
                                                : data.consumer.kind === 'tool'
                                                  ? {
                                                        type: 'tool',
                                                        tool: data.consumer
                                                            .tool,
                                                    }
                                                  : {
                                                        type: 'custom',
                                                        tenant: data.consumer
                                                            .tenant,
                                                    },
                                        );
                                        setShowInspector(true);
                                    }
                                } else if (n.type === 'engine') {
                                    setSelection({
                                        type: 'engine',
                                        engine: n.data as unknown as TopologyEngineNodeData,
                                    });
                                    setShowInspector(true);
                                }
                            }}
                            onSelectEdge={(e) => {
                                if (e.data) {
                                    setSelection({
                                        type: 'conduit',
                                        conduit: e.data as any,
                                    });
                                    setShowInspector(true);
                                }
                            }}
                        />
                    </ReactFlowProvider>
                </div>

                {/* Side Inspector Drawer */}
                {showInspector && selection && (
                    <TopologyInspector
                        selection={selection}
                        onClose={() => setSelection(null)}
                    />
                )}
            </div>
        </div>
    );
}
