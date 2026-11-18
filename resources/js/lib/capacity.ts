export type ToolFootprint = {
    cpu_millicores: number;
    memory_bytes: number;
    components?: Array<{
        name: string;
        optional: boolean;
        cpu_millicores: number;
        memory_bytes: number;
    }>;
};

export type CapacityAppBreakdown = {
    tool: string;
    instance?: string | null;
    label: string;
    paused: boolean;
    cpu_millicores: number;
    memory_bytes: number;
};

export type CapacityVerdict = 'fits' | 'tight' | 'wont_fit_now' | 'never_fits';

export type CapacityAssessment = {
    node: {
        count: number;
        allocatable_cpu_millicores: number;
        allocatable_memory_bytes: number;
        usable_cpu_millicores: number;
        usable_memory_bytes: number;
        used_cpu_millicores: number;
        used_memory_bytes: number;
        free_cpu_millicores: number;
        free_memory_bytes: number;
        basis: string;
        margin_fraction: number;
    };
    breakdown: {
        system: { cpu_millicores: number; memory_bytes: number };
        platform: { cpu_millicores: number; memory_bytes: number };
        apps: CapacityAppBreakdown[];
        free: { cpu_millicores: number; memory_bytes: number };
    };
    demand?: ToolFootprint;
    verdict?: CapacityVerdict;
    pause_candidates?: Array<{
        tool: string;
        instance?: string | null;
        label: string;
        cpu_millicores: number;
        memory_bytes: number;
        command: string;
    }>;
    alternatives_that_fit?: Array<{
        tool: string;
        label: string;
        cpu_millicores: number;
        memory_bytes: number;
        verdict: string;
    }>;
    upsize_hint?: string;
};

export function formatMemoryBytes(bytes: number): string {
    const mib = bytes / (1024 * 1024);
    if (mib >= 1024) {
        return `${(mib / 1024).toFixed(1)} GB`;
    }

    return `${Math.round(mib)} MB`;
}

export function estimateToolFit(
    footprint: ToolFootprint | null | undefined,
    capacity: CapacityAssessment | null | undefined,
): 'fits' | 'tight' | 'wont_fit' | null {
    if (!footprint || !capacity) {
        return null;
    }

    const freeMem = capacity.node.free_memory_bytes;
    const freeCpu = capacity.node.free_cpu_millicores;
    if (
        footprint.memory_bytes > freeMem ||
        footprint.cpu_millicores > freeCpu
    ) {
        return 'wont_fit';
    }

    const usableMem = capacity.node.usable_memory_bytes;
    const remaining = freeMem - footprint.memory_bytes;
    if (usableMem > 0 && remaining / usableMem < 0.15) {
        return 'tight';
    }

    return 'fits';
}
