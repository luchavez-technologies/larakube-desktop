import { useEffect, useState } from 'react';
import {
    Eye,
    EyeOff,
    Key,
    Pencil,
    Plus,
    RotateCw,
    Shield,
    Trash2,
    X,
} from 'lucide-react';
import Button from '@/components/button';
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

/** key -> staged edit; value null means "remove this key" */
type StagedChange = { value: string | null; secret: boolean };

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
    const [data, setData] = useState<StatusResponse['status']>(null);
    const [staged, setStaged] = useState<Record<string, StagedChange>>({});
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const [newIsSecret, setNewIsSecret] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{
        text: string;
        type: 'ok' | 'error';
    } | null>(null);

    const domain = tool.host ?? tool.instance ?? '';
    const statusUrl = statusRoute({ server: server.name, tool: tool.tool }).url;
    const updateUrl = updateRoute({ server: server.name, tool: tool.tool }).url;

    function fetchStatus(showPlaintext: boolean = reveal) {
        setLoading(true);
        const url = `${statusUrl}?domain=${encodeURIComponent(domain)}${showPlaintext ? '&reveal=1' : ''}`;
        fetch(url, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : null))
            .then((res: StatusResponse | null) => setData(res?.status ?? null))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }

    useEffect(() => {
        setStaged({});
        setEditingKey(null);
        setIsAdding(false);
        setMessage(null);
        fetchStatus(reveal);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [server.name, tool.tool, domain]);

    function toggleReveal() {
        const next = !reveal;
        setReveal(next);
        fetchStatus(next);
    }

    function startEdit(item: EnvItem) {
        setEditingKey(item.key);
        setEditingValue(staged[item.key]?.value ?? item.value);
    }

    function commitEdit(item: EnvItem) {
        setStaged((prev) => ({
            ...prev,
            [item.key]: { value: editingValue, secret: item.secret },
        }));
        setEditingKey(null);
        setEditingValue('');
    }

    function stageDelete(item: EnvItem) {
        if (!confirm(`Remove '${item.key}'?`)) return;
        setStaged((prev) => ({
            ...prev,
            [item.key]: { value: null, secret: item.secret },
        }));
    }

    function commitNew() {
        const key = newKey.trim().toUpperCase().replace(/\s+/g, '_');
        if (!key) return;
        setStaged((prev) => ({
            ...prev,
            [key]: { value: newValue, secret: newIsSecret },
        }));
        setIsAdding(false);
        setNewKey('');
        setNewValue('');
        setNewIsSecret(false);
    }

    async function handleSave(restart: boolean) {
        setSaving(true);
        setMessage(null);

        const set: Record<string, string> = {};
        const setSecret: Record<string, string> = {};
        const unset: string[] = [];
        for (const [key, change] of Object.entries(staged)) {
            if (change.value === null) {
                unset.push(key);
            } else if (change.secret) {
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

    const items = data?.items ?? [];
    const hasStaged = Object.keys(staged).length > 0;

    return (
        <div className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] font-semibold tracking-wider text-faint uppercase">
                    Custom Environment Variables
                </span>
                <div className="flex items-center gap-2">
                    {data?.vaulted && (
                        <span
                            className="inline-flex items-center gap-1 text-[10px] font-medium text-brand"
                            title="OpenBao Vault is active on this cluster. Secret values are mirrored there for backup."
                        >
                            <Shield className="size-3" />
                            OpenBao
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={toggleReveal}
                        className="inline-flex items-center gap-1 text-[10px] font-medium text-soft hover:text-ink"
                    >
                        {reveal ? (
                            <EyeOff className="size-3" />
                        ) : (
                            <Eye className="size-3" />
                        )}
                        {reveal ? 'Hide' : 'Reveal'}
                    </button>
                </div>
            </div>

            <p className="mb-3 text-[11px] leading-relaxed text-soft">
                Your own vars layered on top of this app — an external mail/DB
                service's settings, a feature flag — never the keys its install
                already manages.
            </p>

            {loading ? (
                <p className="text-[11px] text-soft">Loading…</p>
            ) : (
                <div className="space-y-1.5">
                    {items.length === 0 && !isAdding && (
                        <p className="rounded-xl border border-dashed border-line px-3 py-2.5 text-center text-[11px] text-soft">
                            No custom environment variables yet.
                        </p>
                    )}
                    {items.map((item) => {
                        const change = staged[item.key];
                        if (change?.value === null) {
                            return (
                                <div
                                    key={item.key}
                                    className="flex items-center justify-between rounded-lg bg-accent/5 px-3 py-2 text-xs line-through opacity-60"
                                >
                                    <span className="font-mono">
                                        {item.key}
                                    </span>
                                    <span className="text-[10px]">removed</span>
                                </div>
                            );
                        }

                        const isEditing = editingKey === item.key;

                        return (
                            <div
                                key={item.key}
                                className={cn(
                                    'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs',
                                    change ? 'bg-brand/5' : 'bg-paper',
                                )}
                            >
                                <div className="flex min-w-0 items-center gap-1.5">
                                    {item.secret && (
                                        <Key className="size-3 shrink-0 text-faint" />
                                    )}
                                    <span className="truncate font-mono font-medium text-ink">
                                        {item.key}
                                    </span>
                                </div>
                                {isEditing ? (
                                    <div className="flex items-center gap-1">
                                        <input
                                            autoFocus
                                            value={editingValue}
                                            onChange={(e) =>
                                                setEditingValue(e.target.value)
                                            }
                                            className="w-36 rounded border-0 bg-surface px-2 py-1 font-mono text-[11px] ring-1 ring-line outline-none focus:ring-2 focus:ring-brand"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => commitEdit(item)}
                                            className="text-brand"
                                        >
                                            Save
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setEditingKey(null)}
                                            className="text-soft"
                                        >
                                            <X className="size-3" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex shrink-0 items-center gap-2">
                                        <span className="truncate font-mono text-[11px] text-soft">
                                            {change?.value ?? item.value}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => startEdit(item)}
                                            className="text-soft hover:text-ink"
                                        >
                                            <Pencil className="size-3" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => stageDelete(item)}
                                            className="text-soft hover:text-accent"
                                        >
                                            <Trash2 className="size-3" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {isAdding ? (
                        <div className="space-y-2 rounded-lg bg-paper p-2.5">
                            <div className="flex items-center gap-1.5">
                                <input
                                    autoFocus
                                    placeholder="KEY"
                                    value={newKey}
                                    onChange={(e) => setNewKey(e.target.value)}
                                    className="w-1/2 rounded border-0 bg-surface px-2 py-1 font-mono text-[11px] ring-1 ring-line outline-none focus:ring-2 focus:ring-brand"
                                />
                                <input
                                    placeholder="value"
                                    value={newValue}
                                    onChange={(e) =>
                                        setNewValue(e.target.value)
                                    }
                                    className="w-1/2 rounded border-0 bg-surface px-2 py-1 font-mono text-[11px] ring-1 ring-line outline-none focus:ring-2 focus:ring-brand"
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-soft">
                                    <input
                                        type="checkbox"
                                        checked={newIsSecret}
                                        onChange={(e) =>
                                            setNewIsSecret(e.target.checked)
                                        }
                                    />
                                    Secret
                                </label>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setIsAdding(false)}
                                        className="text-[11px] text-soft"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={commitNew}
                                        className="text-[11px] font-medium text-brand"
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setIsAdding(true)}
                            className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-line py-2 text-[11px] font-medium text-soft hover:border-brand/50 hover:text-brand"
                        >
                            <Plus className="size-3" />
                            Add Variable
                        </button>
                    )}
                </div>
            )}

            {message && (
                <p
                    className={cn(
                        'mt-2.5 text-[11px]',
                        message.type === 'ok' ? 'text-ok' : 'text-accent',
                    )}
                >
                    {message.text}
                </p>
            )}

            {hasStaged && (
                <div className="mt-3 flex items-center justify-end gap-2">
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={saving}
                        onClick={() => setStaged({})}
                    >
                        Discard
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={saving}
                        onClick={() => handleSave(false)}
                    >
                        {saving ? (
                            <RotateCw className="size-3 animate-spin" />
                        ) : null}
                        Save
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        disabled={saving}
                        onClick={() => handleSave(true)}
                    >
                        {saving ? (
                            <RotateCw className="size-3 animate-spin" />
                        ) : null}
                        Save &amp; Restart App
                    </Button>
                </div>
            )}
        </div>
    );
}
