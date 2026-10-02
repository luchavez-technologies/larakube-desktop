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
        project?: string;
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
    components?: ClusterToolComponent[];
    sso: Wiring;
    mail: Wiring;
    vpn: Wiring;
    sync: Wiring;
    rotation: Wiring;
    requiresAdminEmail?: boolean;
};

export const TOOL_DISPLAY_NAMES: Record<string, string> = {
    twenty: 'Twenty',
    matrix: 'Matrix',
    pocketbase: 'PocketBase',
    directus: 'Directus',
    n8n: 'n8n',
    windmill: 'Windmill',
    livekit: 'LiveKit',
    ocis: 'ownCloud (oCIS)',
    openbao: 'OpenBao',
    netbird: 'NetBird',
    zitadel: 'Zitadel',
    vaultwarden: 'Vaultwarden',
    kuma: 'Uptime Kuma',
    grafana: 'Grafana',
    forgejo: 'Forgejo',
    gitea: 'Gitea',
    metabase: 'Metabase',
    glitchtip: 'GlitchTip',
    outline: 'Outline',
    teable: 'Teable',
    documenso: 'Documenso',
    chatwoot: 'Chatwoot',
    umami: 'Umami',
    plausible: 'Plausible',
    headlamp: 'Headlamp',
    stalwart: 'Stalwart',
    bulwark: 'Bulwark',
    planka: 'Planka',
    kutt: 'Kutt',
    penpot: 'Penpot',
    resume: 'Reactive Resume',
    yopass: 'Yopass',
    sendrec: 'Sendrec',
    'external-dns': 'ExternalDNS',

    // Legacy categories mapped directly to their individual product
    crm: 'Twenty',
    chat: 'Matrix',
    meet: 'LiveKit',
    drive: 'ownCloud (oCIS)',
    flow: 'n8n',
    monitor: 'Grafana',
    mail: 'Stalwart',
    webmail: 'Bulwark',
    secrets: 'OpenBao',
    vpn: 'NetBird',
    sso: 'Zitadel',
    passwords: 'Vaultwarden',
    uptime: 'Uptime Kuma',
    errors: 'GlitchTip',
    git: 'Forgejo',
    insights: 'Metabase',
    dns: 'ExternalDNS',
    data: 'PocketBase',
    sheets: 'Teable',
    notes: 'Outline',
    analytics: 'Umami',
    tasks: 'Planka',
    sign: 'Documenso',
    support: 'Chatwoot',
    link: 'Kutt',
    links: 'Kutt',
    record: 'Sendrec',
    dashboard: 'Headlamp',
    design: 'Penpot',
    paste: 'Yopass',
};

const GENERIC_CATEGORY_NAMES = new Set([
    'crm',
    'chat',
    'meet',
    'drive',
    'automation',
    'flow',
    'monitor',
    'monitoring stack',
    'secrets',
    'secrets manager',
    'vpn',
    'sso',
    'identity provider',
    'passwords',
    'password manager',
    'uptime',
    'status pages',
    'errors',
    'error tracking',
    'git',
    'git forge',
    'insights',
    'business intelligence',
    'dns',
    'automated dns',
    'mail',
    'mail server',
    'webmail',
    'webmail ui',
    'notes',
    'team wiki',
    'sheets',
    'spreadsheet database',
    'analytics',
    'web analytics',
    'tasks',
    'project management',
    'sign',
    'document signing',
    'support',
    'customer support',
    'link',
    'links',
    'link management',
    'record',
    'screen recording',
    'dashboard',
    'kubernetes control plane',
    'design',
    'paste',
    'secure paste',
    'resume',
    'resume builder',
    'data',
    'headless cms',
]);

