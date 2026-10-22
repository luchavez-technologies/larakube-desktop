import type {
    PlexTenant,
    PlexTenantClusterTool,
    PodMetrics,
} from '@/types/larakube';

export type TopologyProject = {
    id: number;
    name: string;
    framework: string;
    webHost: string | null;
    path: string;
    exists: boolean;
    database: string | null;
    cache: string | null;
    objectStorage: string | null;
    plex: string[];
};

export type TopologyTool = {
    slug: string;
    name: string;
    tagline: string;
    clusterTool: PlexTenantClusterTool | null;
    databases: string[];
    redisIndexes: number[];
    s3Buckets: string[];
    usesRender?: boolean;
    tenants: PlexTenant[];
};

export type TopologyConsumer =
    | { kind: 'app'; project: TopologyProject }
    | { kind: 'tool'; tool: TopologyTool }
    | { kind: 'custom'; tenant: PlexTenant };

export type TopologyAppNodeData = {
    project: TopologyProject;
    isSelected: boolean;
    connectedCount: number;
    onClick?: () => void;
};

export type TopologyConsumerNodeData = {
    consumer: TopologyConsumer;
    isSelected: boolean;
    connectedCount: number;
    onClick?: () => void;
};

export type TopologyEngineNodeData = {
    driver: string;
    label: string;
    categoryKey: string;
    categoryLabel: string;
    port?: number | string;
    host?: string;
    ready: boolean;
    podMetrics?: PodMetrics | null;
    tenantsCount: number;
    tenants: PlexTenant[];
    isSelected: boolean;
    onClick?: () => void;
};

export type TopologyConduitData = {
    id: string;
    fromName: string;
    toEngine: string;
    serviceType: 'database' | 'cache' | 'storage' | 'search' | 'render';
    label: string;
    details: {
        databaseName?: string | null;
        redisIndex?: number | string | null;
        bucketName?: string | null;
        purpose?: string | null;
        port: string | number;
        protocol: string;
    };
    isActive: boolean;
    isSelected: boolean;
    isDimmed?: boolean;
    onClick?: () => void;
};

export type TopologySelection =
    | { type: 'app'; project: TopologyProject }
    | { type: 'tool'; tool: TopologyTool }
    | { type: 'custom'; tenant: PlexTenant }
    | { type: 'engine'; engine: TopologyEngineNodeData }
    | { type: 'conduit'; conduit: TopologyConduitData }
    | null;
