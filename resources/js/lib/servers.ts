import type { Tone } from '@/components/status-pill';
import type { RunStatus, Server, ServerStatus } from '@/types/larakube';

export const serverStatus: Record<ServerStatus, [string, Tone]> = {
    ready: ['Ready', 'ok'],
    incomplete: ['Setup incomplete', 'warn'],
    unfinished: ['Unfinished', 'warn'],
    provisioning: ['Provisioning…', 'busy'],
    failed: ['Failed', 'bad'],
    missing: ['Missing', 'muted'],
    destroyed: ['Destroyed', 'muted'],
};

/**
 * Returns a robust [label, tone] tuple for a server, devbox, or raw status string.
 * Folds the live reachability check into one coherent badge: an unreachable ready
 * server is rendered as ['Unreachable', 'warn'] instead of contradictory 'Ready'.
 */
export function getServerStatusBadge(
    serverOrStatus?: Pick<Server, 'status'> | ServerStatus | null,
    isReachable?: boolean,
): [string, Tone] {
    const status =
        typeof serverOrStatus === 'object' && serverOrStatus !== null
            ? serverOrStatus.status
            : (serverOrStatus ?? '');

    if (status === 'ready' && isReachable === false) {
        return ['Unreachable', 'warn'];
    }

    if (status && status in serverStatus) {
        return serverStatus[status];
    }

    if (!status) {
        return ['Unknown', 'muted'];
    }

    const label = status.charAt(0).toUpperCase() + status.slice(1);
    return [label, 'muted'];
}

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

/**
 * Fallback endpoint label when a server does not have a dedicated IPv4 address:
 * local clusters (OrbStack, k3d, Docker Desktop) and managed Kubernetes clusters
 * (GKE, DOKS, EKS, AKS) never have a static VPS IP, so showing "Provisioning IP…"
 * for them is misleading.
 */
export function serverEndpointLabel(
    server?: Pick<Server, 'provider' | 'region' | 'ip' | 'kind'> | null,
): string {
    if (!server) return '—';
    if (server.ip) return server.ip;
    if (isLocalServer(server)) return 'Local Cluster';

    const kind = (server.kind ?? '').toLowerCase();
    if (['managed', 'doks', 'gke', 'eks', 'aks', 'cluster'].includes(kind)) {
        return 'Managed Cluster';
    }
    if (kind === 'discovered') {
        return 'External Cluster';
    }

    return 'Provisioning IP…';
}

export type ServerKind = 'VPS' | 'Managed' | 'Local' | 'External';

/**
 * Short classification label for server switchers and badges.
 */
export function serverKindLabel(
    server?: Pick<Server, 'provider' | 'region' | 'ip' | 'kind'> | null,
): ServerKind {
    if (!server) return 'VPS';
    if (isLocalServer(server)) return 'Local';

    const kind = (server.kind ?? '').toLowerCase();
    if (['managed', 'doks', 'gke', 'eks', 'aks', 'cluster'].includes(kind)) {
        return 'Managed';
    }
    if (kind === 'discovered') {
        return 'External';
    }
    if (!server.ip) {
        return 'Managed';
    }

    return 'VPS';
}
