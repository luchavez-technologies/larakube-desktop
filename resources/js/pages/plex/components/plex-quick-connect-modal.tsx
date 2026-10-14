import { useState } from 'react';
import { Check, Code2, Copy, Database, Terminal, X } from 'lucide-react';
import Button from '@/components/button';
import type { PlexCommonsServicesReport, PlexTenant } from '@/types/larakube';

export default function PlexQuickConnectModal({
    isOpen,
    onClose,
    tenant,
    driver,
    services,
}: {
    isOpen: boolean;
    onClose: () => void;
    tenant: PlexTenant | null;
    driver: string | null;
    services?: PlexCommonsServicesReport | null;
}) {
    const [tab, setTab] = useState<'laravel' | 'uri' | 'tunnel'>('laravel');
    const [copied, setCopied] = useState(false);

    if (!isOpen) return null;

    // Resolve internal hosts/ports from services report
    const dbOption = services?.categories
        .find((c) => c.key === 'database')
        ?.options.find((o) => o.enabled);
    const dbInternal =
        dbOption?.details.find((d) => d.label === 'Internal')?.value ??
        'postgres.larakube-plex.svc.cluster.local:5432';
    const [dbHost, dbPort] = dbInternal.includes(':')
        ? dbInternal.split(':')
        : [dbInternal, '5432'];
    const dbDriverName =
        dbOption?.driver === 'postgres'
            ? 'pgsql'
            : (dbOption?.driver ?? 'pgsql');

    const redisOption = services?.categories
        .find((c) => c.key === 'cache')
        ?.options.find((o) => o.enabled);
    const redisInternal =
        redisOption?.details.find((d) => d.label === 'Internal')?.value ??
        'redis.larakube-plex.svc.cluster.local:6379';
    const [redisHost, redisPort] = redisInternal.includes(':')
        ? redisInternal.split(':')
        : [redisInternal, '6379'];

    const s3Option = services?.categories
        .find((c) => c.key === 'storage')
        ?.options.find((o) => o.enabled);
    const s3Internal =
        s3Option?.details.find((d) => d.label === 'Internal')?.value ??
        'files.larakube-plex.svc.cluster.local:8333';
    const s3Public =
        s3Option?.details.find((d) => d.label === 'Public')?.value ?? '';

    // Generate snippets
    const targetName = tenant?.name ?? driver ?? 'tenant';
    const dbName = tenant?.database ?? `${targetName}_db`;
    const redisIndex = tenant?.redisIndex ?? 0;
    const s3Bucket = tenant?.s3Bucket ?? `${targetName}-bucket`;

    let laravelSnippet = '# --- LaraKube Plex Commons Connection ---\n';
    if (
        tenant?.database ||
        driver?.includes('postgres') ||
        driver?.includes('mysql') ||
        !driver
    ) {
        laravelSnippet += `DB_CONNECTION=${dbDriverName}\nDB_HOST=${dbHost}\nDB_PORT=${dbPort}\nDB_DATABASE=${dbName}\nDB_USERNAME=${dbName}\nDB_PASSWORD=\n\n`;
    }
    if (
        (tenant?.redisIndex !== null && tenant?.redisIndex !== undefined) ||
        driver?.includes('redis') ||
        !driver
    ) {
        laravelSnippet += `REDIS_CLIENT=phpredis\nREDIS_HOST=${redisHost}\nREDIS_PORT=${redisPort}\nREDIS_DB=${redisIndex}\nREDIS_CACHE_DB=${redisIndex}\n\n`;
    }
    if (
        tenant?.s3Bucket ||
        driver?.includes('seaweed') ||
        driver?.includes('minio') ||
        driver?.includes('s3') ||
        !driver
    ) {
        laravelSnippet += `AWS_ACCESS_KEY_ID=\nAWS_SECRET_ACCESS_KEY=\nAWS_DEFAULT_REGION=us-east-1\nAWS_BUCKET=${s3Bucket}\nAWS_ENDPOINT=http://${s3Internal}\nAWS_USE_PATH_STYLE_ENDPOINT=true\n`;
        if (s3Public) {
            laravelSnippet += `AWS_URL=${s3Public}\n`;
        }
    }

    let uriSnippet = '';
    if (
        tenant?.database ||
        driver?.includes('postgres') ||
        driver?.includes('mysql') ||
        !driver
    ) {
        uriSnippet += `# Database Connection URI\n${dbDriverName}://${dbName}:<PASSWORD>@${dbHost}:${dbPort}/${dbName}\n\n`;
    }
    if (
        (tenant?.redisIndex !== null && tenant?.redisIndex !== undefined) ||
        driver?.includes('redis') ||
        !driver
    ) {
        uriSnippet += `# Redis Connection URI\nredis://${redisHost}:${redisPort}/${redisIndex}\n\n`;
    }
    if (
        tenant?.s3Bucket ||
        driver?.includes('seaweed') ||
        driver?.includes('s3') ||
        !driver
    ) {
        uriSnippet += `# S3 Endpoint\nhttp://${s3Internal}\n`;
    }

    let tunnelSnippet = `# Port-forward Plex Commons to localhost for TablePlus, DBeaver, or Redis Insight:\n\n`;
    tunnelSnippet += `# Database (port 5432 or 3306):\nkubectl port-forward -n larakube-plex svc/${dbOption?.driver ?? 'postgres'} ${dbPort}:${dbPort}\n\n`;
    tunnelSnippet += `# Redis (port 6379):\nkubectl port-forward -n larakube-plex svc/redis ${redisPort}:${redisPort}\n\n`;
    tunnelSnippet += `# S3 Object Storage (port 8333 / 8888):\nkubectl port-forward -n larakube-plex svc/${s3Option?.driver ?? 'seaweedfs'} 8333:8333\n`;

    const activeContent =
        tab === 'laravel'
            ? laravelSnippet
            : tab === 'uri'
              ? uriSnippet
              : tunnelSnippet;

    const copySnippet = () => {
        void navigator.clipboard.writeText(activeContent);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-6 backdrop-blur-xs"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-[620px] rounded-2xl bg-surface p-7 shadow-2xl ring-1 ring-line"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <Code2 className="size-5 text-brand" />
                            <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">
                                Quick Connect &amp; Connection Snippets
                            </h2>
                        </div>
                        <p className="mt-1 text-xs text-soft">
                            {tenant ? (
                                <>
                                    Connection variables configured for{' '}
                                    <span className="font-mono font-semibold text-ink">
                                        {tenant.name}
                                    </span>
                                </>
                            ) : (
                                <>
                                    Cluster-internal endpoints for{' '}
                                    <span className="font-semibold text-ink capitalize">
                                        {driver ?? 'Commons'}
                                    </span>
                                </>
                            )}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-faint transition hover:bg-paper hover:text-ink"
                    >
                        <X className="size-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="mt-5 flex items-center border-b border-line text-xs">
                    <button
                        type="button"
                        onClick={() => setTab('laravel')}
                        className={`flex items-center gap-1.5 border-b-2 px-3.5 py-2 font-medium transition ${
                            tab === 'laravel'
                                ? 'border-brand font-semibold text-brand'
                                : 'border-transparent text-soft hover:text-ink'
                        }`}
                    >
                        <Code2 className="size-3.5" />
                        <span>Laravel .env</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setTab('uri')}
                        className={`flex items-center gap-1.5 border-b-2 px-3.5 py-2 font-medium transition ${
                            tab === 'uri'
                                ? 'border-brand font-semibold text-brand'
                                : 'border-transparent text-soft hover:text-ink'
                        }`}
                    >
                        <Database className="size-3.5" />
                        <span>Connection URIs</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setTab('tunnel')}
                        className={`flex items-center gap-1.5 border-b-2 px-3.5 py-2 font-medium transition ${
                            tab === 'tunnel'
                                ? 'border-brand font-semibold text-brand'
                                : 'border-transparent text-soft hover:text-ink'
                        }`}
                    >
                        <Terminal className="size-3.5" />
                        <span>Local GUI Tunnel</span>
                    </button>
                </div>

                {/* Code Block */}
                <div className="relative mt-4">
                    <pre className="custom-scrollbar max-h-72 overflow-x-auto rounded-xl border border-term-line bg-term p-4 font-mono text-xs leading-relaxed text-term-bright">
                        {activeContent}
                    </pre>

                    <button
                        type="button"
                        onClick={copySnippet}
                        className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-lg border border-term-line bg-term/90 px-2.5 py-1 text-xs text-term-text transition hover:border-brand hover:text-white"
                        title="Copy to clipboard"
                    >
                        {copied ? (
                            <>
                                <Check className="size-3.5 text-emerald-400" />
                                <span className="text-emerald-400">Copied</span>
                            </>
                        ) : (
                            <>
                                <Copy className="size-3.5" />
                                <span>Copy</span>
                            </>
                        )}
                    </button>
                </div>

                {/* Callout */}
                <div className="mt-4 rounded-xl border border-line bg-paper/60 p-3 text-xs text-soft">
                    <p>
                        💡 <strong>In-Cluster Networking:</strong> These
                        addresses resolve automatically from inside pods on this
                        cluster. For external GUI access from your Mac, use the
                        commands under <strong>Local GUI Tunnel</strong>.
                    </p>
                </div>

                {/* Footer */}
                <div className="mt-6 flex justify-end">
                    <Button variant="secondary" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
}
