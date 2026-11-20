import { FolderUp, RotateCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import { ListRow, TwoLine } from '@/components/list-row';
import { sendJson } from '@/lib/http';
import {
    NativeEvents,
    onNativeEvent,
    type RunEventPayload,
} from '@/lib/native-events';

type EdgeFunction = {
    name: string;
    shared: boolean;
    url: string | null;
    updatedAt: string | null;
};

type FunctionsResponse = {
    success: boolean;
    error?: string;
    enabled?: boolean;
    functions?: EdgeFunction[];
    lastDeploy: {
        path: string;
        status: string;
        finishedAt: string | null;
    } | null;
};

const RUN_KIND = 'deploy-supabase-functions';

function since(iso: string | null): string {
    if (!iso) return '';
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    return new Date(iso).toLocaleDateString();
}

/**
 * The Edge Functions on one Supabase instance and a way to deploy a local `supabase/functions` folder
 * to it. Self-hosted Supabase has no deploy API of its own; this drives `supabase:functions:deploy`.
 */
export default function SupabaseFunctionsCard({
    server,
    host,
}: {
    server: string;
    host: string;
}) {
    const base = `/servers/${encodeURIComponent(server)}/apps/supabase/functions`;
    const [data, setData] = useState<FunctionsResponse | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        const res = await sendJson<FunctionsResponse>(
            `${base}?domain=${encodeURIComponent(host)}`,
            'GET',
        );
        setData(res.data);
    }, [base, host]);

    useEffect(() => {
        void load();
    }, [load]);

    // A deploy runs in the drawer like any other run; reload the list the moment it ends.
    useEffect(
        () =>
            onNativeEvent<RunEventPayload>(
                NativeEvents.runFinished,
                (payload) => {
                    if (payload.kind === RUN_KIND) void load();
                },
            ),
        [load],
    );

    const deploy = async (path?: string) => {
        setBusy(true);
        setError(null);
        const res = await sendJson<{
            started: boolean;
            cancelled?: boolean;
            error?: string;
        }>(`${base}/deploy`, 'POST', { domain: host, path: path ?? null });
        setBusy(false);
        if (!res.data.started && !res.data.cancelled) {
            setError(
                res.data.error ??
                    res.data.message ??
                    'Could not start the deploy.',
            );
        }
    };

    const enabled = data?.enabled !== false;
    const functions = data?.functions ?? [];
    const last = data?.lastDeploy ?? null;

    return (
        <Card
            label="Edge Functions"
            action={
                enabled ? (
                    <div className="flex items-center gap-1">
                        {last && (
                            <Button
                                variant="ghost"
                                size="xs"
                                disabled={busy}
                                onClick={() => void deploy(last.path)}
                                title={`Deploy ${last.path} again`}
                            >
                                <RotateCw className="size-3" />
                                <span>Deploy again</span>
                            </Button>
                        )}
                        <Button
                            variant="secondary"
                            size="xs"
                            disabled={busy}
                            onClick={() => void deploy()}
                            title="Choose a supabase/functions folder to deploy"
                        >
                            <FolderUp className="size-3" />
                            <span>Deploy from folder…</span>
                        </Button>
                    </div>
                ) : undefined
            }
        >
            {data === null ? (
                <p className="text-xs text-soft">Loading functions…</p>
            ) : !data.success ? (
                <p className="text-xs text-accent">{data.error}</p>
            ) : !enabled ? (
                <p className="text-xs text-soft">
                    Edge Functions are turned off for this Supabase. Reinstall
                    it with Edge Functions on to deploy functions.
                </p>
            ) : functions.length === 0 ? (
                <p className="text-xs text-soft">
                    No functions yet. Choose your project&apos;s{' '}
                    <code className="font-mono">supabase/functions</code>{' '}
                    folder: each sub-folder becomes a function at{' '}
                    <code className="font-mono">
                        /functions/v1/&lt;name&gt;
                    </code>
                    .
                </p>
            ) : (
                functions.map((fn) => (
                    <ListRow
                        key={fn.name}
                        action={
                            fn.url ? <CopyButton value={fn.url} /> : undefined
                        }
                    >
                        <TwoLine
                            title={fn.name}
                            detail={
                                fn.url ?? 'Shared code, imported by functions'
                            }
                            mono={fn.url !== null}
                        />
                    </ListRow>
                ))
            )}
            {error && <p className="mt-2 text-xs text-accent">{error}</p>}
            {last && enabled && (
                <p className="mt-3 text-[11px] text-faint">
                    Last deployed from{' '}
                    <span className="font-mono">{last.path}</span>
                    {last.finishedAt ? ` · ${since(last.finishedAt)}` : ''}
                    {last.status === 'failed' ? ' · failed' : ''}
                </p>
            )}
        </Card>
    );
}
