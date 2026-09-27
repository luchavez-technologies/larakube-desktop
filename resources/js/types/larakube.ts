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

export type RunKind = 'create-server' | 'destroy-server' | 'install-tool';

export type Run = {
    id: number;
    label: string;
    kind: RunKind | null;
    subject: string | null;
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
