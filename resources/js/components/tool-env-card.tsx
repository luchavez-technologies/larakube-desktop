import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, RotateCw, Save, Shield, X } from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
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
    status as statusRoute,
    update as updateRoute,
} from '@/routes/servers/tools/env';

type EnvItem = {
    key: string;
    secret: boolean;
    value: string;
};

type StatusResponse = {
    status: {
        exists: boolean;
        instance: string | null;
        namespace: string | null;
        vaulted: boolean;
        items: EnvItem[];
    } | null;
};

function csrfToken(): string {
    return (
        (
            document.querySelector(
                'meta[name="csrf-token"]',
            ) as HTMLMetaElement | null
        )?.content ?? ''
    );
}

/**
 * Custom environment variables for a Cluster App instance — vars a person
 * adds themselves (an external mail/DB service's settings, a feature-flag
 * boolean) layered on top of the tool, never the keys its own `:init`/
 * `:wire` logic manages. The Apps Store counterpart to Projects'
 * EnvironmentSecretsCard, minus any local/cluster diff — a Cluster App has
 * no local .env file, so the cluster is the only source of truth.
 */
export default function ToolEnvCard({
    server,
    tool,
}: {
    server: { name: string };
    tool: { tool: string; host?: string | null; instance?: string | null };
}) {
    const [loading, setLoading] = useState(true);
    const [reveal, setReveal] = useState(false);
    const revealRef = useRef(false);
    const [data, setData] = useState<StatusResponse['status']>(null);
    const [staged, setStaged] = useState<Record<string, StagedEnvChange>>({});
    const [draftRows, setDraftRows] = useState<DraftEnvRow[]>(() => [
        createDraftRow(),
    ]);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{
        text: string;
        type: 'ok' | 'error';
    } | null>(null);

    const domain = tool.host ?? tool.instance ?? '';
    const statusUrl = statusRoute({ server: server.name, tool: tool.tool }).url;
    const updateUrl = updateRoute({ server: server.name, tool: tool.tool }).url;

    const fetchStatus = useCallback(
        (showPlaintext: boolean) => {
            setLoading(true);
            const url = `${statusUrl}?domain=${encodeURIComponent(domain)}${showPlaintext ? '&reveal=1' : ''}`;
            fetch(url, { headers: { Accept: 'application/json' } })
                .then((res) => (res.ok ? res.json() : null))
                .then((res: StatusResponse | null) =>
                    setData(res?.status ?? null),
                )
                .catch(() => setData(null))
                .finally(() => setLoading(false));
        },
        [statusUrl, domain],
    );

    useEffect(() => {
        setStaged({});
        setDraftRows([createDraftRow()]);
        setMessage(null);
        fetchStatus(revealRef.current);
    }, [fetchStatus]);

    function toggleReveal() {
        const next = !reveal;
        revealRef.current = next;
        setReveal(next);
        fetchStatus(next);
    }

    function handleStageEdit(key: string, value: string, isSecret: boolean) {
        setStaged((prev) => ({
            ...prev,
            [key]: { value, isSecret },
        }));
    }

    function handleStageDelete(key: string, isSecret: boolean) {
        setStaged((prev) => ({
            ...prev,
            [key]: { value: null, isSecret },
        }));
    }

    function handleUnstageKey(key: string) {
        setStaged((prev) => {
            const next = { ...prev };
            delete next[key];

            return next;
        });
    }

    function discardChanges() {
        setStaged({});
        setDraftRows([createDraftRow()]);
    }

    const combinedChanges = useMemo(() => {
        const map = new Map<string, StagedEnvChange>();
        for (const [key, change] of Object.entries(staged)) {
            map.set(key, change);
        }
        for (const draft of draftRows) {
            const key = normalizeEnvKey(draft.key);
            if (key !== '') {
                map.set(key, { value: draft.value, isSecret: draft.isSecret });
            }
        }

        return map;
    }, [staged, draftRows]);

    const stagedCount = combinedChanges.size;
    const hasStaged = stagedCount > 0;

    async function handleSave(restart: boolean) {
        setSaving(true);
        setMessage(null);

        const set: Record<string, string> = {};
        const setSecret: Record<string, string> = {};
        const unset: string[] = [];

        for (const [key, change] of combinedChanges.entries()) {
            if (change.value === null) {
                unset.push(key);
            } else if (change.isSecret) {
                setSecret[key] = change.value;
            } else {
                set[key] = change.value;
            }
        }

        try {
            const response = await fetch(updateUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken(),
                },
                body: JSON.stringify({
                    domain,
                    set,
                    setSecret,
                    unset,
                    restart,
                }),
            });
            const result = await response.json();

            if (result.success) {
                setMessage({
                    text: restart
                        ? 'Saved and restarted.'
                        : result.vaulted
                          ? 'Saved — secret(s) also mirrored into OpenBao.'
                          : 'Saved.',
                    type: 'ok',
                });
                setStaged({});
                setDraftRows([createDraftRow()]);
                fetchStatus(reveal);
            } else {
                setMessage({
                    text: result.error ?? 'Failed to save.',
                    type: 'error',
                });
            }
        } catch {
            setMessage({ text: 'Network error while saving.', type: 'error' });
        } finally {
            setSaving(false);
        }
    }

    const tableRows = useMemo<EnvTableRow[]>(
        () =>
            (data?.items ?? []).map((item) => ({
                key: item.key,
                value: item.value,
                isSecret: item.secret,
            })),
        [data],
    );

    return (
        <Card
            label="Custom Environment Variables"
            action={
                <div className="flex items-center gap-2">
                    {data?.vaulted && (
                        <span
                            className="bg-brand-tint inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium text-brand"
                            title="OpenBao Vault is active on this cluster. Secret values are mirrored there for backup."
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
                        <span>{reveal ? 'Hide' : 'Reveal'}</span>
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => fetchStatus(reveal)}
                        disabled={loading}
                        title="Refresh custom environment variables"
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
                <p className="text-xs leading-relaxed text-soft">
                    Your own vars layered on top of this app — an external
                    mail/DB service&apos;s settings, a feature flag — never the
                    keys its install already manages.
                </p>

                {message && (
                    <div
                        className={cn(
                            'flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs',
                            message.type === 'ok'
                                ? 'border-ok/30 bg-ok-tint text-ok'
                                : 'border-accent/30 bg-accent-tint text-accent',
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

                <EnvironmentVariablesTable
                    rows={tableRows}
                    stagedChanges={staged}
                    onStageEdit={handleStageEdit}
                    onStageDelete={handleStageDelete}
                    onUnstageKey={handleUnstageKey}
                    draftRows={draftRows}
                    onChangeDraftRows={setDraftRows}
                    reveal={reveal}
                    loading={loading}
                    canToggleSecret
                    showStatusColumn={false}
                    secretTargetLabel="custom-secret"
                    configTargetLabel="custom-config"
                    emptyMessage="No custom environment variables yet."
                />

                {hasStaged && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                        <span className="text-xs font-medium text-warn">
                            ⚠ {stagedCount} unsaved change
                            {stagedCount === 1 ? '' : 's'} staged.
                        </span>

                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={saving}
                                onClick={discardChanges}
                            >
                                <X className="size-3.5" />
                                <span>Discard</span>
                            </Button>
                            <InfoTooltip
                                interactive
                                align="right"
                                trigger={
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        disabled={saving}
                                        onClick={() => handleSave(false)}
                                    >
                                        {saving ? (
                                            <RotateCw className="size-3.5 animate-spin" />
                                        ) : (
                                            <Save className="size-3.5" />
                                        )}
                                        <span>
                                            Save {stagedCount}{' '}
                                            {stagedCount === 1
                                                ? 'change'
                                                : 'changes'}
                                        </span>
                                    </Button>
                                }
                            >
                                Updates the app&apos;s{' '}
                                <code className="font-mono">custom-config</code>{' '}
                                ConfigMap and{' '}
                                <code className="font-mono">custom-secret</code>{' '}
                                Secret (mirrored to OpenBao if active). Does not
                                restart running pods.
                            </InfoTooltip>

                            <InfoTooltip
                                interactive
                                align="right"
                                trigger={
                                    <Button
                                        type="button"
                                        size="sm"
                                        disabled={saving}
                                        onClick={() => handleSave(true)}
                                    >
                                        <RotateCw
                                            className={cn(
                                                'size-3.5',
                                                saving && 'animate-spin',
                                            )}
                                        />
                                        <span>Save &amp; Restart App</span>
                                    </Button>
                                }
                            >
                                Saves custom variables to the cluster and
                                restarts the app&apos;s pods so new values take
                                effect right away.
                            </InfoTooltip>
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
}
