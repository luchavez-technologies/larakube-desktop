import { Bot, Plug, Terminal, XCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import StatusPill from '@/components/status-pill';
import { sendJson } from '@/lib/http';

type McpStatus = {
    running: boolean;
    url: string;
    port: number;
    otherInstance: string | null;
    error?: string;
};

/**
 * Supabase's MCP server, for Claude Code and other AI tools. Self-hosted Supabase blocks MCP on its
 * public URL, so this opens it on this computer only, through `supabase:mcp`.
 */
export default function SupabaseMcpCard({
    server,
    host,
}: {
    server: string;
    host: string;
}) {
    const base = `/servers/${encodeURIComponent(server)}/apps/supabase/mcp`;
    const [status, setStatus] = useState<McpStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const polling = useRef<number | null>(null);

    const load = useCallback(async () => {
        const res = await sendJson<McpStatus>(
            `${base}?domain=${encodeURIComponent(host)}`,
            'GET',
        );
        setStatus(res.data);

        return res.data;
    }, [base, host]);

    useEffect(() => {
        void load();

        return () => {
            if (polling.current !== null) window.clearInterval(polling.current);
        };
    }, [load]);

    const start = async () => {
        setBusy(true);
        setError(null);
        const res = await sendJson<McpStatus>(`${base}/start`, 'POST', {
            domain: host,
        });
        if (res.data.error) {
            setError(res.data.error);
            setBusy(false);
            return;
        }

        // The tunnel takes a few seconds to come up; check until it answers, for up to 30 seconds.
        let tries = 0;
        polling.current = window.setInterval(async () => {
            tries += 1;
            const next = await load();
            if (next.running || tries >= 30) {
                if (polling.current !== null)
                    window.clearInterval(polling.current);
                polling.current = null;
                setBusy(false);
                if (!next.running) {
                    setError(
                        'The connection did not open. Check that Supabase is running, then try again.',
                    );
                }
            }
        }, 1000);
    };

    const stop = async () => {
        setBusy(true);
        const res = await sendJson<McpStatus>(`${base}/stop`, 'POST', {
            domain: host,
        });
        setStatus(res.data);
        setBusy(false);
    };

    const running = status?.running === true;
    const url = status?.url ?? '';
    const claudeSnippet = `claude mcp add --transport http supabase "${url}"`;
    const jsonSnippet = JSON.stringify(
        { mcpServers: { supabase: { url } } },
        null,
        2,
    );

    return (
        <Card
            label="AI & MCP"
            action={
                <div className="flex items-center gap-2">
                    <StatusPill tone={running ? 'ok' : 'muted'}>
                        {running ? 'Open on this computer' : 'Off'}
                    </StatusPill>
                    {running ? (
                        <Button
                            variant="ghost"
                            size="xs"
                            disabled={busy}
                            onClick={() => void stop()}
                        >
                            <XCircle className="size-3" />
                            <span>Turn off</span>
                        </Button>
                    ) : (
                        <Button
                            variant="secondary"
                            size="xs"
                            disabled={busy || status === null}
                            onClick={() => void start()}
                        >
                            <Plug className="size-3" />
                            <span>{busy ? 'Opening…' : 'Turn on'}</span>
                        </Button>
                    )}
                </div>
            }
        >
            <p className="flex items-start gap-2 text-xs leading-relaxed text-soft">
                <Bot className="mt-0.5 size-3.5 shrink-0" />
                <span>
                    Let Claude Code and other AI tools work with this Supabase:
                    look at tables, run SQL, read logs and search the docs. It
                    opens on this computer only, never on{' '}
                    <span className="font-mono">{host}</span>.
                </span>
            </p>

            {!running && status?.otherInstance && (
                <p className="mt-2 text-[11px] text-faint">
                    Turning this on closes the one open for{' '}
                    <span className="font-mono">{status.otherInstance}</span>.
                </p>
            )}

            {error && <p className="mt-2 text-xs text-accent">{error}</p>}

            {running && (
                <div className="mt-3 space-y-3">
                    <div className="space-y-1.5 rounded-xl border border-line bg-paper p-3">
                        <div className="flex items-center justify-between text-xs font-medium text-ink">
                            <span className="flex items-center gap-1.5">
                                <Terminal className="size-3.5 text-soft" />
                                Claude Code / CLI
                            </span>
                            <CopyButton value={claudeSnippet} />
                        </div>
                        <pre className="overflow-x-auto rounded-lg bg-term p-2.5 font-mono text-[11px] whitespace-pre-wrap text-term-bright">
                            {claudeSnippet}
                        </pre>
                    </div>

                    <div className="space-y-1.5 rounded-xl border border-line bg-paper p-3">
                        <div className="flex items-center justify-between text-xs font-medium text-ink">
                            <span>Cursor / OpenCode / Codex configuration</span>
                            <CopyButton value={jsonSnippet} />
                        </div>
                        <pre className="overflow-x-auto rounded-lg bg-term p-2.5 font-mono text-[11px] whitespace-pre-wrap text-term-bright">
                            {jsonSnippet}
                        </pre>
                    </div>

                    <p className="text-[11px] leading-relaxed text-faint">
                        AI tools connected here can read and change your whole
                        database. It stays open while LaraKube Desktop runs;
                        turn it off when you are done.
                    </p>
                </div>
            )}
        </Card>
    );
}
