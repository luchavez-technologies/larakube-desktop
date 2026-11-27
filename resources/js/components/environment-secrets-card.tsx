import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from '@inertiajs/react';
import {
    AlertTriangle,
    ArrowDownCircle,
    ArrowUpCircle,
    CheckCircle2,
    Clock,
    Eye,
    EyeOff,
    FileText,
    Info,
    Key,
    Rocket,
    RotateCw,
    Shield,
    X,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import ConfirmModal from '@/components/confirm-modal';
import InfoTooltip from '@/components/info-tooltip';
import EnvironmentVariablesTable, {
    createDraftRow,
    normalizeEnvKey,
    type DraftEnvRow,
    type EnvTableRow,
    type StagedEnvChange,
} from '@/components/environment-variables-table';
import { cn } from '@/lib/utils';
import {
    pull as pullRoute,
    push as pushRoute,
    status as statusRoute,
    update as updateRoute,
} from '@/routes/projects/dotenv';
import type { ProjectEnvironment } from '@/types/larakube';

type DriftItem = {
    key: string;
    status: string;
    isSecret: boolean;
    isExcluded: boolean;
    isBlank?: boolean;
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

type PushMetadata = {
    platform: string;
    secretName: string;
    existsOnCi: boolean | null;
    lastPushedAt: string | null;
    localUpdatedAt: string | null;
    modifiedSincePush: boolean;
};

type DriftStatusResponse = {
    environment: string;
    status: {
        environment?: string;
        namespace?: string;
        items: DriftItem[];
        summary: DriftSummary;
    } | null;
    pushMeta?: PushMetadata | null;
};

function formatPushTimestamp(
    iso: string,
    nowMs: number | null,
): { label: string; title: string } | null {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    const timeText = date.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
    });
    const dateText = date.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
    });
    const title = date.toLocaleString();

    if (nowMs === null) {
        return { label: `${dateText} · ${timeText}`, title };
    }

    const diffSec = Math.max(0, Math.round((nowMs - date.getTime()) / 1000));
    if (diffSec < 60) {
        return { label: `just now · ${timeText}`, title };
    }
    if (diffSec < 3600) {
        return {
            label: `${Math.floor(diffSec / 60)}m ago · ${timeText}`,
            title,
        };
    }
    if (diffSec < 86400) {
        return {
            label: `${Math.floor(diffSec / 3600)}h ago · ${timeText}`,
            title,
        };
    }

    return { label: `${dateText} · ${timeText}`, title };
}

