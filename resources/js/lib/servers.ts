import type { Tone } from '@/components/status-pill';
import type { RunStatus, ServerStatus } from '@/types/larakube';

export const serverStatus: Record<ServerStatus, [string, Tone]> = {
    ready: ['Ready', 'ok'],
    incomplete: ['Setup incomplete', 'warn'],
    unfinished: ['Unfinished', 'warn'],
};

export const runStatus: Record<RunStatus, [string, Tone]> = {
    running: ['Running', 'busy'],
    succeeded: ['Done', 'ok'],
    failed: ['Failed', 'bad'],
    cancelled: ['Cancelled', 'muted'],
};
