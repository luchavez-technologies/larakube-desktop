import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, RotateCcw, Save } from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import { cn } from '@/lib/utils';
import {
    status as statusRoute,
    update as updateRoute,
} from '@/routes/servers/tools/env';

export type ToolSetting = {
    key: string;
    label: string;
    help: string;
    type: 'boolean' | 'number';
    default: string;
    unit: string | null;
    value: string;
    overridden: boolean;
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
 * An app's settings as a form: switches and numbers with plain-language help,
 * instead of raw environment variables. The app's CLI declares them; each is
 * saved as a custom variable, which overrides the app's default. The app reads
 * them at start, so saving restarts it. Renders nothing for an app with none.
 */
export default function ToolSettingsCard({
    server,
    tool,
}: {
    server: { name: string };
    tool: { tool: string; host?: string | null; instance?: string | null };
}) {
    const [settings, setSettings] = useState<ToolSetting[] | null>(null);
    const [draft, setDraft] = useState<Record<string, string>>({});
    const [resets, setResets] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{
        text: string;
        type: 'ok' | 'error';
    } | null>(null);

    const domain = tool.host ?? tool.instance ?? '';
    const statusUrl = statusRoute({ server: server.name, tool: tool.tool }).url;
    const updateUrl = updateRoute({ server: server.name, tool: tool.tool }).url;

    const load = useCallback(() => {
        fetch(`${statusUrl}?domain=${encodeURIComponent(domain)}`, {
            headers: { Accept: 'application/json' },
        })
            .then((res) => (res.ok ? res.json() : null))
            .then(
                (res: { status: { settings?: ToolSetting[] } | null } | null) =>
                    setSettings(res?.status?.settings ?? []),
            )
            .catch(() => setSettings([]));
    }, [statusUrl, domain]);

    useEffect(() => {
        setDraft({});
        setResets([]);
        load();
    }, [load]);

    if (settings === null || settings.length === 0) {
        return null;
    }

    const valueOf = (setting: ToolSetting): string =>
        resets.includes(setting.key)
            ? setting.default
            : (draft[setting.key] ?? setting.value);

    const change = (setting: ToolSetting, value: string) => {
        setResets((prev) => prev.filter((key) => key !== setting.key));
        setDraft((prev) => {
            const next = { ...prev };
            if (value === setting.value) {
                delete next[setting.key];
            } else {
                next[setting.key] = value;
            }

            return next;
        });
    };

    const reset = (setting: ToolSetting) => {
        setDraft((prev) => {
            const next = { ...prev };
            delete next[setting.key];

            return next;
        });
        setResets((prev) =>
            prev.includes(setting.key) ? prev : [...prev, setting.key],
        );
    };

    const pending = Object.keys(draft).length + resets.length;
    const invalid = settings.some(
        (setting) =>
            setting.type === 'number' && !/^\d+$/.test(valueOf(setting)),
    );

    async function save() {
        setSaving(true);
        setMessage(null);

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
                    set: draft,
                    setSecret: {},
                    unset: resets,
                    restart: true,
                }),
            });
            const result = await response.json();

            if (result.success) {
                setMessage({
                    text: 'Saved. The app is restarting with the new settings.',
                    type: 'ok',
                });
                setDraft({});
                setResets([]);
                load();
            } else {
                setMessage({
                    text: result.error ?? 'Could not save the settings.',
                    type: 'error',
                });
            }
        } catch {
            setMessage({ text: 'Could not save the settings.', type: 'error' });
        } finally {
            setSaving(false);
        }
    }

    return (
        <Card
            label="Settings"
            action={
                <Button
                    size="sm"
                    disabled={pending === 0 || invalid || saving}
                    onClick={() => void save()}
                    title="Save and restart the app so it picks them up"
                >
                    {saving ? (
                        <RefreshCw className="size-3.5 animate-spin" />
                    ) : (
                        <Save className="size-3.5" />
                    )}
                    <span>{saving ? 'Saving…' : 'Save & restart'}</span>
                </Button>
            }
        >
            <div className="divide-y divide-line">
                {settings.map((setting) => {
                    const value = valueOf(setting);
                    const changedFromDefault =
                        (setting.overridden && !resets.includes(setting.key)) ||
                        (draft[setting.key] !== undefined &&
                            draft[setting.key] !== setting.default);

                    return (
                        <div
                            key={setting.key}
                            className="flex items-start justify-between gap-6 py-3 first:pt-0 last:pb-0"
                        >
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-ink">
                                    {setting.label}
                                </p>
                                <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-soft">
                                    {setting.help}
                                </p>
                                <p className="mt-1 font-mono text-[10px] text-faint">
                                    {setting.key} · default{' '}
                                    {setting.type === 'boolean'
                                        ? setting.default === 'true'
                                            ? 'on'
                                            : 'off'
                                        : `${setting.default}${setting.unit ? ` ${setting.unit}` : ''}`}
                                    {changedFromDefault && (
                                        <button
                                            type="button"
                                            onClick={() => reset(setting)}
                                            className="ml-2 inline-flex items-center gap-1 text-brand hover:underline"
                                        >
                                            <RotateCcw className="size-3" />
                                            Reset to default
                                        </button>
                                    )}
                                </p>
                            </div>
                            <div className="shrink-0 pt-0.5">
                                {setting.type === 'boolean' ? (
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={value === 'true'}
                                        aria-label={setting.label}
                                        onClick={() =>
                                            change(
                                                setting,
                                                value === 'true'
                                                    ? 'false'
                                                    : 'true',
                                            )
                                        }
                                        className={cn(
                                            'relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full transition',
                                            value === 'true'
                                                ? 'bg-brand'
                                                : 'bg-line',
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'inline-block size-4 rounded-full bg-white shadow-xs transition',
                                                value === 'true'
                                                    ? 'translate-x-4.5'
                                                    : 'translate-x-0.5',
                                            )}
                                        />
                                    </button>
                                ) : (
                                    <label className="flex items-center gap-2 text-xs text-soft">
                                        <input
                                            type="number"
                                            min={1}
                                            inputMode="numeric"
                                            value={value}
                                            onChange={(event) =>
                                                change(
                                                    setting,
                                                    event.target.value,
                                                )
                                            }
                                            aria-label={setting.label}
                                            className="h-8 w-24 rounded-lg bg-surface px-2 text-right font-mono text-sm text-ink ring-1 ring-line focus:ring-2 focus:ring-brand focus:outline-none"
                                        />
                                        {setting.unit}
                                    </label>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            {message && (
                <p
                    className={cn(
                        'mt-3 text-xs',
                        message.type === 'ok' ? 'text-ok' : 'text-accent',
                    )}
                >
                    {message.text}
                </p>
            )}
        </Card>
    );
}