export const TOOL_TAGLINES: Record<string, string> = {
    twenty: 'CRM & Customer Management',
    crm: 'CRM & Customer Management',
    matrix: 'Decentralized Team Chat',
    chat: 'Decentralized Team Chat',
    livekit: 'WebRTC Video Meetings',
    meet: 'WebRTC Video Meetings',
    pocketbase: 'Embedded SQLite & Backend API',
    directus: 'Headless CMS & Data Platform',
    data: 'Headless CMS & Backend API',
    n8n: 'Workflow Automation',
    windmill: 'Developer Workflow Engine',
    flow: 'Workflow Automation',
    ocis: 'Cloud Storage & File Sync',
    drive: 'Cloud Storage & File Sync',
    openbao: 'Secrets Vault & Encryption',
    secrets: 'Secrets Vault & Encryption',
    netbird: 'Zero-Trust VPN Mesh',
    vpn: 'Zero-Trust VPN Mesh',
    zitadel: 'Identity Provider & SSO',
    sso: 'Identity Provider & SSO',
    vaultwarden: 'Bitwarden Password Vault',
    passwords: 'Bitwarden Password Vault',
    kuma: 'Status Pages & Monitoring',
    uptime: 'Status Pages & Monitoring',
    grafana: 'Metrics & Observability Dashboards',
    monitor: 'Metrics & Observability Dashboards',
    forgejo: 'Self-Hosted Git & CI/CD',
    gitea: 'Self-Hosted Git Forge',
    git: 'Self-Hosted Git Forge',
    metabase: 'Business Intelligence & BI',
    insights: 'Business Intelligence & BI',
    glitchtip: 'Error Tracking & Sentry APM',
    errors: 'Error Tracking & Sentry APM',
    outline: 'Team Wiki & Knowledge Base',
    notes: 'Team Wiki & Knowledge Base',
    teable: 'Spreadsheet Database',
    sheets: 'Spreadsheet Database',
    documenso: 'Digital Document Signing',
    sign: 'Digital Document Signing',
    chatwoot: 'Customer Support & Live Chat',
    support: 'Customer Support & Live Chat',
    umami: 'Privacy-Focused Web Analytics',
    plausible: 'Lightweight Web Analytics',
    analytics: 'Web Analytics',
    headlamp: 'Kubernetes Control Plane Dashboard',
    dashboard: 'Kubernetes Control Plane Dashboard',
    stalwart: 'All-in-One Mail Server',
    mail: 'All-in-One Mail Server',
    bulwark: 'Webmail Client',
    webmail: 'Webmail Client',
    planka: 'Kanban Project Management',
    tasks: 'Kanban Project Management',
    kutt: 'Link Shortener & Management',
    link: 'Link Shortener & Management',
    links: 'Link Shortener & Management',
    penpot: 'Design & Prototyping',
    design: 'Design & Prototyping',
    resume: 'Resume & CV Builder',
    yopass: 'Burn-After-Read Secret Sharing',
    paste: 'Burn-After-Read Secret Sharing',
    sendrec: 'Screen Recording & Sharing',
    record: 'Screen Recording & Sharing',
    'external-dns': 'Automated DNS Sync',
    dns: 'Automated DNS Sync',
};

export const TOOL_CATEGORIES_MAP: Record<string, string[]> = {
    twenty: ['communication', 'productivity', 'backend', 'database'],
    crm: ['communication', 'productivity', 'backend', 'database'],
    matrix: ['communication'],
    chat: ['communication'],
    livekit: ['communication'],
    meet: ['communication'],
    stalwart: ['communication', 'devops'],
    mail: ['communication', 'devops'],
    bulwark: ['communication', 'productivity'],
    webmail: ['communication', 'productivity'],
    chatwoot: ['communication', 'productivity'],
    support: ['communication', 'productivity'],
    sendrec: ['communication', 'productivity'],
    record: ['communication', 'productivity'],
    yopass: ['security', 'communication'],
    paste: ['security', 'communication'],

    pocketbase: ['database', 'backend', 'auth', 'storage'],
    directus: ['database', 'backend', 'auth'],
    data: ['database', 'backend', 'auth'],
    teable: ['database', 'productivity', 'backend'],
    sheets: ['database', 'productivity', 'backend'],

    n8n: ['devops', 'productivity', 'communication'],
    windmill: ['devops', 'productivity', 'backend'],
    flow: ['devops', 'productivity', 'communication'],

    openbao: ['security', 'devops'],
    secrets: ['security', 'devops'],
    netbird: ['security', 'devops'],
    vpn: ['security', 'devops'],
    zitadel: ['auth', 'security'],
    sso: ['auth', 'security'],
    vaultwarden: ['security', 'productivity'],
    passwords: ['security', 'productivity'],

    kuma: ['observability', 'devops'],
    uptime: ['observability', 'devops'],
    grafana: ['observability', 'devops'],
    monitor: ['observability', 'devops'],
    glitchtip: ['observability', 'devops'],
    errors: ['observability', 'devops'],

    ocis: ['storage', 'productivity'],
    drive: ['storage', 'productivity'],

    outline: ['productivity', 'communication'],
    notes: ['productivity', 'communication'],
    planka: ['productivity'],
    tasks: ['productivity'],
    documenso: ['productivity', 'security'],
    sign: ['productivity', 'security'],
    penpot: ['productivity'],
    design: ['productivity'],
    resume: ['productivity'],

    forgejo: ['devops', 'productivity'],
    gitea: ['devops', 'productivity'],
    git: ['devops', 'productivity'],
    headlamp: ['devops'],
    dashboard: ['devops'],
    'external-dns': ['devops'],
    dns: ['devops'],

    metabase: ['analytics', 'database'],
    insights: ['analytics', 'database'],
    umami: ['analytics'],
    plausible: ['analytics'],
    analytics: ['analytics'],
    kutt: ['productivity', 'analytics'],
    link: ['productivity', 'analytics'],
    links: ['productivity', 'analytics'],
};

