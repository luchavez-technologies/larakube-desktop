import { useEffect, useMemo, useState } from 'react';
import { router } from '@inertiajs/react';
import {
    ArrowDownCircle,
    ArrowUpCircle,
    Check,
    Eye,
    EyeOff,
    FileText,
    Globe,
    Info,
    Lock,
    Pencil,
    Plus,
    Rocket,
    RotateCw,
    Search,
    Shield,
    Trash2,
    X,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import StatusPill from '@/components/status-pill';
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
    activeEnvConfig,
    customEndpoints,
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
}) {
    const [loading, setLoading] = useState(true);
    const [reveal, setReveal] = useState(false);
    const [data, setData] = useState<DriftStatusResponse['status'] | null>(
        null,
    );
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<
        'all' | 'secrets' | 'config' | 'drift'
    >('all');

    // Staged variable updates: key -> newValue (or null for deletion)
    const [stagedChanges, setStagedChanges] = useState<
        Record<string, string | null>
    >({});
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState('');

    // Inline Add Form
    const [isAdding, setIsAdding] = useState(false);
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const [newIsSecret, setNewIsSecret] = useState(false);

    // Network states
    const [saving, setSaving] = useState(false);
    const [pushing, setPushing] = useState(false);
    const [pulling, setPulling] = useState(false);
    const [message, setMessage] = useState<{
        text: string;
        type: 'ok' | 'warn' | 'error';
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

    const envFilename = activeEnv === 'local' ? '.env' : `.env.${activeEnv}`;
    const isStaticSpa =
        ['astro', 'vite', 'vue', 'react', 'svelte', 'solid'].includes(
            project.framework?.toLowerCase() ?? '',
        ) && !activeEnvConfig?.components?.includes('ssr');

    const isOpenBaoActive =
        Boolean(data?.summary?.rotated && data.summary.rotated > 0) ||
        Boolean(activeEnvConfig?.components?.includes('openbao')) ||
        Boolean(activeEnvConfig?.plex?.includes('openbao'));

    function fetchStatus(showPlaintext: boolean = reveal) {
        if (!statusUrl) return;
        setLoading(true);
        const url = `${statusUrl}?environment=${encodeURIComponent(activeEnv)}${showPlaintext ? '&reveal=1' : ''}`;
        fetch(url, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : null))
            .then((res: DriftStatusResponse | null) => {
                setData(res?.status ?? null);
            })
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }

    useEffect(() => {
        setStagedChanges({});
        setEditingKey(null);
        setIsAdding(false);
        setMessage(null);
        fetchStatus(reveal);
    }, [activeEnv, statusUrl]);

    function toggleReveal() {
        const nextReveal = !reveal;
        setReveal(nextReveal);
        fetchStatus(nextReveal);
    }

    function startEdit(item: DriftItem) {
        setEditingKey(item.key);
        setEditingValue(stagedChanges[item.key] ?? item.local ?? '');
    }

    function cancelEdit() {
        setEditingKey(null);
        setEditingValue('');
    }

    function commitEdit(key: string) {
        setStagedChanges((prev) => ({
            ...prev,
            [key]: editingValue,
        }));
        setEditingKey(null);
        setEditingValue('');
    }

    function stageDelete(key: string) {
        if (!confirm(`Are you sure you want to remove '${key}'?`)) {
            return;
        }
        setStagedChanges((prev) => ({
            ...prev,
            [key]: null,
        }));
    }

    function commitNew() {
        const key = newKey.trim().toUpperCase().replace(/\s+/g, '_');
        if (!key) return;
        setStagedChanges((prev) => ({
            ...prev,
            [key]: newValue,
        }));
        setIsAdding(false);
        setNewKey('');
        setNewValue('');
        setNewIsSecret(false);
    }

    function cancelNew() {
        setIsAdding(false);
        setNewKey('');
        setNewValue('');
        setNewIsSecret(false);
    }

    function discardChanges() {
        setStagedChanges({});
        setEditingKey(null);
        setIsAdding(false);
    }

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
                            ) as HTMLMetaElement
                        )?.content ?? '',
                },
                body: JSON.stringify({
                    environment: activeEnv,
                    variables: stagedChanges,
                    redeploy,
                }),
            });

            const result = await response.json();
            if (result.success) {
                setMessage({
                    text: result.message,
                    type: 'ok',
                });
                setStagedChanges({});
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
        if (
            !confirm(
                `Push secret variables from local ${envFilename} into the cluster secrets for '${activeEnv}'?`,
            )
        ) {
            return;
        }
        setPushing(true);
        router.post(
            pushUrl,
            { environment: activeEnv },
            {
                preserveScroll: true,
                onFinish: () => {
                    setPushing(false);
                    fetchStatus(reveal);
                },
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
            pullUrl,
            { environment: activeEnv },
            {
                preserveScroll: true,
                onFinish: () => {
                    setPulling(false);
                    fetchStatus(reveal);
                },
            },
        );
    }

    // Merge cluster/local items with staged changes
    const displayedItems = useMemo(() => {
        const rawItems = data?.items ?? [];
        const map = new Map<string, DriftItem>();

        for (const item of rawItems) {
            map.set(item.key, { ...item });
        }

        // Apply staged changes
        for (const [key, value] of Object.entries(stagedChanges)) {
            if (value === null) {
                // Staged deletion
                if (map.has(key)) {
                    map.set(key, {
                        ...map.get(key)!,
                        local: null,
                        status: 'only_cluster',
                    });
                }
            } else {
                const existing = map.get(key);
                const isSecret =
                    existing?.isSecret ??
                    (key.includes('SECRET') ||
                        key.includes('KEY') ||
                        key.includes('PASSWORD') ||
                        key.includes('TOKEN'));

                map.set(key, {
                    key,
                    status: existing?.cluster !== null ? 'drift' : 'only_local',
                    isSecret,
                    isExcluded: existing?.isExcluded ?? false,
                    local: value,
                    cluster: existing?.cluster ?? null,
                });
            }
        }

        let list = Array.from(map.values());

        // Apply search filter
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            list = list.filter((i) => i.key.toLowerCase().includes(q));
        }

        // Apply type filter
        if (filter === 'secrets') {
            list = list.filter((i) => i.isSecret);
        } else if (filter === 'config') {
            list = list.filter((i) => !i.isSecret);
        } else if (filter === 'drift') {
            list = list.filter(
                (i) =>
                    i.status === 'drift' ||
                    i.status === 'only_local' ||
                    i.status === 'only_cluster',
            );
        }

        return list.sort((a, b) => a.key.localeCompare(b.key));
    }, [data, stagedChanges, search, filter]);

    const hasStagedChanges = Object.keys(stagedChanges).length > 0;
    const summary = data?.summary;

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
                        className="gap-1.5"
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
                        className="gap-1.5"
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
                            {data?.namespace
                                ? `${data.namespace} (app-secrets / app-config)`
                                : 'Cluster Secret / ConfigMap'}
                        </span>
                    </div>

                    {summary && (
                        <div className="flex items-center gap-3">
                            <span className="font-medium text-ok">
                                {summary.inSync} in sync
                            </span>
                            {summary.drift > 0 && (
                                <span className="font-medium text-warn">
                                    {summary.drift} drifted
                                </span>
                            )}
                            {summary.onlyLocal > 0 && (
                                <span className="font-medium text-soft">
                                    {summary.onlyLocal} local only
                                </span>
                            )}
                            {summary.rotated > 0 && (
                                <span className="font-medium text-brand">
                                    {summary.rotated} rotated by Vault
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Static SPA advisory banner */}
                {isStaticSpa && (
                    <div className="flex items-center gap-2 rounded-xl border border-line bg-paper/60 px-3 py-2 text-xs text-soft">
                        <Info className="size-3.5 shrink-0 text-brand" />
                        <span>
                            <strong>Static SPA Notice:</strong> Public variables
                            (
                            <code className="font-mono text-ink">PUBLIC_*</code>
                            , <code className="font-mono text-ink">VITE_*</code>
                            ) are baked into JavaScript bundles at build time.
                            Updating them requires a build/redeploy.
                        </span>
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

                {/* Search & Filter Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-soft" />
                            <input
                                type="text"
                                placeholder="Search variables…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="h-8 rounded-lg border border-line bg-surface pr-3 pl-8 text-xs text-ink placeholder:text-soft focus:border-brand focus:outline-hidden"
                            />
                        </div>

                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => setFilter('all')}
                                className={cn(
                                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                                    filter === 'all'
                                        ? 'bg-paper font-semibold text-ink'
                                        : 'text-soft hover:text-ink',
                                )}
                            >
                                All
                            </button>
                            <button
                                type="button"
                                onClick={() => setFilter('secrets')}
                                className={cn(
                                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                                    filter === 'secrets'
                                        ? 'bg-paper font-semibold text-ink'
                                        : 'text-soft hover:text-ink',
                                )}
                            >
                                Secrets
                            </button>
                            <button
                                type="button"
                                onClick={() => setFilter('config')}
                                className={cn(
                                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                                    filter === 'config'
                                        ? 'bg-paper font-semibold text-ink'
                                        : 'text-soft hover:text-ink',
                                )}
                            >
                                Config
                            </button>
                            <button
                                type="button"
                                onClick={() => setFilter('drift')}
                                className={cn(
                                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                                    filter === 'drift'
                                        ? 'bg-paper font-semibold text-ink'
                                        : 'text-soft hover:text-ink',
                                )}
                            >
                                Drifted
                            </button>
                        </div>
                    </div>

                    {!isAdding && (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                                setIsAdding(true);
                                setNewKey('');
                                setNewValue('');
                            }}
                            className="gap-1.5"
                        >
                            <Plus className="size-3.5" />
                            <span>Add Variable</span>
                        </Button>
                    )}
                </div>

                {/* Inline Add Variable Form */}
                {isAdding && (
                    <div className="bg-brand-tint/20 flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 p-3">
                        <input
                            type="text"
                            placeholder="KEY_NAME (e.g. STRIPE_KEY)"
                            value={newKey}
                            onChange={(e) => setNewKey(e.target.value)}
                            className="h-8 min-w-[180px] flex-1 rounded-lg border border-line bg-surface px-3 font-mono text-xs font-semibold text-ink focus:border-brand focus:outline-hidden"
                        />
                        <input
                            type="text"
                            placeholder="Value"
                            value={newValue}
                            onChange={(e) => setNewValue(e.target.value)}
                            className="h-8 min-w-[180px] flex-1 rounded-lg border border-line bg-surface px-3 font-mono text-xs text-ink focus:border-brand focus:outline-hidden"
                        />
                        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink select-none">
                            <input
                                type="checkbox"
                                checked={newIsSecret}
                                onChange={(e) =>
                                    setNewIsSecret(e.target.checked)
                                }
                                className="rounded border-line"
                            />
                            <span>Is Secret</span>
                        </label>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={commitNew}
                            className="gap-1"
                        >
                            <Check className="size-3.5" />
                            <span>Stage</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={cancelNew}
                            className="gap-1"
                        >
                            <X className="size-3.5" />
                            <span>Cancel</span>
                        </Button>
                    </div>
                )}

                {/* Variables Table */}
                <div className="overflow-hidden rounded-xl border border-line">
                    <table className="w-full border-collapse text-left text-xs">
                        <thead>
                            <tr className="border-b border-line bg-paper/60 text-soft">
                                <th className="px-3 py-2 font-medium">
                                    Variable
                                </th>
                                <th className="px-3 py-2 font-medium">
                                    Target
                                </th>
                                <th className="px-3 py-2 font-medium">
                                    Value (Local)
                                </th>
                                <th className="px-3 py-2 font-medium">
                                    Status
                                </th>
                                <th className="px-3 py-2 text-right font-medium">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line bg-surface">
                            {displayedItems.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="px-4 py-8 text-center text-soft"
                                    >
                                        {loading
                                            ? 'Loading environment variables…'
                                            : search
                                              ? 'No variables match your search.'
                                              : 'No environment variables found.'}
                                    </td>
                                </tr>
                            ) : (
                                displayedItems.map((item) => {
                                    const isEditing = editingKey === item.key;
                                    const isStaged = item.key in stagedChanges;
                                    const isDeleted =
                                        stagedChanges[item.key] === null;

                                    return (
                                        <tr
                                            key={item.key}
                                            className={cn(
                                                'transition-colors hover:bg-paper/40',
                                                isStaged &&
                                                    'bg-brand-tint/10 font-medium',
                                                isDeleted &&
                                                    'line-through opacity-50',
                                            )}
                                        >
                                            {/* Key Column */}
                                            <td className="px-3 py-2.5 font-mono">
                                                <div className="flex items-center gap-2">
                                                    {item.isSecret ? (
                                                        <span title="Secret (OpenBao / app-secrets)">
                                                            <Lock className="size-3 shrink-0 text-amber-500" />
                                                        </span>
                                                    ) : (
                                                        <span title="Public Config (app-config)">
                                                            <Globe className="size-3 shrink-0 text-blue-500" />
                                                        </span>
                                                    )}
                                                    <span className="font-semibold text-ink">
                                                        {item.key}
                                                    </span>
                                                    {item.status ===
                                                        'rotated' && (
                                                        <span
                                                            className="py-0.2 rounded-full bg-ok-tint px-1.5 text-[10px] text-ok"
                                                            title="Generated or rotated by OpenBao Vault"
                                                        >
                                                            Vault Rotated
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Target Destination Column */}
                                            <td className="px-3 py-2.5 text-soft">
                                                <span className="font-mono text-[11px]">
                                                    {item.isSecret
                                                        ? 'app-secrets'
                                                        : 'app-config'}
                                                </span>
                                            </td>

                                            {/* Value Column */}
                                            <td className="px-3 py-2.5 font-mono">
                                                {isEditing ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <input
                                                            type="text"
                                                            value={editingValue}
                                                            onChange={(e) =>
                                                                setEditingValue(
                                                                    e.target
                                                                        .value,
                                                                )
                                                            }
                                                            className="h-7 w-full min-w-[140px] rounded border border-brand bg-surface px-2 text-xs text-ink focus:outline-hidden"
                                                            autoFocus
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                commitEdit(
                                                                    item.key,
                                                                )
                                                            }
                                                            className="rounded p-1 text-ok hover:bg-paper"
                                                            title="Apply change"
                                                        >
                                                            <Check className="size-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={cancelEdit}
                                                            className="rounded p-1 text-soft hover:bg-paper"
                                                            title="Cancel"
                                                        >
                                                            <X className="size-3.5" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="break-all text-ink">
                                                        {item.local === null ? (
                                                            <span className="text-soft italic">
                                                                (not on disk)
                                                            </span>
                                                        ) : item.isSecret &&
                                                          !reveal ? (
                                                            '••••••••••••'
                                                        ) : item.local ===
                                                          '' ? (
                                                            <span className="text-soft italic">
                                                                (empty)
                                                            </span>
                                                        ) : (
                                                            item.local
                                                        )}
                                                    </span>
                                                )}
                                            </td>

                                            {/* Status Badge Column */}
                                            <td className="px-3 py-2.5">
                                                {item.status === 'in_sync' ? (
                                                    <StatusPill tone="ok">
                                                        In Sync
                                                    </StatusPill>
                                                ) : item.status === 'drift' ? (
                                                    <StatusPill tone="warn">
                                                        Drifted
                                                    </StatusPill>
                                                ) : item.status ===
                                                  'only_local' ? (
                                                    <StatusPill tone="muted">
                                                        Local Only
                                                    </StatusPill>
                                                ) : item.status ===
                                                  'only_cluster' ? (
                                                    <StatusPill tone="bad">
                                                        Cluster Only
                                                    </StatusPill>
                                                ) : item.status ===
                                                  'rotated' ? (
                                                    <StatusPill tone="ok">
                                                        Vault Managed
                                                    </StatusPill>
                                                ) : (
                                                    <StatusPill tone="muted">
                                                        {item.status}
                                                    </StatusPill>
                                                )}
                                            </td>

                                            {/* Row Actions */}
                                            <td className="px-3 py-2.5 text-right">
                                                {!isEditing && (
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                startEdit(item)
                                                            }
                                                            className="rounded-md p-1.5 text-soft transition-colors hover:bg-paper hover:text-ink"
                                                            title="Edit variable"
                                                        >
                                                            <Pencil className="size-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                stageDelete(
                                                                    item.key,
                                                                )
                                                            }
                                                            className="rounded-md p-1.5 text-soft transition-colors hover:bg-paper hover:text-accent"
                                                            title="Delete variable"
                                                        >
                                                            <Trash2 className="size-3.5" />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Bottom Action Footer */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                    <div className="text-xs text-soft">
                        {hasStagedChanges ? (
                            <span className="font-medium text-warn">
                                ⚠ {Object.keys(stagedChanges).length} unsaved
                                change(s) staged.
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
                        {hasStagedChanges ? (
                            <>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={discardChanges}
                                    className="gap-1.5"
                                >
                                    <X className="size-3.5" />
                                    <span>Discard</span>
                                </Button>

                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => handleSave(false)}
                                    disabled={saving}
                                    className="gap-1.5"
                                    title="Save to disk and push to cluster secrets"
                                >
                                    <ArrowUpCircle className="size-3.5 text-ink" />
                                    <span>
                                        {saving ? 'Saving…' : 'Save & Push'}
                                    </span>
                                </Button>

                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => handleSave(true)}
                                    disabled={saving}
                                    className="gap-1.5"
                                    title="Save to disk, push to cluster secrets, and restart all application pods"
                                >
                                    <Rocket className="size-3.5" />
                                    <span>
                                        {saving
                                            ? 'Redeploying…'
                                            : activeEnv === 'local'
                                              ? 'Save & Restart'
                                              : 'Save & Redeploy'}
                                    </span>
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={pushing}
                                    onClick={handlePush}
                                    className="gap-1.5"
                                    title="Push secret keys from disk to the cluster"
                                >
                                    <ArrowUpCircle className="size-3.5 text-ink" />
                                    <span>
                                        {pushing
                                            ? 'Pushing…'
                                            : 'Push to Cluster'}
                                    </span>
                                </Button>

                                <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={pulling}
                                    onClick={handlePull}
                                    className="gap-1.5"
                                    title="Pull secret keys from the cluster into local disk"
                                >
                                    <ArrowDownCircle className="size-3.5 text-ink" />
                                    <span>
                                        {pulling ? 'Pulling…' : 'Pull to Disk'}
                                    </span>
                                </Button>

                                {activeEnv !== 'local' && (
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled={saving}
                                        onClick={() => handleSave(true)}
                                        className="gap-1.5"
                                        title="Trigger a zero-downtime rolling restart across all application pods"
                                    >
                                        <RotateCw className="size-3.5 text-ink" />
                                        <span>Redeploy Pods</span>
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </Card>
    );
}
