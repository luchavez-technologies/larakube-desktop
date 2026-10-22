import type { Tone } from '@/components/status-pill';
import type { RunStatus, Server, ServerStatus } from '@/types/larakube';

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

/**
 * Whether a server is a local cluster (OrbStack, k3d, Docker Desktop, ...)
 * rather than a cloud/managed one — mirrors App\Models\Server::isStackLocal()
 * on the backend. Options that only make sense against a real DNS zone or
 * internet-exposed ingress (Cloudflare Proxy, NetBird VPN-only, autoscaling)
 * are gated on this everywhere in the UI, so keep it here once instead of
 * re-deriving the same heuristic per page.
 */
export function isLocalServer(
    server?: Pick<Server, 'provider' | 'region' | 'ip'> | null,
): boolean {
    if (!server) return true;

    const provider = (server.provider ?? '').toLowerCase();
    const localProviders = [
        'local',
        'k3d',
        'kind',
        'orbstack',
        'minikube',
        'docker',
    ];
    if (localProviders.includes(provider)) return true;
    if (server.region === 'local') return true;
    if (server.ip && ['127.0.0.1', 'localhost', 'local'].includes(server.ip)) {
        return true;
    }
    if (
        !server.ip &&
        !['gcp', 'aws', 'do', 'hetzner', 'vps', 'cloud'].includes(provider)
    ) {
        return true;
    }

    return false;
}
