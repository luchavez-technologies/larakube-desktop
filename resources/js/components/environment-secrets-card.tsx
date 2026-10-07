import { useEffect, useState } from 'react';
import { router } from '@inertiajs/react';
import {
    ArrowDownCircle,
    ArrowUpCircle,
    CheckCircle2,
    Eye,
    EyeOff,
    FileText,
    Key,
    Lock,
    RotateCw,
    Search,
    Shield,
    X,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import StatusPill from '@/components/status-pill';
import {
    push as pushRoute,
    pull as pullRoute,
    status as statusRoute,
} from '@/routes/projects/dotenv';
import type { Project, ProjectEnvironment } from '@/types/larakube';

type DriftItem = {
    key: string;
    status: string;
    isSecret: boolean;
    isExcluded: boolean;
    local: string | null;
    cluster: string | null;
};

type DriftSummary = {
    drift: number;
    onlyLocal: number;
    onlyCluster: number;
    hidden: number;
    inSync: number;
    rotated: number;
    canReadSecrets: boolean;
};

type DriftStatusResponse = {
    environment: string;
    status: {
        environment?: string;
        namespace?: string;
        items: DriftItem[];
        summary: DriftSummary;
    } | null;
};

export default function EnvironmentSecretsCard({
    project,
    activeEnv,
    activeEnvConfig: _activeEnvConfig,
}: {
    project: Project;
    activeEnv: string;
    activeEnvConfig: ProjectEnvironment;
}) {
    const [driftModalOpen, setDriftModalOpen] = useState(false);
    const [pushing, setPushing] = useState(false);
    const [pulling, setPulling] = useState(false);

    const envFilename = activeEnv === 'local' ? '.env' : `.env.${activeEnv}`;

    function handlePush() {
        if (
            !confirm(
                `Push secret variables from local ${envFilename} into the cluster secrets for '${activeEnv}'?`,
            )
        ) {
            return;
        }
        setPushing(true);
        router.post(
            pushRoute({ project: project.id }).url,
            { environment: activeEnv },
            {
                preserveScroll: true,
                onFinish: () => setPushing(false),
            },
        );
    }

    function handlePull() {
        if (
            !confirm(
                `Pull secret variables from the cluster into your local ${envFilename} file? Existing lines will be updated.`,
            )
        ) {
            return;
        }
        setPulling(true);
        router.post(
            pullRoute({ project: project.id }).url,
            { environment: activeEnv },
            {
                preserveScroll: true,
                onFinish: () => setPulling(false),
            },
        );
    }

    return (
        <Card
            label={`Environment Secrets & Drift · ${activeEnv.toUpperCase()}`}
            action={
                <div className="flex items-center gap-1.5 text-xs text-soft">
                    <Lock className="size-3.5 text-soft" />
                    <span>Secret Synchronization</span>
                </div>
            }
        >
            <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <FileText className="size-4 text-ink" />
                            <span className="font-mono text-sm font-semibold text-ink">
                                {envFilename}
                            </span>
                            <span className="text-xs text-soft">
                                ↔ Cluster Secrets
                            </span>
                        </div>
                        <div className="mt-0.5 text-xs text-soft">
                            Compare variables between local disk and cluster
                            Secret/ConfigMap, and sync without CI exposure.
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setDriftModalOpen(true)}
                            className="gap-1.5"
                        >
                            <Search className="size-3.5" />
                            <span>Check Drift</span>
                        </Button>

                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={pushing}
                            onClick={handlePush}
                            className="gap-1.5"
                            title="Push secret keys from disk to the cluster"
                        >
                            <ArrowUpCircle className="size-3.5 text-ink" />
                            <span>{pushing ? 'Pushing…' : 'Push Secrets'}</span>
                        </Button>

                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={pulling}
                            onClick={handlePull}
                            className="gap-1.5"
                            title="Pull secret keys from the cluster into disk"
                        >
                            <ArrowDownCircle className="size-3.5 text-ink" />
                            <span>{pulling ? 'Pulling…' : 'Pull Secrets'}</span>
                        </Button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-xs text-soft">
                    <Shield className="size-3.5 shrink-0 text-soft" />
                    <span>
                        Values are synced directly to{' '}
                        <code className="font-mono text-ink">
                            laravel-secrets
                        </code>{' '}
                        or OpenBao. No credentials ever pass through git or CI.
                    </span>
                </div>
            </div>

            {/* Drift Viewer Modal */}
            {driftModalOpen && (
                <DotenvDriftModal
                    project={project}
                    activeEnv={activeEnv}
                    envFilename={envFilename}
                    onClose={() => setDriftModalOpen(false)}
                    onPush={handlePush}
                    onPull={handlePull}
                    pushing={pushing}
                    pulling={pulling}
                />
            )}
        </Card>
    );
}

