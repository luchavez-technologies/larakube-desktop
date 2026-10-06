export type Tool = {
    slug: string;
    label: string;
    purpose: string;
    required: boolean;
    installable: boolean;
    localOnly: boolean;
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
    defaultDevBoxSize?: string;
    /** Where the regions and prices come from: the provider's own list now, an earlier copy of it, or the CLI's built-in estimate. */
    pricing?: {
        source: 'live' | 'cached' | 'builtin';
        asOf: string | null;
        currency: string | null;
    };
    credentials: { ready: boolean; hint: string | null };
};

export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';

export type RunKind =
    | 'create-server'
    | 'create-dev-box'
    | 'new-dev-box-project'
    | 'operate-dev-box-project'
    | 'share-domain-dev-box-project'
    | 'remove-domain-dev-box-project'
    | 'update-dev-box-cli'
    | 'destroy-server'
    | 'restart-server'
    | 'install-tool'
    | 'install-cluster-tool'
    | 'remove-cluster-tool'
    | 'connect-domain'
    | 'enable-ssl'
    | 'new-project'
    | 'init-project'
    | 'link-server'
    | 'configure-host'
    | 'deploy-app'
    | 'up-project'
    | 'down-project'
    | 'start-project'
    | 'stop-project'
    | 'backup-init'
    | 'backup-schedule'
    | 'backup-unschedule'
    | 'backup-run'
    | 'backup-check'
    | 'backup-restore'
    | 'backup-prune'
    | 'plex-init'
    | 'plex-start'
    | 'plex-stop'
    | 'plex-join'
    | 'plex-leave'
    | 'context-import'
    | 'context-switch'
    | 'context-backup'
    | 'context-restore'
    | 'context-remove'
    | 'cluster-grant'
    | 'cluster-revoke'
    | 'companion-add'
    | 'companion-remove'
    | 'companion-start'
    | 'companion-stop'
    | 'cloud-auth';

export type Run = {
    id: number;
    label: string;
    kind: RunKind | null;
    subject: string | null;
    targetType?: string | null;
    targetName?: string | null;
    projectId?: number | null;
    projectName?: string | null;
    environment?: string | null;
    serverName?: string | null;
    context?: string | null;
    tool?: string | null;
    meta: {
        server?: string;
        context?: string;
        tool?: string;
        /** 'dev' when the run acts on a dev box. */
        role?: string;
        project?: string;
        app?: string;
        teammate?: string;
        cluster?: boolean;
        scope?: string;
        kubeconfigPath?: string;
        rbacPath?: string;
        [key: string]: unknown;
    } | null;
    status: RunStatus;
    exitCode: number | null;
    output: string;
    result: Record<string, unknown> | null;
    startedAt: string | null;
    finishedAt: string | null;
};

export type RunTargetType =
    | 'project'
    | 'server'
    | 'tool'
    | 'companion'
    | 'context'
    | 'system';

export type RunSummary = Pick<
    Run,
    'id' | 'label' | 'kind' | 'status' | 'startedAt' | 'finishedAt'
> & {
    targetType: RunTargetType;
    targetName: string | null;
    targetUrl: string | null;
    environment: string | null;
};

/** A project on a dev box, as `project:list` reports it. */
export type DevBoxProject = {
    name: string;
    path: string;
    framework: string | null;
    environments: { name: string; host: string | null }[];
    local: 'running' | 'stopped';
};

export type ServerStatus = 'ready' | 'incomplete' | 'unfinished';

export type Server = {
    name: string;
    provider: string;
    kind: string;
    region: string | null;
    ip: string | null;
    context: string | null;
    account?: string | null;
    projectId?: string | null;
    /** 'dev' for a dev box; a server apps run on is 'deploy' (or absent). */
    role?: string;
    status: ServerStatus;
    isCurrent?: boolean;
};

export type ServerDomain = {
    domain: string;
    externalDns: boolean;
    tls: boolean;
    inUse?: boolean;
};

