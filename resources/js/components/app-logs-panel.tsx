import { RotateCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import AutoRefreshToggle, {
    useAutoRefresh,
} from '@/components/auto-refresh-toggle';
import Button from '@/components/button';
import Card from '@/components/card';
import LogPanel from '@/components/log-panel';
import { sendJson } from '@/lib/http';
import { cn } from '@/lib/utils';

type LogLine = {
    time: string;
    pod: string;
    container: string;
    component: string;
    line: string;
};

type LogsResponse = {
    success: boolean;
    error?: string;
    components?: string[];
    lines?: LogLine[];
};

/** Lines kept in view; older ones scroll away. */
const MAX_LINES = 2000;

/**
 * One merged, live stream of every component's logs for an installed app,
 * each line tagged with its component. Polls `{tool}:logs --json` through
 * Desktop, asking only for lines newer than the last one shown.
 */
export default function AppLogsPanel({
    server,
    tool,
}: {
    server: { name: string };
    tool: { tool: string; host?: string | null };
}) {
    const base = `/servers/${encodeURIComponent(server.name)}/apps/${encodeURIComponent(tool.tool)}/logs`;
    const domain = tool.host ?? '';
    const [lines, setLines] = useState<LogLine[]>([]);
    const [components, setComponents] = useState<string[]>([]);
    const [component, setComponent] = useState<string | null>(null);
    // Seconds between polls; 0 pauses. Shares the Off / 5s / 10s / 30s picker the other live cards use.
    const [refreshSeconds, setRefreshSeconds] = useState<number>(5);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const lastTime = useRef<string | null>(null);
    const inFlight = useRef(false);

    const fetchLines = useCallback(
        async (reset: boolean) => {
            if (inFlight.current) {
                return;
            }
            inFlight.current = true;

            const query = new URLSearchParams({ domain, tail: '300' });
            if (component) {
                query.set('component', component);
            }
            if (!reset && lastTime.current) {
                query.set('since_time', lastTime.current);
            }

            const res = await sendJson<LogsResponse>(
                `${base}?${query.toString()}`,
                'GET',
            );
            inFlight.current = false;
            setLoading(false);

            if (!res.ok || !res.data.success) {
                setError(res.data.error ?? 'Could not read this app’s logs.');

                return;
            }

            setError(null);
            if (res.data.components?.length && !component) {
                setComponents(res.data.components);
            }

            const incoming = res.data.lines ?? [];
            setLines((previous) => {
                // --since-time is inclusive, so the last line comes back again.
                const seen = new Set(
                    (reset ? [] : previous).map(
                        (l) => `${l.time}|${l.pod}|${l.line}`,
                    ),
                );
                const fresh = incoming.filter(
                    (l) => !seen.has(`${l.time}|${l.pod}|${l.line}`),
                );
                const merged = [...(reset ? [] : previous), ...fresh];

                return merged.slice(-MAX_LINES);
            });

            if (incoming.length > 0) {
                lastTime.current = incoming[incoming.length - 1].time;
            }
        },
        [base, domain, component],
    );

    useEffect(() => {
        lastTime.current = null;
        setLoading(true);
        void fetchLines(true);
    }, [fetchLines]);

    const pollNewLines = useCallback(
        () => void fetchLines(false),
        [fetchLines],
    );
    useAutoRefresh(refreshSeconds, pollNewLines);

    const output = lines
        .map((l) => `[${l.component || l.container}] ${l.line}`)
        .join('\n');

    return (
        <Card
            label="Logs"
            action={
                <div className="flex items-center gap-1">
                    <AutoRefreshToggle
                        value={refreshSeconds}
                        onChange={setRefreshSeconds}
                        title="Auto-refresh logs interval"
                    />
                    <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                            lastTime.current = null;
                            void fetchLines(true);
                        }}
                        title="Reload the last 15 minutes"
                    >
                        <RotateCw className="size-3" />
                        <span>Reload</span>
                    </Button>
                </div>
            }
        >
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
                {[null, ...components].map((name) => (
                    <button
                        key={name ?? 'all'}
                        type="button"
                        onClick={() => setComponent(name)}
                        className={cn(
                            'cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition',
                            component === name
                                ? 'bg-ink text-surface ring-ink'
                                : 'bg-surface text-soft ring-line hover:text-ink',
                        )}
                    >
                        {name ?? 'All components'}
                    </button>
                ))}
                <span className="ml-auto text-[11px] text-faint">
                    {refreshSeconds > 0
                        ? `Live · every ${refreshSeconds}s`
                        : 'Paused'}{' '}
                    · last 15 minutes
                </span>
            </div>
            {error && <p className="mb-2 text-xs text-accent">{error}</p>}
            <div className="bg-term-bg h-[520px] rounded-xl p-2 font-mono text-xs">
                <LogPanel
                    output={output}
                    placeholder={
                        loading
                            ? 'Loading logs…'
                            : 'No log lines in this window.'
                    }
                    className="h-full"
                />
            </div>
        </Card>
    );
}