export default function EnvironmentSecretsCard({
    project,
    activeEnv,
    activeEnvConfig,
    customEndpoints,
    onOpenPipelineSettings,
    refreshKey,
}: {
    project: { id?: number; name?: string; framework?: string | null };
    activeEnv: string;
    activeEnvConfig: ProjectEnvironment;
    customEndpoints?: {
        status?: string;
        push?: string;
        pull?: string;
        update?: string;
    };
    onOpenPipelineSettings?: () => void;
    refreshKey?: string | number | null;
}) {
    const [loading, setLoading] = useState(true);
    const [reveal, setReveal] = useState(false);
    const revealRef = useRef(false);
    const [data, setData] = useState<DriftStatusResponse['status'] | null>(
        null,
    );
    const [pushMeta, setPushMeta] = useState<PushMetadata | null>(null);
    const [nowMs, setNowMs] = useState<number | null>(null);
    const [confirmAction, setConfirmAction] = useState<'push' | 'pull' | null>(
        null,
    );

    const [stagedChanges, setStagedChanges] = useState<
        Record<string, StagedEnvChange>
    >({});
    const [draftRows, setDraftRows] = useState<DraftEnvRow[]>(() => [
        createDraftRow(),
    ]);

    const [saving, setSaving] = useState(false);
    const [pushing, setPushing] = useState(false);
    const [leaveBlank, setLeaveBlank] = useState(false);
    const [pulling, setPulling] = useState(false);
    const [message, setMessage] = useState<{
        text: string;
        type: 'ok' | 'warn' | 'error';
        /** "Pushing…"/"Pulling…": cleared when that run finishes. */
        progress?: boolean;
    } | null>(null);

    const pushUrl =
        customEndpoints?.push ??
        (project.id ? pushRoute({ project: project.id }).url : '');
    const pullUrl =
        customEndpoints?.pull ??
        (project.id ? pullRoute({ project: project.id }).url : '');
    const statusUrl =
        customEndpoints?.status ??
        (project.id ? statusRoute({ project: project.id }).url : '');
    const updateUrl =
        customEndpoints?.update ??
        (project.id ? updateRoute({ project: project.id }).url : '');

    const editable = Boolean(updateUrl);
    const isLocalEnv = activeEnv === 'local';
    const envFilename = isLocalEnv ? '.env' : `.env.${activeEnv}`;
    const isStaticSpa =
        [
            'astro',
            'vite',
            'vue',
            'react',
            'svelte',
            'solid',
            'docusaurus',
        ].includes(project.framework?.toLowerCase() ?? '') &&
        !activeEnvConfig?.components?.includes('ssr');
    const isStaticCloud = !isLocalEnv && isStaticSpa;
    const ciPlatform = activeEnvConfig?.ci?.platform ?? 'github';
    const ciPlatformLabel =
        ciPlatform === 'forgejo'
            ? 'Forgejo'
            : ciPlatform === 'gitlab'
              ? 'GitLab CI'
              : 'GitHub Actions';
    const buildSecretName = `${activeEnv.toUpperCase()}_BUILD_ENV`;

    const isOpenBaoActive =
        Boolean(data?.summary?.rotated && data.summary.rotated > 0) ||
        Boolean(activeEnvConfig?.components?.includes('openbao')) ||
        Boolean(activeEnvConfig?.plex?.includes('openbao'));

    const fetchStatus = useCallback(
        (showPlaintext: boolean) => {
            if (!statusUrl) return;
            setLoading(true);
            const url = `${statusUrl}?environment=${encodeURIComponent(activeEnv)}${showPlaintext ? '&reveal=1' : ''}`;
            fetch(url, { headers: { Accept: 'application/json' } })
                .then((res) => (res.ok ? res.json() : null))
                .then((res: DriftStatusResponse | null) => {
                    setData(res?.status ?? null);
                    setPushMeta(res?.pushMeta ?? null);
                })
                .catch(() => {
                    setData(null);
                    setPushMeta(null);
                })
                .finally(() => setLoading(false));
        },
        [activeEnv, statusUrl],
    );

    const prevRefreshKeyRef = useRef(refreshKey);
    useEffect(() => {
        setNowMs(Date.now());
        setStagedChanges({});
        setDraftRows([createDraftRow()]);
        setMessage(null);
        fetchStatus(revealRef.current);
    }, [fetchStatus]);

    useEffect(() => {
        if (prevRefreshKeyRef.current === refreshKey) {
            return;
        }
        prevRefreshKeyRef.current = refreshKey;
        // The run behind a "Pushing…"/"Pulling…" message has finished: the status below now shows its result.
        if (/:(succeeded|failed|cancelled)$/.test(String(refreshKey ?? ''))) {
            setMessage((current) => (current?.progress ? null : current));
        }
        setNowMs(Date.now());
        fetchStatus(revealRef.current);
    }, [fetchStatus, refreshKey]);

    function toggleReveal() {
        const nextReveal = !reveal;
        revealRef.current = nextReveal;
        setReveal(nextReveal);
        fetchStatus(nextReveal);
    }

    function handleStageEdit(key: string, value: string, isSecret: boolean) {
        setStagedChanges((prev) => ({
            ...prev,
            [key]: { value, isSecret },
        }));
    }

    function handleStageDelete(key: string, isSecret: boolean) {
        setStagedChanges((prev) => ({
            ...prev,
            [key]: { value: null, isSecret },
        }));
    }

    function handleUnstageKey(key: string) {
        setStagedChanges((prev) => {
            const next = { ...prev };
            delete next[key];

            return next;
        });
    }

    function discardChanges() {
        setStagedChanges({});
        setDraftRows([createDraftRow()]);
    }

    const stagedVariables = useMemo(() => {
        const merged: Record<string, string | null> = {};
        for (const [key, change] of Object.entries(stagedChanges)) {
            merged[key] = change.value;
        }
        for (const draft of draftRows) {
            const key = normalizeEnvKey(draft.key);
            if (key !== '') {
                merged[key] = draft.value;
            }
        }

        return merged;
    }, [stagedChanges, draftRows]);

    const stagedCount = Object.keys(stagedVariables).length;
    const hasStagedChanges = stagedCount > 0;

    async function handleSave(redeploy: boolean) {
        if (!updateUrl) return;
        setSaving(true);
        setMessage(null);

        try {
            const response = await fetch(updateUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN':
                        (
                            document.querySelector(
                                'meta[name="csrf-token"]',
                            ) as HTMLMetaElement | null
                        )?.content ?? '',
                },
                body: JSON.stringify({
                    environment: activeEnv,
                    variables: stagedVariables,
                    redeploy,
                }),
            });

            const result = await response.json();
            if (result.success) {
                setMessage({
                    text: result.message,
                    type: result.warning ? 'warn' : 'ok',
                });
                setStagedChanges({});
                setDraftRows([createDraftRow()]);
                if (result.pushMeta) {
                    setPushMeta(result.pushMeta);
                    setNowMs(Date.now());
                }
                if (result.status) {
                    setData(result.status);
                } else {
                    fetchStatus(reveal);
                }
            } else {
                setMessage({
                    text: result.message ?? 'Failed to update variables.',
                    type: 'error',
                });
            }
        } catch (err: unknown) {
            setMessage({
                text: err instanceof Error ? err.message : 'Request failed.',
                type: 'error',
            });
        } finally {
            setSaving(false);
        }
    }

    function handlePush() {
        if (pushBlocked) return;
        setConfirmAction('push');
    }

    function executePush() {
        setConfirmAction(null);
        setPushing(true);
        router.post(
            pushUrl,
            { environment: activeEnv },
            {
                preserveScroll: true,
                preserveState: true,
                only: ['runs', 'latestRun'],
                onSuccess: () => {
                    setMessage({
                        text: isStaticCloud
                            ? `Pushing ${envFilename} to ${ciPlatformLabel} (${buildSecretName})…`
                            : `Pushing ${envFilename} to ${activeEnv}…`,
                        type: 'ok',
                        progress: true,
                    });
                },
                onFinish: () => {
                    setPushing(false);
                    setNowMs(Date.now());
                    fetchStatus(reveal);
                },
            },
        );
    }

    function handlePull() {
        setConfirmAction('pull');
    }

    function executePull() {
        setConfirmAction(null);
        setPulling(true);
        router.post(
            pullUrl,
            { environment: activeEnv },
            {
                preserveScroll: true,
                preserveState: true,
                only: ['runs', 'latestRun'],
                onSuccess: () => {
                    setMessage({
                        text: `Pulling ${activeEnv} secrets into ${envFilename}…`,
                        progress: true,
                        type: 'ok',
                    });
                },
                onFinish: () => {
                    setPulling(false);
                    fetchStatus(reveal);
                },
            },
        );
    }

    const tableRows = useMemo<EnvTableRow[]>(
        () =>
            (data?.items ?? []).map((item) => ({
                key: item.key,
                value: item.local,
                isSecret: item.isSecret,
                status: item.status,
                isExcluded: item.isExcluded,
                clusterValue: item.cluster,
            })),
        [data],
    );

    const needsValue = useMemo(
        () =>
            (data?.items ?? [])
                .filter((item) => item.isBlank)
                .map((item) => item.key),
        [data],
    );

    const pushBlocked = needsValue.length > 0 && !leaveBlank;

    const summary = data?.summary;
    const mountedLocalCount = isLocalEnv
        ? (data?.items ?? []).filter(
              (item) =>
                  (!item.isSecret || isStaticSpa) &&
                  (item.status === 'only_local' ||
                      item.status === 'only local'),
          ).length
        : 0;
    const unpushedLocalCount = isStaticCloud
        ? 0
        : Math.max(0, (summary?.onlyLocal ?? 0) - mountedLocalCount);

    return (
        <Card
            label={`Environment Variables & Secrets · ${activeEnv.toUpperCase()}`}
            action={
                <div className="flex items-center gap-2">
                    {isOpenBaoActive && (
                        <span
                            className="bg-brand-tint inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium text-brand"
                            title="OpenBao Vault is active on this cluster. Secrets are synced directly to app-secrets."
                        >
                            <Shield className="size-3" />
                            <span>OpenBao Vault</span>
                        </span>
                    )}

                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={toggleReveal}
                        title={
                            reveal
                                ? 'Mask secret values'
                                : 'Peek plaintext values'
                        }
                    >
                        {reveal ? (
                            <EyeOff className="size-3.5" />
                        ) : (
                            <Eye className="size-3.5" />
                        )}
                        <span>{reveal ? 'Mask' : 'Reveal'}</span>
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => fetchStatus(reveal)}
                        disabled={loading}
                        title="Refresh environment variables status"
                    >
                        <RotateCw
                            className={cn(
                                'size-3.5',
                                loading && 'animate-spin',
                            )}
                        />
                        <span>Refresh</span>
                    </Button>
                </div>
            }
        >
            <div className="flex flex-col gap-4">
                {/* Subheader summary & context */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-soft">
                    <div className="flex items-center gap-2">
                        <FileText className="size-4 text-ink" />
                        <span className="font-mono font-semibold text-ink">
                            {envFilename}
                        </span>
                        <span>↔</span>
                        <span className="font-mono text-ink">
                            {isStaticCloud
                                ? `${ciPlatformLabel} (${buildSecretName})`
                                : data?.namespace
                                  ? `${data.namespace} (app-secrets / app-config)`
                                  : 'Cluster Secret / ConfigMap'}
                        </span>
                        {isStaticCloud && onOpenPipelineSettings && (
                            <button
                                type="button"
                                onClick={onOpenPipelineSettings}
                                className="cursor-pointer text-[11px] font-medium text-brand hover:underline"
                                title="Change target Git Remote or Git Forge platform"
                            >
                                Change
                            </button>
                        )}
                    </div>

                    {(summary || pushMeta) && (
                        <div className="flex flex-wrap items-center gap-2.5">
                            {(() => {
                                const pushedDisplay = pushMeta?.lastPushedAt
                                    ? formatPushTimestamp(
                                          pushMeta.lastPushedAt,
                                          nowMs,
                                      )
                                    : null;

                                if (isStaticCloud && pushMeta) {
                                    if (
                                        pushMeta.existsOnCi === false &&
                                        !pushedDisplay
                                    ) {
                                        return (
                                            <span
                                                className="inline-flex items-center gap-1 rounded-full bg-warn-tint px-2 py-0.5 text-[11px] font-medium text-warn"
                                                title={`${buildSecretName} was not found in ${ciPlatformLabel} Actions secrets yet`}
                                            >
                                                <Clock className="size-3" />
                                                <span>
                                                    Not on {ciPlatformLabel} yet
                                                </span>
                                            </span>
                                        );
                                    }

                                    if (
                                        pushMeta.modifiedSincePush &&
                                        pushedDisplay
                                    ) {
                                        return (
                                            <span
                                                className="inline-flex items-center gap-1 rounded-full bg-warn-tint px-2 py-0.5 text-[11px] font-medium text-warn"
                                                title={`${envFilename} was modified on disk after the last recorded push (${pushedDisplay.title})`}
                                            >
                                                <Clock className="size-3" />
                                                <span>
                                                    Edited locally · Last pushed{' '}
                                                    {pushedDisplay.label}
                                                </span>
                                            </span>
                                        );
                                    }

                                    if (pushedDisplay) {
                                        return (
                                            <span
                                                className="inline-flex items-center gap-1 rounded-full bg-ok-tint px-2 py-0.5 text-[11px] font-medium text-ok"
                                                title={`Last pushed to ${ciPlatformLabel} (${buildSecretName}): ${pushedDisplay.title}`}
                                            >
                                                <CheckCircle2 className="size-3" />
                                                <span>
                                                    Last pushed{' '}
                                                    {pushedDisplay.label}
                                                </span>
                                            </span>
                                        );
                                    }

                                    if (pushMeta.existsOnCi === true) {
                                        return (
                                            <span
                                                className="inline-flex items-center gap-1 rounded-full bg-ok-tint px-2 py-0.5 text-[11px] font-medium text-ok"
                                                title={`${buildSecretName} exists in ${ciPlatformLabel} Actions secrets (write-only; values cannot be read back)`}
                                            >
                                                <CheckCircle2 className="size-3" />
                                                <span>
                                                    Present on {ciPlatformLabel}
                                                </span>
                                            </span>
                                        );
                                    }
                                } else if (!isLocalEnv && pushedDisplay) {
                                    return (
                                        <span
                                            className="inline-flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 text-[11px] font-medium text-soft ring-1 ring-line"
                                            title={`Last pushed for ${activeEnv}: ${pushedDisplay.title}`}
                                        >
                                            <Clock className="size-3" />
                                            <span>
                                                Last pushed{' '}
                                                {pushedDisplay.label}
                                            </span>
                                        </span>
                                    );
                                }

                                return null;
                            })()}

                            {summary &&
                                (isStaticCloud ? (
                                    <span
                                        className="font-medium text-ink"
                                        title={`Variables synced from ${envFilename} into ${buildSecretName} on ${ciPlatformLabel} for image builds`}
                                    >
                                        {tableRows.length} build-time (.env)
                                    </span>
                                ) : (
                                    <>
                                        <span className="font-medium text-ok">
                                            {summary.inSync} in sync
                                        </span>
                                        {mountedLocalCount > 0 && (
                                            <span
                                                className="font-medium text-ok"
                                                title="Variables read directly from your mounted .env file in Local Dev"
                                            >
                                                {mountedLocalCount} mounted
                                                (.env)
                                            </span>
                                        )}
                                        {summary.drift > 0 && (
                                            <span className="font-medium text-warn">
                                                {summary.drift} drifted
                                            </span>
                                        )}
                                        {unpushedLocalCount > 0 && (
                                            <span className="font-medium text-warn">
                                                {unpushedLocalCount} local only
                                            </span>
                                        )}
                                        {summary.rotated > 0 && (
                                            <span className="font-medium text-brand">
                                                {summary.rotated} rotated by
                                                Vault
                                            </span>
                                        )}
                                    </>
                                ))}
                        </div>
                    )}
                </div>

                {/* Local Dev .env mount advisory banner */}
                {isLocalEnv && (
                    <div className="flex items-center gap-2 rounded-xl border border-line bg-paper/60 px-3 py-2 text-xs text-soft">
                        <Info className="size-3.5 shrink-0 text-brand" />
                        <span>
                            <strong>Local Dev Mount:</strong> Your{' '}
                            <code className="font-mono text-ink">.env</code>{' '}
                            file is mounted directly into local pods
                            {isStaticSpa ? (
                                <>
                                    , so variables stay live from disk (
                                    <strong className="text-ink">
                                        Mounted
                                    </strong>
                                    ). No cluster secret push needed.
                                </>
                            ) : (
                                <>
                                    , so non-secret keys stay live from disk (
                                    <strong className="text-ink">
                                        Mounted
                                    </strong>
                                    ). Secret keys are synced to{' '}
                                    <code className="font-mono text-ink">
                                        app-secrets
                                    </code>
                                    .
                                </>
                            )}
                        </span>
                    </div>
                )}

                {/* Static SPA advisory banner */}
                {isStaticSpa && (
                    <div className="flex items-center gap-2 rounded-xl border border-line bg-paper/60 px-3 py-2 text-xs text-soft">
                        <Info className="size-3.5 shrink-0 text-brand" />
                        <span>
                            <strong>Static SPA Notice:</strong> Static sites are
                            compiled into bundles at image build time and served
                            by Caddy with no runtime Kubernetes Secret.
                            {isStaticCloud ? (
                                <>
                                    {' '}
                                    Pushing syncs{' '}
                                    <code className="font-mono text-ink">
                                        {envFilename}
                                    </code>{' '}
                                    to{' '}
                                    <code className="font-mono text-ink">
                                        {buildSecretName}
                                    </code>{' '}
                                    in {ciPlatformLabel}.
                                </>
                            ) : (
                                ' Production variables are injected during CI or manual image builds.'
                            )}
                        </span>
                    </div>
                )}

                {/* Forgejo CLI (tea) authentication callout for static cloud */}
                {isStaticCloud &&
                    ciPlatform === 'forgejo' &&
                    activeEnvConfig?.ci?.teaLoggedIn === false && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/30 bg-warn-tint/50 px-3 py-2 text-xs text-ink">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="size-3.5 shrink-0 text-warn" />
                                <span>
                                    <strong>Forgejo CLI not logged in:</strong>{' '}
                                    Connect{' '}
                                    <code className="font-mono text-ink">
                                        tea
                                    </code>{' '}
                                    {activeEnvConfig?.ci?.forgejoHost
                                        ? `to ${activeEnvConfig.ci.forgejoHost}`
                                        : 'to your Forgejo instance'}{' '}
                                    before pushing{' '}
                                    <code className="font-mono text-ink">
                                        {buildSecretName}
                                    </code>
                                    .
                                </span>
                            </div>
                            {onOpenPipelineSettings && (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={onOpenPipelineSettings}
                                >
                                    <Key className="size-3.5 text-ink" />
                                    <span>Connect Forgejo (tea)</span>
                                </Button>
                            )}
                        </div>
                    )}

                {/* Notification / Feedback Banner */}
                {message && (
                    <div
                        className={cn(
                            'flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs',
                            message.type === 'ok' &&
                                'border-ok/30 bg-ok-tint text-ok',
                            message.type === 'warn' &&
                                'border-warn/30 bg-warn-tint text-warn',
                            message.type === 'error' &&
                                'border-accent/30 bg-accent-tint text-accent',
                        )}
                    >
                        <span>{message.text}</span>
                        <button
                            type="button"
                            onClick={() => setMessage(null)}
                            className="p-1 hover:opacity-70"
                        >
                            <X className="size-3" />
                        </button>
                    </div>
                )}

                {needsValue.length > 0 && (
                    <div className="mb-3 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                        <p className="font-semibold">
                            Needs a value ({needsValue.length})
                        </p>
                        <p className="mt-0.5">
                            These keys are empty in .env.{activeEnv}. Fill them
                            in before pushing or deploying:{' '}
                            <span className="font-mono">
                                {needsValue.join(', ')}
                            </span>
                        </p>
                        <label className="mt-1.5 flex cursor-pointer items-center gap-1.5">
                            <input
                                type="checkbox"
                                checked={leaveBlank}
                                onChange={(event) =>
                                    setLeaveBlank(event.target.checked)
                                }
                            />
                            <span>
                                Leave these blank and allow pushing anyway
                            </span>
                        </label>
                    </div>
                )}

                {/* Reusable Excel-Style Table */}
                <EnvironmentVariablesTable
                    rows={tableRows}
                    stagedChanges={stagedChanges}
                    onStageEdit={handleStageEdit}
                    onStageDelete={handleStageDelete}
                    onUnstageKey={handleUnstageKey}
                    draftRows={draftRows}
                    onChangeDraftRows={setDraftRows}
                    reveal={reveal}
                    loading={loading}
                    editable={editable}
                    canToggleSecret={false}
                    showStatusColumn
                    isLocalEnv={isLocalEnv}
                    isStaticSite={isStaticSpa}
                    secretTargetLabel="app-secrets"
                    configTargetLabel="app-config"
                />

                {/* Bottom Action Footer */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                    <div className="text-xs text-soft">
                        {hasStagedChanges ? (
                            <span className="font-medium text-warn">
                                ⚠ {stagedCount} unsaved change
                                {stagedCount === 1 ? '' : 's'} staged.
                            </span>
                        ) : isStaticCloud ? (
                            <span>
                                Build-time variables are synced to{' '}
                                <span className="font-medium text-ink">
                                    {ciPlatformLabel}
                                </span>{' '}
                                (
                                <code className="font-mono text-ink">
                                    {buildSecretName}
                                </code>
                                ) and mounted during image builds.
                            </span>
                        ) : (
                            <span>
                                Secrets synced directly to{' '}
                                <code className="font-mono text-ink">
                                    app-secrets
                                </code>{' '}
                                or OpenBao. No sensitive credentials reach CI.
                            </span>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {hasStagedChanges && editable ? (
                            <>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={discardChanges}
                                >
                                    <X className="size-3.5" />
                                    <span>Discard</span>
                                </Button>

                                {isStaticCloud ? (
                                    <InfoTooltip
                                        interactive
                                        align="right"
                                        trigger={
                                            <Button
                                                variant="primary"
                                                size="sm"
                                                onClick={() =>
                                                    handleSave(false)
                                                }
                                                disabled={saving}
                                            >
                                                <ArrowUpCircle className="size-3.5" />
                                                <span>
                                                    {saving
                                                        ? 'Saving…'
                                                        : `Save & Push to ${ciPlatformLabel}`}
                                                </span>
                                            </Button>
                                        }
                                    >
                                        Writes changes to {envFilename} on disk
                                        and uploads {buildSecretName} to{' '}
                                        {ciPlatformLabel} Secrets so the next
                                        image build picks them up.
                                    </InfoTooltip>
                                ) : (
                                    <>
                                        <InfoTooltip
                                            interactive
                                            align="right"
                                            trigger={
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() =>
                                                        handleSave(false)
                                                    }
                                                    disabled={saving}
                                                >
                                                    <ArrowUpCircle className="size-3.5 text-ink" />
                                                    <span>
                                                        {saving
                                                            ? 'Saving…'
                                                            : 'Save & Push'}
                                                    </span>
                                                </Button>
                                            }
                                        >
                                            Writes changes to {envFilename} on
                                            disk and pushes secret keys to the
                                            cluster (
                                            <code className="font-mono">
                                                app-secrets
                                            </code>{' '}
                                            / OpenBao). Running pods are not
                                            restarted.
                                        </InfoTooltip>

                                        <InfoTooltip
                                            interactive
                                            align="right"
                                            trigger={
                                                <Button
                                                    variant="primary"
                                                    size="sm"
                                                    onClick={() =>
                                                        handleSave(true)
                                                    }
                                                    disabled={saving}
                                                >
                                                    <Rocket className="size-3.5" />
                                                    <span>
                                                        {saving
                                                            ? 'Redeploying…'
                                                            : activeEnv ===
                                                                'local'
                                                              ? 'Save & Restart'
                                                              : 'Save & Redeploy'}
                                                    </span>
                                                </Button>
                                            }
                                        >
                                            Writes changes to {envFilename},
                                            pushes secret keys to the cluster,
                                            and performs a rolling restart of
                                            app pods so new values take effect
                                            immediately.
                                        </InfoTooltip>
                                    </>
                                )}
                            </>
                        ) : isStaticCloud ? (
                            <InfoTooltip
                                interactive
                                align="right"
                                trigger={
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled={pushing || pushBlocked}
                                        onClick={handlePush}
                                    >
                                        <ArrowUpCircle className="size-3.5 text-ink" />
                                        <span>
                                            {pushing
                                                ? 'Pushing…'
                                                : `Push to ${ciPlatformLabel}`}
                                        </span>
                                    </Button>
                                }
                            >
                                Uploads {envFilename} from disk as{' '}
                                <code className="font-mono">
                                    {buildSecretName}
                                </code>{' '}
                                in {ciPlatformLabel} Secrets so CI builds
                                receive your build-time variables.
                            </InfoTooltip>
                        ) : (
                            <>
                                <InfoTooltip
                                    interactive
                                    align="right"
                                    trigger={
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            disabled={pushing || pushBlocked}
                                            onClick={handlePush}
                                        >
                                            <ArrowUpCircle className="size-3.5 text-ink" />
                                            <span>
                                                {pushing
                                                    ? 'Pushing…'
                                                    : 'Push to Cluster'}
                                            </span>
                                        </Button>
                                    }
                                >
                                    Pushes secret keys from {envFilename} on
                                    disk into the cluster&apos;s{' '}
                                    <code className="font-mono">
                                        app-secrets
                                    </code>{' '}
                                    Secret (and OpenBao when active).
                                </InfoTooltip>

                                <InfoTooltip
                                    interactive
                                    align="right"
                                    trigger={
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            disabled={pulling}
                                            onClick={handlePull}
                                        >
                                            <ArrowDownCircle className="size-3.5 text-ink" />
                                            <span>
                                                {pulling
                                                    ? 'Pulling…'
                                                    : 'Pull to Disk'}
                                            </span>
                                        </Button>
                                    }
                                >
                                    Pulls secret keys from the cluster (OpenBao
                                    or{' '}
                                    <code className="font-mono">
                                        app-secrets
                                    </code>
                                    ) into your local {envFilename} file.
                                </InfoTooltip>

                                {activeEnv !== 'local' && editable && (
                                    <InfoTooltip
                                        interactive
                                        align="right"
                                        trigger={
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                disabled={saving}
                                                onClick={() => handleSave(true)}
                                            >
                                                <RotateCw className="size-3.5 text-ink" />
                                                <span>Redeploy Pods</span>
                                            </Button>
                                        }
                                    >
                                        Triggers a zero-downtime rolling restart
                                        across all application pods so updated
                                        variables take effect.
                                    </InfoTooltip>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            <ConfirmModal
                isOpen={confirmAction === 'push'}
                onClose={() => setConfirmAction(null)}
                onConfirm={executePush}
                title={
                    isStaticCloud
                        ? `Push ${buildSecretName} to ${ciPlatformLabel}?`
                        : `Push ${envFilename} secrets to ${activeEnv}?`
                }
                description={
                    isStaticCloud ? (
                        <>
                            Uploads build-time variables from your local{' '}
                            <code className="rounded bg-paper px-1 py-0.5 font-mono text-ink">
                                {envFilename}
                            </code>{' '}
                            to{' '}
                            <code className="rounded bg-paper px-1 py-0.5 font-mono text-ink">
                                {buildSecretName}
                            </code>{' '}
                            in <strong>{ciPlatformLabel}</strong> so CI image
                            builds pick them up.
                        </>
                    ) : (
                        <>
                            Pushes secret variables from your local{' '}
                            <code className="rounded bg-paper px-1 py-0.5 font-mono text-ink">
                                {envFilename}
                            </code>{' '}
                            into the cluster secrets for{' '}
                            <strong>{activeEnv}</strong>.
                        </>
                    )
                }
                notice={
                    isStaticCloud
                        ? 'CI secrets are write-only — overwrite happens immediately and existing keys cannot be read back.'
                        : undefined
                }
                confirmLabel={
                    isStaticCloud
                        ? `Push to ${ciPlatformLabel}`
                        : 'Push to Cluster'
                }
                tone="brand"
                icon={<ArrowUpCircle className="size-5" />}
                confirmIcon={<ArrowUpCircle className="size-3.5" />}
            />

            <ConfirmModal
                isOpen={confirmAction === 'pull'}
                onClose={() => setConfirmAction(null)}
                onConfirm={executePull}
                title={`Pull secrets into ${envFilename}?`}
                description={
                    <>
                        Pull secret variables from the{' '}
                        <strong>{activeEnv}</strong> cluster into your local{' '}
                        <code className="rounded bg-paper px-1 py-0.5 font-mono text-ink">
                            {envFilename}
                        </code>{' '}
                        file. Existing lines matching cluster keys will be
                        updated on disk.
                    </>
                }
                confirmLabel="Pull to Disk"
                tone="warn"
                icon={<ArrowDownCircle className="size-5" />}
                confirmIcon={<ArrowDownCircle className="size-3.5" />}
            />
        </Card>
    );
}