export const providerLabels: Record<string, string> = {
    do: 'DigitalOcean',
    hetzner: 'Hetzner Cloud',
    gcp: 'Google Cloud',
    aws: 'Amazon Web Services',
    orbstack: 'OrbStack',
    docker: 'Docker Desktop',
    minikube: 'Minikube',
    k3d: 'K3d',
    kind: 'KinD',
    local: 'Local Cluster',
    cloud: 'External Cluster',
};

/** tool:list wiring cell: wired, unwired, mesh, public, synced, unsynced, OpenBao, N/A or —. */
export type Wiring = string;

export type ClusterToolComponent = {
    key: string;
    label: string;
    role: string;
    deployment: string;
    container?: string;
    description?: string;
    backup?: boolean;
};

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
    categories?: string[];
    /** The product's own name (e.g. Twenty), never the category. */
    name?: string;
    tagline?: string;
    stack?: string[];
    /** What to draw: an id a renderer knows, or later a URL. */
    logo?: string;
    paid?: boolean;
    /** The exact command that removes this instance. */
    removeCommand?: string;
    components?: ClusterToolComponent[];
    sso: Wiring;
    mail: Wiring;
    vpn: Wiring;
    sync: Wiring;
    rotation: Wiring;
    requiresAdminEmail?: boolean;
    /** Whether more than one instance of the tool can run on a server. */
    multiInstance?: boolean;
    /** What the CLI asks when installing this tool, in the same shape as a framework's fields. */
    initFields?: FrameworkField[];
};

export function toolCategories(tool: {
    tool?: string;
    categories?: string[];
    label?: string;
    brand?: string;
}): string[] {
    return tool.categories && tool.categories.length > 0
        ? tool.categories
        : ['productivity'];
}

export function categoryLabel(category: string): string {
    const labels: Record<string, string> = {
        database: 'Database',
        backend: 'Backend',
        auth: 'Auth',
        security: 'Security',
        communication: 'Communication',
        observability: 'Observability',
        productivity: 'Productivity',
        devops: 'DevOps',
        analytics: 'Analytics',
        storage: 'Storage',
    };
    return (
        labels[category] ?? category.charAt(0).toUpperCase() + category.slice(1)
    );
}

export function toolStack(tool: {
    stack?: string[];
    components?: ClusterToolComponent[];
}): string[] {
    if (tool.stack && tool.stack.length > 0) {
        return tool.stack;
    }
    if (tool.components && tool.components.length > 1) {
        const unique = new Set<string>();
        for (const c of tool.components) {
            if (c.role === 'database') continue;
            unique.add(
                c.label || c.key.charAt(0).toUpperCase() + c.key.slice(1),
            );
        }
        return Array.from(unique);
    }
    return [];
}

export function toolTagline(tool: {
    tagline?: string;
    label?: string;
}): string {
    if (tool.tagline) {
        return tool.tagline;
    }
    if (tool.label) {
        const { engine, summary } = describeTool(tool.label);
        return summary || engine || '';
    }
    return '';
}

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

/** The product's name as the CLI sends it, never a category. */
export function toolName(tool: {
    name?: string;
    brand?: string;
    label?: string;
}): string {
    if (tool.name) {
        return tool.name;
    }

    const brand = (tool.brand ?? '').replace(/\s*\[[^\]]*\]$/, '').trim();

    return brand || (tool.label ? describeTool(tool.label).summary : 'Tool');
}

export type ProjectEnvironment = {
    name: string;
    isLocal: boolean;
    webHost: string | null;
    serverIp: string | null;
    serverContext?: string | null;
    serverName?: string | null;
    plex?: string[];
    managed?: string[];
};

export type PlexStatus = {
    initialized: boolean;
    services: Record<
        string,
        { service?: string; host?: string; port?: number } | string
    >;
    tenants: Record<
        string,
        {
            db?: string;
            db_service?: string;
            redis_index?: number;
            s3_bucket?: string;
            namespace?: string;
        }
    >;
};

export type ClusterUser = {
    name: string;
    person: string;
    namespace: string;
    createdAt: string | null;
};

export type CompanionApp = {
    slug: string;
    name: string;
    description: string;
    icon: string;
    installed: boolean;
    running: boolean;
    paused: boolean;
    url: string | null;
};

