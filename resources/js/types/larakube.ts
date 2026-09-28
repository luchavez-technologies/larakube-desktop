export type Tool = {
    slug: string;
    label: string;
    purpose: string;
    required: boolean;
    installable: boolean;
    installed: boolean;
    path: string | null;
    version: string | null;
};

export type PickerOption = { value: string; label: string };

export type Provider = {
    slug: string;
    label: string;
    regions: PickerOption[];
    defaultRegion: string;
    vpsSizes: PickerOption[];
    defaultVpsSize: string;
    credentials: { ready: boolean; hint: string | null };
};

export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';

export type RunKind =
    | 'create-server'
    | 'destroy-server'
    | 'install-tool'
    | 'install-cluster-tool'
    | 'remove-cluster-tool'
    | 'connect-domain'
    | 'enable-ssl'
    | 'new-project'
    | 'init-project'
    | 'configure-host'
    | 'deploy-app';

export type Run = {
    id: number;
    label: string;
    kind: RunKind | null;
    subject: string | null;
    meta: {
        server?: string;
        context?: string;
        tool?: string;
        project?: string;
    } | null;
    status: RunStatus;
    exitCode: number | null;
    output: string;
    result: Record<string, unknown> | null;
    startedAt: string | null;
    finishedAt: string | null;
};

export type RunSummary = Pick<
    Run,
    'id' | 'label' | 'kind' | 'status' | 'startedAt' | 'finishedAt'
>;

export type ServerStatus = 'ready' | 'incomplete' | 'unfinished';

export type Server = {
    name: string;
    provider: string;
    kind: string;
    region: string | null;
    ip: string | null;
    context: string | null;
    account: string | null;
    projectId: string | null;
    status: ServerStatus;
};

export const providerLabels: Record<string, string> = {
    do: 'DigitalOcean',
    hetzner: 'Hetzner Cloud',
    gcp: 'Google Cloud',
    aws: 'Amazon Web Services',
};

/** tool:list wiring cell: wired, unwired, mesh, public, synced, unsynced, OpenBao, N/A or —. */
export type Wiring = string;

export type ClusterTool = {
    tool: string;
    instance: string;
    icon: string;
    brand: string;
    label: string;
    installed: boolean;
    namespace: string;
    host: string | null;
    url: string | null;
    installedAt: string | null;
    sso: Wiring;
    mail: Wiring;
    vpn: Wiring;
    sync: Wiring;
    rotation: Wiring;
};

/** "Team Chat (Matrix)" → { summary: "Team Chat", engine: "Matrix" } */
export function describeTool(label: string): {
    summary: string;
    engine: string | null;
} {
    const match = label.match(/^(.*?)\s*\((.*)\)\s*$/);
    return match
        ? { summary: match[1], engine: match[2] }
        : { summary: label, engine: null };
}

/** "Chat [chat-luchtech-dev]" → "Chat": tool:list appends the instance to the brand. */
export function toolName(tool: Pick<ClusterTool, 'brand'>): string {
    return tool.brand.replace(/\s*\[[^\]]*\]$/, '');
}

export type Project = {
    id: number;
    path: string;
    exists: boolean;
    initialized: boolean;
    name: string;
    framework: string | null;
    detectedFramework: string | null;
    webHost: string | null;
    serverIp: string | null;
    deployable: boolean;
};

/** One question `larakube new` asks, from `larakube new:options --json`. */
export type NewAppQuestion = {
    key: string;
    label: string;
    multiple: boolean;
    nullable: boolean;
    default: string | null;
    options: {
        value: string;
        label: string;
        flag: string;
        unavailableWith: string[];
    }[];
    conflicts?: string[][];
    requiresFeature?: string;
};

export type NewAppAnswers = Record<string, string | string[] | null>;
