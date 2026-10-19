export type SimulatorHopId =
    | 'client'
    | 'dns'
    | 'ingress'
    | 'service'
    | 'pod'
    | 'database';

export type SimulatorHop = {
    id: SimulatorHopId;
    title: string;
    subtitle: string;
    layer: string;
    icon: string;
    badge: string;
    summary: string;
    mechanics: string[];
    technicalDetails: {
        protocol: string;
        port: string;
        headers?: Record<string, string>;
        query?: string;
        payload?: string;
        responseCode?: number;
        latencyMs: number;
    };
};

export type ScenarioKind =
    | 'healthy_web'
    | 'healthy_api'
    | 'fault_database'
    | 'fault_pod'
    | 'not_found';

export type SimulatorScenario = {
    id: ScenarioKind;
    name: string;
    description: string;
    statusCode: number;
    tone: 'ok' | 'bad' | 'warn';
    hops: SimulatorHop[];
};

export type ProjectPreset = {
    id: string;
    name: string;
    framework: string;
    webHost: string;
    database: string;
    databaseName: string;
    cache: string;
    description: string;
};

export type SimulatorProject = {
    id: number;
    name: string;
    framework: string;
    webHost?: string | null;
    path: string;
    exists: boolean;
    database: string;
    cache: string;
};

export type SimulatorServer = {
    id: number;
    name: string;
    provider: string;
    role: string;
    isLocal: boolean;
};

export type SimulatorPageProps = {
    projects: SimulatorProject[];
    servers: SimulatorServer[];
    presets: ProjectPreset[];
    initialProjectId?: number | null;
};
