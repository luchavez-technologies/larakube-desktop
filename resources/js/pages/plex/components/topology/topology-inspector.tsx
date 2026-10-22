import {
    Database,
    ExternalLink,
    Globe,
    HardDrive,
    Info,
    Layers,
    Shield,
    X,
    Zap,
} from 'lucide-react';
import { Link } from '@inertiajs/react';
import Button, { buttonClass } from '@/components/button';
import FrameworkLogo from '@/components/framework-logo';
import ToolLogo from '@/components/tool-logo';
import { cn } from '@/lib/utils';
import type { TopologySelection } from './types';

export default function TopologyInspector({
    selection,
    onClose,
}: {
    selection: TopologySelection;
    onClose: () => void;
}) {
    if (!selection) return null;

    const normalizedEngineDriver =
        selection.type === 'engine'
            ? selection.engine.driver.toLowerCase()
            : '';

    const engineMetrics =
        selection.type === 'engine'
            ? selection.engine.podMetrics?.components?.[
                  normalizedEngineDriver
              ] ||
              selection.engine.podMetrics?.components?.[
                  normalizedEngineDriver.replace('fs', '')
              ] ||
              (normalizedEngineDriver.includes('chrome') ||
              normalizedEngineDriver.includes('headless')
                  ? selection.engine.podMetrics?.components?.[
                        'headless-shell'
                    ] || selection.engine.podMetrics?.components?.['chrome']
                  : null)
            : null;

    return (
        <aside className="flex h-full w-[350px] shrink-0 flex-col border-l border-line bg-surface select-text">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-lg bg-brand/10 text-brand">
                        <Info className="size-3.5" />
                    </span>
                    <h3 className="text-xs font-bold tracking-tight text-ink uppercase">
                        {selection.type === 'app'
                            ? 'Application Node'
                            : selection.type === 'tool'
                              ? 'Cluster Companion Tool'
                              : selection.type === 'custom'
                                ? 'Custom Workload Tenant'
                                : selection.type === 'engine'
                                  ? 'Commons Service Engine'
                                  : 'Connection Conduit'}
                    </h3>
                </div>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="size-7 p-0 text-soft hover:text-ink"
                    title="Close inspector"
                >
                    <X className="size-4" />
                </Button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
                {/* 1. App Inspector */}
                {selection.type === 'app' && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <FrameworkLogo
                                slug={selection.project.framework}
                                size="md"
                            />
                            <div className="min-w-0 flex-1">
                                <h4 className="truncate text-sm font-bold text-ink">
                                    {selection.project.name}
                                </h4>
                                <p className="font-mono text-[11px] text-faint">
                                    {selection.project.webHost ||
                                        `${selection.project.name}.dev.test`}
                                </p>
                            </div>
                        </div>

                        {/* Quick Action Link */}
                        <Link
                            href={`/projects/${selection.project.id}`}
                            className={cn(
                                buttonClass('secondary', 'sm'),
                                'w-full justify-center gap-1.5 text-xs',
                            )}
                        >
                            <ExternalLink className="size-3.5" />
                            <span>View Project Dashboard</span>
                        </Link>

                        {/* Connected Commons Overview */}
                        <div className="rounded-xl border border-line bg-paper/30 p-3">
                            <span className="text-[10px] font-semibold tracking-wider text-soft uppercase">
                                Connected Commons Backing Engines
                            </span>
                            <div className="mt-2 space-y-1.5">
                                {selection.project.database &&
                                selection.project.database !== 'sqlite' ? (
                                    <div className="flex items-center justify-between font-mono text-[11px]">
                                        <span className="flex items-center gap-1.5 text-ink">
                                            <Database className="size-3 text-tools" />
                                            Database
                                        </span>
                                        <span className="rounded bg-tools/10 px-1.5 py-0.5 text-tools">
                                            {selection.project.database.toUpperCase()}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between font-mono text-[11px] text-faint">
                                        <span>Database</span>
                                        <span>
                                            {selection.project.database ===
                                            'sqlite'
                                                ? 'Local SQLite'
                                                : 'None'}
                                        </span>
                                    </div>
                                )}

                                {(selection.project.cache === 'redis' ||
                                    selection.project.plex.includes(
                                        'redis',
                                    )) && (
                                    <div className="flex items-center justify-between font-mono text-[11px]">
                                        <span className="flex items-center gap-1.5 text-ink">
                                            <Zap className="size-3 text-rose-500" />
                                            Redis Cache
                                        </span>
                                        <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-500">
                                            REDIS 7
                                        </span>
                                    </div>
                                )}

                                {(selection.project.objectStorage ||
                                    selection.project.plex.includes('s3')) && (
                                    <div className="flex items-center justify-between font-mono text-[11px]">
                                        <span className="flex items-center gap-1.5 text-ink">
                                            <HardDrive className="size-3 text-amber-500" />
                                            Object Storage
                                        </span>
                                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-500 uppercase">
                                            {selection.project.objectStorage ||
                                                'S3 API'}
                                        </span>
                                    </div>
                                )}

                                {(selection.project.plex.includes(
                                    'headless-chrome',
                                ) ||
                                    selection.project.plex.includes('chrome') ||
                                    selection.project.plex.includes(
                                        'render',
                                    )) && (
                                    <div className="flex items-center justify-between font-mono text-[11px]">
                                        <span className="flex items-center gap-1.5 text-ink">
                                            <Globe className="size-3 text-cyan-500" />
                                            PDF & Render
                                        </span>
                                        <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-cyan-600 dark:text-cyan-400">
                                            HEADLESS CHROME (:9222)
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Injected Environment Preview */}
                        <div>
                            <span className="text-[10px] font-semibold tracking-wider text-soft uppercase">
                                Injected Environment (.env)
                            </span>
                            <div className="mt-1.5 rounded-xl border border-line bg-term p-2.5 font-mono text-[10px] text-term-text">
                                <div className="text-term-dim">
                                    # LaraKube Plex Commons Wiring
                                </div>
                                {selection.project.database &&
                                    selection.project.database !== 'sqlite' && (
                                        <>
                                            <div>
                                                DB_CONNECTION=
                                                <span className="text-term-bright">
                                                    {selection.project.database}
                                                </span>
                                            </div>
                                            <div>
                                                DB_HOST=
                                                <span className="text-term-bright">
                                                    {selection.project
                                                        .database || 'postgres'}
                                                    .larakube-plex.svc.cluster.local
                                                </span>
                                            </div>
                                            <div>
                                                DB_DATABASE=
                                                <span className="text-term-bright">
                                                    {selection.project.name}_db
                                                </span>
                                            </div>
                                        </>
                                    )}
                                {(selection.project.cache === 'redis' ||
                                    selection.project.plex.includes(
                                        'redis',
                                    )) && (
                                    <>
                                        <div>
                                            REDIS_HOST=
                                            <span className="text-term-bright">
                                                redis.larakube-plex.svc.cluster.local
                                            </span>
                                        </div>
                                        <div>REDIS_PORT=6379</div>
                                    </>
                                )}
                                {(selection.project.objectStorage ||
                                    selection.project.plex.includes('s3')) && (
                                    <div>
                                        AWS_ENDPOINT=
                                        <span className="text-term-bright">
                                            http://
                                            {selection.project.objectStorage ||
                                                'seaweedfs'}
                                            .larakube-plex.svc.cluster.local:8333
                                        </span>
                                    </div>
                                )}
                                {(selection.project.plex.includes(
                                    'headless-chrome',
                                ) ||
                                    selection.project.plex.includes('chrome') ||
                                    selection.project.plex.includes(
                                        'render',
                                    )) && (
                                    <div>
                                        RENDER_URL=
                                        <span className="text-term-bright">
                                            http://headless-shell.larakube-plex.svc.cluster.local:9222
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. Tool Inspector */}
                {selection.type === 'tool' && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <ToolLogo
                                tool={
                                    selection.tool.clusterTool ?? {
                                        tool: selection.tool.slug,
                                    }
                                }
                                size="md"
                            />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                    <h4 className="truncate text-sm font-bold text-ink">
                                        {selection.tool.name}
                                    </h4>
                                    <span className="rounded bg-tools/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-tools">
                                        Tool
                                    </span>
                                </div>
                                <p className="font-mono text-[11px] text-faint">
                                    {selection.tool.tagline ||
                                        'Cluster Companion Service'}
                                </p>
                            </div>
                        </div>

                        {/* Provisioned Commons Resources */}
                        <div className="rounded-xl border border-line bg-paper/30 p-3">
                            <span className="text-[10px] font-semibold tracking-wider text-soft uppercase">
                                Provisioned Commons Resources
                            </span>
                            <div className="mt-2.5 space-y-2">
                                {/* Databases */}
                                {selection.tool.databases.length > 0 && (
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink">
                                            <Database className="size-3 text-tools" />
                                            <span>
                                                Databases (
                                                {
                                                    selection.tool.databases
                                                        .length
                                                }
                                                )
                                            </span>
                                        </div>
                                        <div className="space-y-1 pl-4">
                                            {selection.tool.databases.map(
                                                (db, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="flex items-center justify-between rounded bg-surface/80 px-2 py-1 font-mono text-[10.5px]"
                                                    >
                                                        <span className="truncate text-ink">
                                                            {db}
                                                        </span>
                                                        <span className="shrink-0 text-[9px] text-faint">
                                                            PostgreSQL
                                                        </span>
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Redis Cache */}
                                {selection.tool.redisIndexes.length > 0 && (
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink">
                                            <Zap className="size-3 text-rose-500" />
                                            <span>
                                                Redis Cache (
                                                {
                                                    selection.tool.redisIndexes
                                                        .length
                                                }
                                                )
                                            </span>
                                        </div>
                                        <div className="space-y-1 pl-4">
                                            {selection.tool.redisIndexes.map(
                                                (idxVal, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="flex items-center justify-between rounded bg-surface/80 px-2 py-1 font-mono text-[10.5px]"
                                                    >
                                                        <span className="text-ink">
                                                            Dedicated Index
                                                        </span>
                                                        <span className="rounded bg-rose-500/10 px-1.5 py-0.5 font-semibold text-rose-500">
                                                            Index {idxVal}
                                                        </span>
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* S3 Buckets */}
                                {selection.tool.s3Buckets.length > 0 && (
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink">
                                            <HardDrive className="size-3 text-amber-500" />
                                            <span>
                                                Object Storage (
                                                {
                                                    selection.tool.s3Buckets
                                                        .length
                                                }
                                                )
                                            </span>
                                        </div>
                                        <div className="space-y-1 pl-4">
                                            {selection.tool.s3Buckets.map(
                                                (b, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="flex items-center justify-between rounded bg-surface/80 px-2 py-1 font-mono text-[10.5px]"
                                                    >
                                                        <span
                                                            className="truncate text-ink"
                                                            title={b}
                                                        >
                                                            {b}
                                                        </span>
                                                        <span className="shrink-0 text-[9px] text-faint">
                                                            S3 Bucket
                                                        </span>
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Headless Chrome / Render */}
                                {selection.tool.usesRender && (
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink">
                                            <Globe className="size-3 text-cyan-500" />
                                            <span>
                                                PDF & Certificate Rendering
                                            </span>
                                        </div>
                                        <div className="space-y-1 pl-4">
                                            <div className="flex items-center justify-between rounded bg-surface/80 px-2 py-1 font-mono text-[10.5px]">
                                                <span className="truncate text-ink">
                                                    Headless Chrome (CDP)
                                                </span>
                                                <span className="shrink-0 rounded bg-cyan-500/10 px-1.5 py-0.5 font-semibold text-cyan-600 dark:text-cyan-400">
                                                    :9222
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* OpenBao Managed Credentials */}
                        <div className="flex items-start gap-2.5 rounded-xl border border-line bg-paper/40 p-3">
                            <Shield className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                            <div className="space-y-1">
                                <h5 className="text-[11px] font-bold text-ink">
                                    Managed Cluster Credentials
                                </h5>
                                <p className="text-[10px] leading-relaxed text-soft">
                                    Backing service credentials, socket keys,
                                    and passwords are auto-generated and
                                    synchronized via OpenBao / K8s Secrets.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. Custom Workload Inspector */}
                {selection.type === 'custom' && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/25 dark:text-emerald-400">
                                <Layers className="size-5" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                    <h4 className="truncate text-sm font-bold text-ink">
                                        {selection.tenant.name}
                                    </h4>
                                    <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                                        Custom
                                    </span>
                                </div>
                                <p className="font-mono text-[11px] text-faint">
                                    External Provisioned Workload
                                </p>
                            </div>
                        </div>

                        {/* Provisioned Resources */}
                        <div className="rounded-xl border border-line bg-paper/30 p-3">
                            <span className="text-[10px] font-semibold tracking-wider text-soft uppercase">
                                Allocated Commons Resources
                            </span>
                            <div className="mt-2.5 space-y-2">
                                {selection.tenant.database && (
                                    <div className="flex items-center justify-between rounded bg-surface/80 px-2 py-1.5 font-mono text-[10.5px]">
                                        <span className="flex items-center gap-1.5 text-ink">
                                            <Database className="size-3 text-tools" />
                                            {selection.tenant.database}
                                        </span>
                                        <span className="text-[9px] text-faint uppercase">
                                            {selection.tenant.databaseService ||
                                                'PostgreSQL'}
                                        </span>
                                    </div>
                                )}

                                {selection.tenant.redisIndex !== null &&
                                    selection.tenant.redisIndex !==
                                        undefined && (
                                        <div className="flex items-center justify-between rounded bg-surface/80 px-2 py-1.5 font-mono text-[10.5px]">
                                            <span className="flex items-center gap-1.5 text-ink">
                                                <Zap className="size-3 text-rose-500" />
                                                Redis Cache
                                            </span>
                                            <span className="rounded bg-rose-500/10 px-1.5 py-0.5 font-semibold text-rose-500">
                                                Index{' '}
                                                {selection.tenant.redisIndex}
                                            </span>
                                        </div>
                                    )}

                                {selection.tenant.s3Bucket && (
                                    <div className="flex items-center justify-between rounded bg-surface/80 px-2 py-1.5 font-mono text-[10.5px]">
                                        <span className="flex items-center gap-1.5 text-ink">
                                            <HardDrive className="size-3 text-amber-500" />
                                            {selection.tenant.s3Bucket}
                                        </span>
                                        <span className="text-[9px] text-faint">
                                            S3 Bucket
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Rotation Status */}
                        {selection.tenant.rotation && (
                            <div className="rounded-xl border border-line bg-paper/30 p-3">
                                <span className="text-[10px] font-semibold tracking-wider text-soft uppercase">
                                    Credential Rotation
                                </span>
                                <div className="mt-2 flex items-center justify-between font-mono text-[11px]">
                                    <span className="text-faint">State</span>
                                    <span
                                        className={cn(
                                            'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                                            selection.tenant.rotation.state ===
                                                'managed'
                                                ? 'bg-ok/10 text-ok'
                                                : 'bg-paper text-soft',
                                        )}
                                    >
                                        {selection.tenant.rotation.state.toUpperCase()}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Security Sync */}
                        <div className="flex items-start gap-2.5 rounded-xl border border-line bg-paper/40 p-3">
                            <Shield className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                            <div className="space-y-1">
                                <h5 className="text-[11px] font-bold text-ink">
                                    OpenBao Vault Synced
                                </h5>
                                <p className="text-[10px] leading-relaxed text-soft">
                                    Credentials and socket parameters for this
                                    custom tenant are stored and synchronized in
                                    the cluster secrets backend.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* 4. Engine Inspector */}
                {selection.type === 'engine' && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <ToolLogo
                                slug={selection.engine.driver}
                                size="lg"
                                className="shrink-0 shadow-xs"
                            />
                            <div className="min-w-0 flex-1">
                                <h4 className="truncate text-sm font-bold text-ink">
                                    {selection.engine.label}
                                </h4>
                                <p className="font-mono text-[11px] text-faint">
                                    {selection.engine.categoryLabel}
                                </p>
                            </div>
                        </div>

                        {/* Parameters */}
                        <div className="grid grid-cols-2 gap-2 text-center">
                            <div className="rounded-xl border border-line bg-paper/40 p-2">
                                <span className="text-[9px] font-semibold tracking-wider text-faint uppercase">
                                    Internal Port
                                </span>
                                <div className="mt-0.5 font-mono text-xs font-bold text-ink">
                                    {selection.engine.port || 'Default'}
                                </div>
                            </div>
                            <div className="rounded-xl border border-line bg-paper/40 p-2">
                                <span className="text-[9px] font-semibold tracking-wider text-faint uppercase">
                                    Status
                                </span>
                                <div className="mt-0.5 font-mono text-xs font-bold text-ok">
                                    {selection.engine.ready
                                        ? 'Running'
                                        : 'Standby'}
                                </div>
                            </div>
                        </div>

                        {/* Pod Telemetry (if available) */}
                        {engineMetrics && (
                            <div className="grid grid-cols-2 gap-2 text-center">
                                <div className="rounded-xl border border-line bg-paper/40 p-2">
                                    <span className="text-[9px] font-semibold tracking-wider text-faint uppercase">
                                        Pod CPU
                                    </span>
                                    <div className="mt-0.5 font-mono text-xs font-bold text-ink">
                                        {engineMetrics.cpu}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-line bg-paper/40 p-2">
                                    <span className="text-[9px] font-semibold tracking-wider text-faint uppercase">
                                        Pod Memory
                                    </span>
                                    <div className="mt-0.5 font-mono text-xs font-bold text-ink">
                                        {engineMetrics.memory}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Connected Tenants */}
                        <div className="rounded-xl border border-line bg-paper/30 p-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-semibold tracking-wider text-soft uppercase">
                                    Connected Tenants
                                </span>
                                <span className="font-mono text-[10px] font-semibold text-brand">
                                    {selection.engine.tenantsCount} active
                                </span>
                            </div>

                            <div className="mt-2.5 max-h-40 space-y-1.5 overflow-y-auto pr-1">
                                {selection.engine.tenants.length === 0 ? (
                                    <p className="text-[11px] text-faint italic">
                                        No tenant databases provisioned on this
                                        engine yet.
                                    </p>
                                ) : (
                                    selection.engine.tenants.map((t, idx) => {
                                        const resLabel =
                                            t.database ||
                                            t.s3Bucket ||
                                            (t.redisIndex !== null &&
                                            t.redisIndex !== undefined
                                                ? `Index ${t.redisIndex}`
                                                : 'connected');
                                        return (
                                            <div
                                                key={idx}
                                                className="flex items-center justify-between rounded-lg border border-line/60 bg-surface/70 px-2 py-1.5 font-mono text-[10.5px]"
                                            >
                                                <span className="font-semibold text-ink">
                                                    {t.name}
                                                </span>
                                                <span className="truncate text-faint">
                                                    {resLabel}
                                                </span>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 5. Conduit Inspector */}
                {selection.type === 'conduit' && (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-line bg-paper/40 p-3 text-center">
                            <span className="text-[9.5px] font-semibold tracking-wider text-faint uppercase">
                                Data Pipeline Conduit
                            </span>
                            <div className="mt-1 flex items-center justify-center gap-2 font-mono text-xs font-bold text-ink">
                                <span>
                                    {selection.conduit.fromName ||
                                        (selection.conduit as any).fromApp}
                                </span>
                                <span className="text-brand">➔</span>
                                <span>{selection.conduit.toEngine}</span>
                            </div>
                        </div>

                        {/* Details */}
                        <div className="space-y-2 rounded-xl border border-line bg-paper/30 p-3 font-mono text-[11px]">
                            <div className="flex items-center justify-between">
                                <span className="text-faint">Service Type</span>
                                <span className="font-semibold text-ink uppercase">
                                    {selection.conduit.serviceType}
                                </span>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-faint">Socket Port</span>
                                <span className="font-semibold text-ink">
                                    :{selection.conduit.details.port}
                                </span>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-faint">Protocol</span>
                                <span className="font-semibold text-ink">
                                    {selection.conduit.details.protocol}
                                </span>
                            </div>

                            {selection.conduit.details.databaseName && (
                                <div className="flex items-center justify-between">
                                    <span className="text-faint">
                                        Target Database
                                    </span>
                                    <span className="truncate font-semibold text-brand">
                                        {selection.conduit.details.databaseName}
                                    </span>
                                </div>
                            )}

                            {selection.conduit.details.redisIndex !==
                                undefined &&
                                selection.conduit.details.redisIndex !==
                                    null && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-faint">
                                            Redis Scope
                                        </span>
                                        <span className="font-semibold text-rose-500">
                                            {String(
                                                selection.conduit.details
                                                    .redisIndex,
                                            )}
                                        </span>
                                    </div>
                                )}

                            {selection.conduit.details.bucketName && (
                                <div className="flex items-center justify-between">
                                    <span className="text-faint">
                                        S3 Bucket
                                    </span>
                                    <span className="truncate font-semibold text-amber-500">
                                        {selection.conduit.details.bucketName}
                                    </span>
                                </div>
                            )}

                            {selection.conduit.details.purpose && (
                                <div className="flex items-center justify-between">
                                    <span className="text-faint">
                                        Pipeline Purpose
                                    </span>
                                    <span className="truncate font-semibold text-cyan-600 dark:text-cyan-400">
                                        {selection.conduit.details.purpose}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Secrets Backend */}
                        <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface p-3">
                            <Shield className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                            <div className="space-y-1">
                                <h5 className="text-[11px] font-bold text-ink">
                                    Automated OpenBao Vault Sync
                                </h5>
                                <p className="text-[10px] leading-relaxed text-soft">
                                    Credentials and socket keys are
                                    automatically managed and synchronized via
                                    OpenBao / K8s Secrets.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
}