export type LocalProjectState =
    | 'running'
    | 'paused'
    | 'starting'
    | 'stopping'
    | 'down'
    | 'uninitialized';

export type LocalProjectStatus = {
    state: LocalProjectState;
    label: string;
    tone: 'ok' | 'warn' | 'busy' | 'muted';
    domain?: string;
    replicas?: number;
    readyReplicas?: number;
};

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
    serverContext?: string | null;
    deployable: boolean;
    localTld?: string | null;
    globalTld?: string;
    effectiveTld?: string;
    database?: string | null;
    cacheDriver?: string | null;
    objectStorage?: string | null;
    environments?: Record<string, ProjectEnvironment>;
    /** The latest create run's status, on the Projects list only. */
    scaffoldStatus?: RunStatus | null;
    /** Current local Kubernetes cluster status */
    localStatus?: LocalProjectStatus | null;
    /** Active lifecycle run if currently starting, stopping, etc. */
    activeRun?: {
        id: number;
        label: string;
        kind: string | null;
        status: RunStatus;
    } | null;
};

/** One field of a framework's creation form, from `larakube new:frameworks --json`. */
export type FrameworkField = {
    key: string;
    type: 'text' | 'select' | 'multiselect' | 'confirm';
    label: string;
    description?: string;
    placeholder?: string;
    format?: string;
    arg?: string;
    group?: 'essential' | 'advanced';
    /** `commons-opt-out`: ticking it keeps the app out of the shared Commons. */
    role?: string;
    multiple?: boolean;
    nullable?: boolean;
    default?: string | boolean | null;
    /** What a first-time user should start with, where it differs from `default`. */
    suggested?: string;
    options?: {
        value: string;
        label: string;
        flag?: string;
        unavailableWith?: string[];
        /** The Commons service this choice would share. */
        commons?: string;
    }[];
    optionHints?: Record<string, string>;
    conflicts?: string[][];
    visibleWhen?: Record<string, string>;
    forcedWhen?: { when: Record<string, string>; value: string }[];
    defaultWhen?: { when: Record<string, string>; value: string }[];
    implies?: Record<string, Record<string, string>>;
};

export type FrameworkInfo = {
    slug: string;
    label: string;
    description: string;
    category: string;
    tech: string;
    comingSoon?: boolean;
    fields: FrameworkField[];
};

/** The local Commons, as it is now: `null` when there is no local cluster to ask. */
export type CommonsState = {
    context: string;
    initialized: boolean;
    services: Record<string, { enabled?: boolean }>;
} | null;

export type FrameworkCatalog = {
    categories: { id: string; label: string }[];
    frameworks: FrameworkInfo[];
};

/** A select or multiselect question, as the existing-app setup form uses them. */
export type NewAppQuestion = FrameworkField;

export type NewAppAnswers = Record<string, string | string[] | boolean | null>;

export type BackupSchedule = {
    scheduled: boolean;
    cron: string | null;
    timezone: string | null;
    suspended: boolean;
    lastScheduleTime: string | null;
    lastSuccessfulTime: string | null;
};

export type BackupStatus = {
    configured: boolean;
    destination?: { endpoint: string; bucket: string; region: string };
    schedule?: BackupSchedule;
    backups?: {
        available: boolean;
        count: number;
        incomplete: number;
        last: {
            id: string;
            taken: string;
            bytes: number;
            items: number;
        } | null;
        entries: BackupEntry[];
    };
    recoveryCard?: { exists: boolean; path: string };
};

export type BackupEntry = {
    id: string;
    taken: string;
    bytes: number;
    items: number;
};

/** One backing service of a project (database, cache, storage, search), from `services:show --json`. */
export type BackingService = {
    kind: string;
    label: string;
    driver: string | null;
    name: string | null;
    /** commons (shared Plex Commons), managed (the cloud's own), pod, file or none. */
    mode: 'commons' | 'managed' | 'pod' | 'file' | 'none';
    details: { label: string; value: string | null; secret: boolean }[];
};

export type BackingServices = { commons: boolean; services: BackingService[] };
