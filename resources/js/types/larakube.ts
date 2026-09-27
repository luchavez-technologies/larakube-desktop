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

export type Run = {
    id: number;
    label: string;
    status: RunStatus;
    exitCode: number | null;
    output: string;
    result: Record<string, unknown> | null;
    startedAt: string | null;
    finishedAt: string | null;
};