function DotenvDriftModal({
    project,
    activeEnv,
    envFilename,
    onClose,
    onPush,
    onPull,
    pushing,
    pulling,
}: {
    project: Project;
    activeEnv: string;
    envFilename: string;
    onClose: () => void;
    onPush: () => void;
    onPull: () => void;
    pushing: boolean;
    pulling: boolean;
}) {
    const [loading, setLoading] = useState(true);
    const [reveal, setReveal] = useState(false);
    const [data, setData] = useState<DriftStatusResponse['status'] | null>(
        null,
    );

    function fetchDrift(showPlaintext: boolean) {
        setLoading(true);
        const url = `${statusRoute({ project: project.id }).url}?environment=${encodeURIComponent(activeEnv)}${showPlaintext ? '&reveal=1' : ''}`;
        fetch(url, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : null))
            .then((res: DriftStatusResponse | null) => {
                setData(res?.status ?? null);
            })
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }

    useEffect(() => {
        fetchDrift(reveal);
    }, [reveal]);

    function toggleReveal() {
        setReveal((prev) => !prev);
    }

    const summary = data?.summary;
    const items = data?.items ?? [];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-6 backdrop-blur-xs">
            <div className="flex max-h-[85vh] w-full max-w-[800px] flex-col rounded-2xl bg-surface p-6 shadow-2xl ring-1 ring-line">
                {/* Header */}
                <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
                    <div className="flex items-center gap-2">
                        <Key className="size-4 text-ink" />
                        <h3 className="text-base font-semibold text-ink">
                            Dotenv Drift Inspection · {envFilename} ↔{' '}
                            {data?.namespace ?? activeEnv}
                        </h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={toggleReveal}
                            className="gap-1.5"
                            title={
                                reveal
                                    ? 'Mask secret values'
                                    : 'Show plaintext values'
                            }
                        >
                            {reveal ? (
                                <EyeOff className="size-3.5" />
                            ) : (
                                <Eye className="size-3.5" />
                            )}
                            <span>
                                {reveal ? 'Mask Secrets' : 'Peek Plaintext'}
                            </span>
                        </Button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg p-1 text-soft hover:bg-badge hover:text-ink"
                        >
                            <X className="size-4" />
                        </button>
                    </div>
                </div>

                {/* Summary Pills */}
                {summary && (
                    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                        {summary.inSync > 0 && (
                            <StatusPill tone="ok">
                                {summary.inSync} In Sync
                            </StatusPill>
                        )}
                        {summary.drift > 0 && (
                            <StatusPill tone="warn">
                                {summary.drift} Drifted
                            </StatusPill>
                        )}
                        {summary.onlyLocal > 0 && (
                            <StatusPill tone="muted">
                                {summary.onlyLocal} Only in {envFilename}
                            </StatusPill>
                        )}
                        {summary.onlyCluster > 0 && (
                            <StatusPill tone="muted">
                                {summary.onlyCluster} Only in Cluster
                            </StatusPill>
                        )}
                        {summary.hidden > 0 && (
                            <StatusPill tone="muted">
                                {summary.hidden} Hidden
                            </StatusPill>
                        )}
                        {summary.rotated > 0 && (
                            <StatusPill tone="muted">
                                {summary.rotated} Rotated (OpenBao)
                            </StatusPill>
                        )}
                    </div>
                )}

                {/* Body Table */}
                <div className="min-h-48 flex-1 overflow-y-auto rounded-xl border border-line bg-paper">
                    {loading ? (
                        <div className="flex h-48 items-center justify-center gap-2 text-sm text-soft">
                            <RotateCw className="size-4 animate-spin text-soft" />
                            <span>Comparing local variables with cluster…</span>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-soft">
                            <CheckCircle2 className="size-6 text-ok" />
                            <span>
                                All configuration keys are in sync or no
                                variables found.
                            </span>
                        </div>
                    ) : (
                        <table className="w-full text-left text-xs">
                            <thead className="sticky top-0 border-b border-line bg-paper text-[11px] font-semibold tracking-wider text-soft uppercase">
                                <tr>
                                    <th className="px-3.5 py-2">Variable</th>
                                    <th className="px-3 py-2">Status</th>
                                    <th className="px-3.5 py-2">
                                        Local ({envFilename})
                                    </th>
                                    <th className="px-3.5 py-2">Cluster</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-line font-mono">
                                {items.map((row) => {
                                    const isDrift = row.status === 'drift';
                                    const isOnlyLocal =
                                        row.status === 'only local';
                                    const isOnlyCluster =
                                        row.status === 'only cluster';
                                    const isSync = row.status === 'in-sync';

                                    return (
                                        <tr
                                            key={row.key}
                                            className={
                                                isDrift
                                                    ? 'bg-warn/5'
                                                    : isOnlyLocal ||
                                                        isOnlyCluster
                                                      ? 'bg-ink/5'
                                                      : ''
                                            }
                                        >
                                            <td className="px-3.5 py-2 font-medium text-ink">
                                                <div className="flex items-center gap-1.5">
                                                    {row.isSecret && (
                                                        <Lock className="size-3 shrink-0 text-soft" />
                                                    )}
                                                    <span
                                                        className="max-w-[200px] truncate"
                                                        title={row.key}
                                                    >
                                                        {row.key}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 font-sans">
                                                {isSync ? (
                                                    <StatusPill tone="ok">
                                                        in-sync
                                                    </StatusPill>
                                                ) : isDrift ? (
                                                    <StatusPill tone="warn">
                                                        drift
                                                    </StatusPill>
                                                ) : (
                                                    <StatusPill tone="muted">
                                                        {row.status}
                                                    </StatusPill>
                                                )}
                                            </td>
                                            <td
                                                className="max-w-[220px] truncate px-3.5 py-2 text-soft"
                                                title={row.local ?? '—'}
                                            >
                                                {row.local ?? (
                                                    <span className="font-sans text-line italic">
                                                        —
                                                    </span>
                                                )}
                                            </td>
                                            <td
                                                className="max-w-[220px] truncate px-3.5 py-2 text-soft"
                                                title={row.cluster ?? '—'}
                                            >
                                                {row.cluster ?? (
                                                    <span className="font-sans text-line italic">
                                                        —
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                    <div className="flex items-center gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={pushing || loading}
                            onClick={onPush}
                            className="gap-1.5"
                        >
                            <ArrowUpCircle className="size-3.5" />
                            <span>Push to Cluster</span>
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={pulling || loading}
                            onClick={onPull}
                            className="gap-1.5"
                        >
                            <ArrowDownCircle className="size-3.5" />
                            <span>Pull to Local</span>
                        </Button>
                    </div>

                    <Button
                        variant="primary"
                        size="sm"
                        onClick={onClose}
                        className="gap-1.5"
                    >
                        <X className="size-3.5" />
                        <span>Close</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}