export function toolCategories(tool: {
    tool?: string;
    categories?: string[];
    label?: string;
    brand?: string;
}): string[] {
    if (tool.categories && tool.categories.length > 0) {
        return tool.categories;
    }
    const slug = (tool.tool ?? '').toLowerCase();
    return TOOL_CATEGORIES_MAP[slug] ?? ['productivity'];
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

export const TOOL_STACKS: Record<string, string[]> = {
    grafana: ['Grafana', 'Prometheus', 'Loki'],
    monitor: ['Grafana', 'Prometheus', 'Loki'],
    netbird: ['Management', 'Signal', 'Relay', 'Dashboard', 'Client'],
    vpn: ['Management', 'Signal', 'Relay', 'Dashboard', 'Client'],
    matrix: ['Synapse', 'Element Web', 'MAS Auth', 'Coturn', 'Admin'],
    chat: ['Synapse', 'Element Web', 'MAS Auth', 'Coturn', 'Admin'],
    twenty: ['Twenty App', 'Worker'],
    crm: ['Twenty App', 'Worker'],
    forgejo: ['Forgejo Server', 'Actions Runner'],
    git: ['Forgejo Server', 'Actions Runner'],
    penpot: ['Backend', 'Frontend', 'Exporter'],
    design: ['Backend', 'Frontend', 'Exporter'],
    glitchtip: ['Web API', 'Worker'],
    errors: ['Web API', 'Worker'],
    livekit: ['LiveKit Server', 'JWT Auth'],
    meet: ['LiveKit Server', 'JWT Auth'],
};

export function toolStack(tool: {
    tool?: string;
    components?: ClusterToolComponent[];
}): string[] {
    const slug = (tool.tool ?? '').toLowerCase();
    if (TOOL_STACKS[slug]) {
        return TOOL_STACKS[slug];
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

export function toolTagline(tool: { tool?: string; label?: string }): string {
    const slug = (tool.tool ?? '').toLowerCase();
    if (slug && TOOL_TAGLINES[slug]) {
        return TOOL_TAGLINES[slug];
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

/** Returns the individual product name (e.g. Twenty, Matrix, PocketBase), never a generic category. */
export function toolName(tool: {
    brand?: string;
    tool?: string;
    label?: string;
}): string {
    const raw = (tool.brand ?? '').replace(/\s*\[[^\]]*\]$/, '').trim();
    const slug = (tool.tool ?? '').toLowerCase();

    // 1. If brand is explicitly set and is NOT a generic category name, return it.
    if (raw && !GENERIC_CATEGORY_NAMES.has(raw.toLowerCase())) {
        return raw;
    }

    // 2. If the tool slug matches a known individual tool, return its canonical product name.
    if (slug && TOOL_DISPLAY_NAMES[slug]) {
        return TOOL_DISPLAY_NAMES[slug];
    }

    // 3. If label contains engine info, check if it contains a known product.
    if (tool.label) {
        const { engine, summary } = describeTool(tool.label);
        if (engine && !GENERIC_CATEGORY_NAMES.has(engine.toLowerCase())) {
            const engineKey = engine.toLowerCase();
            return TOOL_DISPLAY_NAMES[engineKey] ?? engine;
        }
        if (summary && !GENERIC_CATEGORY_NAMES.has(summary.toLowerCase())) {
            const summaryKey = summary.toLowerCase();
            return TOOL_DISPLAY_NAMES[summaryKey] ?? summary;
        }
    }

    if (slug) {
        return slug.charAt(0).toUpperCase() + slug.slice(1);
    }

    return 'Tool';
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
