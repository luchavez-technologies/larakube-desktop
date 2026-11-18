import { Eye, EyeOff, FileText, KeyRound, RotateCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import StatusPill from '@/components/status-pill';
import type { Tone } from '@/components/status-pill';
import ToolEnvCard from '@/components/tool-env-card';
import { sendJson } from '@/lib/http';

type KeyOwner = 'managed' | 'rotated' | 'custom';

type ResourceKey = { key: string; owner: KeyOwner; value?: string };

type AppResource = {
    kind: 'ConfigMap' | 'Secret';
    name: string;
    keys: ResourceKey[];
};

const owners: Record<KeyOwner, [string, Tone, string]> = {
    managed: [
        'Managed by LaraKube',
        'muted',
        'Written by the install or a connection. Change it by re-applying, not by hand.',
    ],
    rotated: [
        'Rotated by OpenBao',
        'ok',
        'OpenBao rewrites this value on its own schedule.',
    ],
    custom: ['Custom', 'busy', 'Your own variable. Edit it below.'],
};

/**
 * Every ConfigMap and Secret an installed app uses, as the LaraKube CLI's
 * `tool:resources` reports them. Secret values are fetched one at a time,
 * only when asked for (docs/decisions/0024-app-configuration-transparency.md).
 */
export default function AppConfigurationPanel({
    server,
    tool,
}: {
    server: { name: string };
    tool: { tool: string; host?: string | null; instance?: string | null };
}) {
    const base = `/servers/${encodeURIComponent(server.name)}/apps/${encodeURIComponent(tool.tool)}`;
    const domain = tool.host ?? '';
    const [resources, setResources] = useState<AppResource[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await sendJson<{
            success: boolean;
            error?: string;
            resources?: AppResource[];
        }>(`${base}/resources?domain=${encodeURIComponent(domain)}`, 'GET');
        setLoading(false);

        if (res.ok && res.data.success) {
            setResources(res.data.resources ?? []);
            setError(null);
        } else {
            setError(
                res.data.error ?? 'Could not read this app’s configuration.',
            );
        }
    }, [base, domain]);

    useEffect(() => {
        void load();
    }, [load]);

    // Your own variables have their own card below; an empty ConfigMap or
    // Secret (the custom overlay before anything is set) says nothing.
    const shown = resources?.filter(
        (resource) =>
            resource.keys.length > 0 &&
            !resource.keys.every((key) => key.owner === 'custom'),
    );

    return (
        <div className="space-y-5">
            <Card
                label="ConfigMaps & Secrets"
                action={
                    <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => void load()}
                        disabled={loading}
                    >
                        <RotateCw
                            className={`size-3 ${loading ? 'animate-spin' : ''}`}
                        />
                        <span>Refresh</span>
                    </Button>
                }
            >
                <p className="mb-3 text-xs leading-relaxed text-soft">
                    Everything this app reads its settings from, apart from your
                    own variables (below). Secret values stay hidden until you
                    reveal one.
                </p>
                {error && <p className="text-xs text-accent">{error}</p>}
                {resources === null && !error && (
                    <div className="space-y-2">
                        {[0, 1, 2].map((i) => (
                            <div
                                key={i}
                                className="h-10 animate-pulse rounded-lg bg-paper"
                            />
                        ))}
                    </div>
                )}
                {shown?.length === 0 && (
                    <p className="text-xs text-soft">
                        This app uses no ConfigMaps or Secrets.
                    </p>
                )}
                <div className="space-y-3">
                    {shown?.map((resource) => (
                        <ResourceBlock
                            key={`${resource.kind}/${resource.name}`}
                            resource={resource}
                            revealUrl={`${base}/resources/reveal`}
                            domain={domain}
                        />
                    ))}
                </div>
            </Card>

            <ToolEnvCard server={server} tool={tool} />
        </div>
    );
}

function ResourceBlock({
    resource,
    revealUrl,
    domain,
}: {
    resource: AppResource;
    revealUrl: string;
    domain: string;
}) {
    const isSecret = resource.kind === 'Secret';
    const Icon = isSecret ? KeyRound : FileText;

    return (
        <div className="rounded-xl ring-1 ring-line">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                <Icon className="size-3.5 text-faint" />
                <span className="text-[11px] font-medium text-faint uppercase">
                    {resource.kind}
                </span>
                <span className="min-w-0 truncate font-mono text-xs text-ink">
                    {resource.name}
                </span>
                <span className="ml-auto shrink-0 text-[11px] text-faint">
                    {resource.keys.length} key
                    {resource.keys.length === 1 ? '' : 's'}
                </span>
            </div>
            <div className="divide-y divide-line">
                {resource.keys.map((key) => (
                    <KeyRow
                        key={key.key}
                        resource={resource}
                        entry={key}
                        isSecret={isSecret}
                        revealUrl={revealUrl}
                        domain={domain}
                    />
                ))}
            </div>
        </div>
    );
}

function KeyRow({
    resource,
    entry,
    isSecret,
    revealUrl,
    domain,
}: {
    resource: AppResource;
    entry: ResourceKey;
    isSecret: boolean;
    revealUrl: string;
    domain: string;
}) {
    const [revealed, setRevealed] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [label, tone, hint] = owners[entry.owner];
    const value = isSecret ? revealed : (entry.value ?? '');

    async function reveal() {
        setBusy(true);
        const res = await sendJson<{
            success: boolean;
            value?: string;
            error?: string;
        }>(revealUrl, 'POST', {
            domain,
            name: resource.name,
            key: entry.key,
        });
        setBusy(false);

        if (res.ok && res.data.success && typeof res.data.value === 'string') {
            setRevealed(res.data.value);
            setError(null);
        } else {
            setError(res.data.error ?? 'Could not read that value.');
        }
    }

    return (
        <div className="flex min-w-0 items-start gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-medium text-ink">
                        {entry.key}
                    </span>
                    <span title={hint}>
                        <StatusPill tone={tone}>{label}</StatusPill>
                    </span>
                </div>
                <div className="mt-1 font-mono text-[11px] break-all whitespace-pre-wrap text-soft select-all">
                    {value === null ? '••••••••••••' : value || '(empty)'}
                </div>
                {error && (
                    <p className="mt-1 text-[11px] text-accent">{error}</p>
                )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
                {isSecret &&
                    (revealed === null ? (
                        <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => void reveal()}
                            disabled={busy}
                            title={`Reveal ${entry.key}`}
                        >
                            <Eye className="size-3" />
                            <span>{busy ? 'Revealing…' : 'Reveal'}</span>
                        </Button>
                    ) : (
                        <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => setRevealed(null)}
                            title={`Hide ${entry.key}`}
                        >
                            <EyeOff className="size-3" />
                            <span>Hide</span>
                        </Button>
                    ))}
                {value !== null && value !== '' && (
                    <CopyButton
                        value={value}
                        label=""
                        copiedLabel=""
                        title={`Copy ${entry.key}`}
                        className="h-6 px-1.5"
                    />
                )}
            </div>
        </div>
    );
}
