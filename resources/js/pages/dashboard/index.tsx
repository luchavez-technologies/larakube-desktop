import { Deferred, Link, usePage } from '@inertiajs/react';
import {
    AlertTriangle,
    ArrowRight,
    ChevronRight,
    Database,
    ExternalLink,
    Folder,
    FolderTree,
    Globe,
    HardDrive,
    LayoutGrid,
    Plus,
    RotateCw,
    ShieldAlert,
    ShieldCheck,
    X,
    Zap,
} from 'lucide-react';
import { useState } from 'react';
import Button, { buttonClass } from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import FrameworkLogo, {
    resolveFrameworkLabel,
} from '@/components/framework-logo';
import RadialGauge from '@/components/metrics/radial-gauge';
import Sparkline from '@/components/metrics/sparkline';
import PageHeader from '@/components/page-header';
import ProviderLogo from '@/components/provider-logo';
import QrCodePopover from '@/components/qr-code-popover';
import Redactable from '@/components/redactable';
import StatusPill from '@/components/status-pill';
import WelcomeOnboarding from '@/components/welcome-onboarding';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import {
    isLocalServer,
    serverEndpointLabel,
    getServerStatusBadge,
} from '@/lib/servers';
import { readiness, tools as toolsRoute } from '@/routes';
import {
    create as createProject,
    index as indexProjects,
    show as showProject,
} from '@/routes/projects';
import { show as showRun } from '@/routes/runs';
import {
    create as createServer,
    index as indexServers,
    show as showServer,
} from '@/routes/servers';
import { providerLabels } from '@/types/larakube';
import type {
    FleetMetrics,
    FrameworkCatalog,
    Project,
    RunStatus,
    Server,
} from '@/types/larakube';

type RecentRun = {
    id: number;
    label: string;
    kind: string | null;
    status: RunStatus;
    created_at: string;
};

type BackupStats = {
    total: number;
    protected: number;
    unprotected: string[];
};

type DashboardProps = {
    stats?: {
        projectsCount: number;
        serversCount: number;
        readyServersCount: number;
        missingToolsCount: number;
        installedToolsCount?: number;
    };
    projects?: Project[];
    servers?: Server[];
    runs: RecentRun[];
    backups?: BackupStats;
    localCluster?: {
        engine: string;
        context?: string | null;
        status: string;
        tone: 'ok' | 'warn' | 'muted' | 'bad';
    };
    fleetMetrics?: FleetMetrics | null;
    projectCatalog?: FrameworkCatalog | null;
    projectDevBoxes?: { name: string; ip: string | null }[];
    defaultProjectParent?: string;
};

function shortenPath(path: string, home?: string): string {
    if (home && path.startsWith(home)) {
        return `~${path.slice(home.length)}`;
    }
    return path.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~');
}

function TelemetryStripSkeleton() {
    return (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="flex flex-col justify-between p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                            <div className="h-3.5 w-28 animate-pulse rounded bg-paper" />
                            <div className="h-7 w-16 animate-pulse rounded bg-paper" />
                        </div>
                        <div className="size-11 animate-pulse rounded-xl bg-paper" />
                    </div>
                    <div className="mt-3 h-3.5 w-36 animate-pulse rounded bg-paper" />
                </Card>
            ))}
        </div>
    );
}

function MiniCardGridSkeleton({ count = 4 }: { count?: number }) {
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    className="flex flex-col justify-between rounded-xl bg-paper/40 p-4 ring-1 ring-line/70"
                >
                    <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-2.5">
                            <div className="size-9 shrink-0 animate-pulse rounded-xl bg-paper" />
                            <div className="space-y-1.5">
                                <div className="h-4 w-24 animate-pulse rounded bg-paper" />
                                <div className="h-3 w-16 animate-pulse rounded bg-paper" />
                            </div>
                        </div>
                        <div className="h-5 w-14 animate-pulse rounded-full bg-paper" />
                    </div>
                    <div className="mt-3 h-7 w-full animate-pulse rounded-lg bg-paper" />
                    <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5">
                        <div className="h-3.5 w-20 animate-pulse rounded bg-paper" />
                        <div className="h-4 w-14 animate-pulse rounded bg-paper" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function DashboardIndex({
    stats,
    projects,
    servers,
    runs,
    backups,
    localCluster,
    fleetMetrics,
    projectCatalog,
    projectDevBoxes,
    defaultProjectParent,
}: DashboardProps) {
    const { hideProjects } = usePage<{ hideProjects?: boolean }>().props;

    // Derived from `stats` so we never trigger a second subprocess tool scan.
    const toolsReady =
        stats !== undefined ? stats.missingToolsCount === 0 : undefined;

    const [dismissedFailedRunId, setDismissedFailedRunId] = useState<
        number | null
    >(() => {
        if (typeof window === 'undefined') return null;
        const stored = window.localStorage.getItem(
            'larakube_dismissed_failed_run_id',
        );
        return stored ? Number(stored) : null;
    });

    // Surface an inline live banner ONLY when a run is actively running or the
    // most recent run failed — replaces the noisy bottom Recent Activity card.
    const activeRun = runs.find((r) => r.status === 'running');
    const latestFailedRun =
        !activeRun &&
        runs[0]?.status === 'failed' &&
        runs[0].id !== dismissedFailedRunId
            ? runs[0]
            : undefined;

    function dismissFailedRun(runId: number) {
        setDismissedFailedRunId(runId);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(
                'larakube_dismissed_failed_run_id',
                String(runId),
            );
        }
    }

    return (
        <AppLayout title="Dashboard">
            <PageHeader
                title="Fleet Dashboard"
                meta={<span>LaraKube Fleet Overview</span>}
                actions={
                    <div className="flex items-center gap-2.5">
                        {!hideProjects && (
                            <Link
                                href={createProject().url}
                                className={buttonClass('primary')}
                            >
                                <Plus className="size-4" />
                                <span>New Project</span>
                            </Link>
                        )}
                        <Link
                            href={createServer().url}
                            prefetch
                            className={buttonClass(
                                hideProjects ? 'primary' : 'secondary',
                            )}
                        >
                            <Plus className="size-4" />
                            <span>Create Server</span>
                        </Link>
                    </div>
                }
            />

            {/* Live Run / Failed Run Attention Banner (only shown when actionable) */}
            {activeRun ? (
                <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <RotateCw className="size-4 shrink-0 animate-spin text-amber-500" />
                        <span className="truncate text-xs font-medium text-ink">
                            {activeRun.label}
                        </span>
                        <StatusPill tone="busy">Running</StatusPill>
                    </div>
                    <Link
                        href={showRun(activeRun.id).url}
                        className={buttonClass('secondary', 'sm')}
                    >
                        <span>View Live Output</span>
                        <ArrowRight className="size-3" />
                    </Link>
                </div>
            ) : latestFailedRun ? (
                <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <AlertTriangle className="size-4 shrink-0 text-rose-500" />
                        <span className="truncate text-xs font-medium text-ink">
                            Last operation failed: {latestFailedRun.label}
                        </span>
                        <StatusPill tone="bad">Failed</StatusPill>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <Link
                            href={showRun(latestFailedRun.id).url}
                            className={buttonClass('secondary', 'sm')}
                        >
                            <span>Inspect Logs</span>
                            <ArrowRight className="size-3" />
                        </Link>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => dismissFailedRun(latestFailedRun.id)}
                            aria-label="Dismiss error banner"
                            className="text-soft hover:text-ink"
                        >
                            <X className="size-3.5" />
                            <span>Dismiss</span>
                        </Button>
                    </div>
                </div>
            ) : null}

            {/* Quickstart Onboarding & 1-Click Companions Banner */}
            <WelcomeOnboarding
                servers={servers ?? []}
                serversCount={stats?.serversCount ?? 0}
                projectsCount={stats?.projectsCount ?? 0}
                projectCatalog={projectCatalog}
                projectDevBoxes={projectDevBoxes}
                defaultProjectParent={defaultProjectParent}
            />

            {/* Consolidated 4-Card Interactive Fleet Telemetry Strip */}
            <Deferred
                data={['stats', 'localCluster', 'fleetMetrics', 'backups']}
                fallback={<TelemetryStripSkeleton />}
            >
                {stats && localCluster && (
                    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {/* 1. Projects or Cluster Tools */}
                        {hideProjects ? (
                            <Link
                                href={toolsRoute().url}
                                className="group flex flex-col justify-between rounded-2xl bg-surface p-4 ring-1 ring-line transition-all ring-inset hover:ring-faint"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-medium text-soft group-hover:text-ink">
                                            Cluster Apps
                                        </p>
                                        <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">
                                            {stats.installedToolsCount ?? 0}
                                        </p>
                                    </div>
                                    <div className="flex size-7 items-center justify-center rounded-lg bg-tools/10 text-tools">
                                        <LayoutGrid className="size-4" />
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center justify-between text-[11px] text-soft">
                                    <span>Active cluster apps</span>
                                    <span className="inline-flex items-center gap-0.5 font-medium text-brand group-hover:underline">
                                        Browse apps
                                        <ChevronRight className="size-3" />
                                    </span>
                                </div>
                            </Link>
                        ) : (
                            <Link
                                href={indexProjects().url}
                                className="group flex flex-col justify-between rounded-2xl bg-surface p-4 ring-1 ring-line transition-all ring-inset hover:ring-faint"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-medium text-soft group-hover:text-ink">
                                            Projects & Workspaces
                                        </p>
                                        <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">
                                            {stats.projectsCount}
                                        </p>
                                    </div>
                                    {projects && projects.length > 0 ? (
                                        <div className="flex -space-x-1.5 overflow-hidden p-0.5">
                                            {Array.from(
                                                new Set(
                                                    projects
                                                        .map((p) => p.framework)
                                                        .filter(
                                                            (f): f is string =>
                                                                Boolean(f),
                                                        ),
                                                ),
                                            )
                                                .slice(0, 3)
                                                .map((fw) => (
                                                    <div
                                                        key={fw}
                                                        className="flex size-7 items-center justify-center rounded-lg bg-paper ring-2 ring-surface"
                                                    >
                                                        <FrameworkLogo
                                                            slug={fw}
                                                            size="xs"
                                                        />
                                                    </div>
                                                ))}
                                        </div>
                                    ) : null}
                                </div>
                                <div className="mt-3 flex items-center justify-between text-[11px] text-soft">
                                    <span>Active local & cloud apps</span>
                                    <span className="inline-flex items-center gap-0.5 font-medium text-brand group-hover:underline">
                                        View all
                                        <ChevronRight className="size-3" />
                                    </span>
                                </div>
                            </Link>
                        )}

                        {/* 2. Cluster Fleet & Health */}
                        <Link
                            href={indexServers().url}
                            className="group flex flex-col justify-between rounded-2xl bg-surface p-4 ring-1 ring-line transition-all ring-inset hover:ring-faint"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-medium text-soft group-hover:text-ink">
                                        Cluster Fleet & Health
                                    </p>
                                    <div className="mt-1 flex items-baseline gap-2">
                                        <p className="text-2xl font-semibold tracking-tight text-ink">
                                            {stats.readyServersCount}
                                            <span className="text-sm font-normal text-soft">
                                                /{stats.serversCount}
                                            </span>
                                        </p>
                                        {fleetMetrics && (
                                            <span className="font-mono text-xs font-medium text-ok">
                                                {fleetMetrics.fleetHealthScore}%
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {fleetMetrics && (
                                    <RadialGauge
                                        value={fleetMetrics.fleetHealthScore}
                                        label=""
                                        size="sm"
                                        tone="auto"
                                        direction="higher-is-better"
                                    />
                                )}
                            </div>
                            <div className="mt-3 flex items-center justify-between text-[11px] text-soft">
                                <span className="truncate">
                                    {toolsReady
                                        ? 'All core daemons healthy'
                                        : `${stats.missingToolsCount} setup tool(s) needed`}
                                </span>
                                <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-brand group-hover:underline">
                                    Servers
                                    <ChevronRight className="size-3" />
                                </span>
                            </div>
                        </Link>

                        {/* 3. Backup & DR Protection */}
                        <div className="flex flex-col justify-between rounded-2xl bg-surface p-4 ring-1 ring-line ring-inset">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium text-soft">
                                        Backup & DR Protection
                                    </p>
                                    <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">
                                        {!backups || backups.total === 0 ? (
                                            '—'
                                        ) : (
                                            <>
                                                {backups.protected}
                                                <span className="text-sm font-normal text-soft">
                                                    /{backups.total}
                                                </span>
                                            </>
                                        )}
                                    </p>
                                </div>
                                {backups &&
                                backups.total > 0 &&
                                backups.unprotected.length > 0 ? (
                                    <Link
                                        href={`/servers/${backups.unprotected[0]}/backups`}
                                        className={buttonClass(
                                            'secondary',
                                            'sm',
                                        )}
                                        title={`Configure backups for ${backups.unprotected.join(', ')}`}
                                    >
                                        <ShieldAlert className="size-3.5 text-warn" />
                                        <span>Set up</span>
                                    </Link>
                                ) : (
                                    <Link
                                        href="/backups"
                                        className="flex size-10 items-center justify-center rounded-xl bg-ok-tint text-ok transition hover:opacity-85"
                                        title="Open Disaster Recovery & Backups"
                                    >
                                        <ShieldCheck className="size-5" />
                                    </Link>
                                )}
                            </div>
                            <div className="mt-3 flex items-center justify-between text-[11px] text-soft">
                                <span className="truncate">
                                    {!backups || backups.total === 0
                                        ? 'No cloud clusters yet'
                                        : backups.unprotected.length === 0
                                          ? 'All cloud clusters protected'
                                          : `${backups.unprotected.length} cloud cluster${backups.unprotected.length === 1 ? '' : 's'} at risk`}
                                </span>
                                <Link
                                    href="/backups"
                                    className="inline-flex shrink-0 items-center gap-0.5 font-medium text-brand hover:underline"
                                >
                                    DR Center
                                    <ChevronRight className="size-3" />
                                </Link>
                            </div>
                        </div>

                        {/* 4. Deployments & Local Engine */}
                        <div className="flex flex-col justify-between rounded-2xl bg-surface p-4 ring-1 ring-line ring-inset">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-medium text-soft">
                                        Deployments & Rollouts
                                    </p>
                                    <div className="mt-1 flex items-baseline gap-2">
                                        <p className="text-2xl font-semibold tracking-tight text-ink">
                                            {fleetMetrics
                                                ? `${fleetMetrics.deploySuccessRate}%`
                                                : '—'}
                                        </p>
                                        {fleetMetrics?.avgDeployDurationSeconds ? (
                                            <span className="font-mono text-xs text-soft">
                                                avg{' '}
                                                {
                                                    fleetMetrics.avgDeployDurationSeconds
                                                }
                                                s
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                                {fleetMetrics && (
                                    <div className="flex flex-col items-end gap-1">
                                        <span className="font-mono text-[10px] text-faint">
                                            14d deploys
                                        </span>
                                        <Sparkline
                                            data={
                                                fleetMetrics.deployActivity14d
                                            }
                                            type="bar"
                                            height={26}
                                            width={68}
                                            unit=" deploys"
                                        />
                                    </div>
                                )}
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
                                <span className="truncate text-soft">
                                    Local:{' '}
                                    <strong className="font-medium text-ink">
                                        {localCluster.engine}
                                    </strong>
                                </span>
                                <span
                                    className={`truncate font-medium ${
                                        localCluster.tone === 'ok'
                                            ? 'text-ok'
                                            : localCluster.tone === 'warn'
                                              ? 'text-warn'
                                              : 'text-soft'
                                    }`}
                                >
                                    {localCluster.status}
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </Deferred>

            {toolsReady !== undefined && !toolsReady && (
                <div className="mb-6 rounded-xl border border-line bg-paper p-4">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-medium text-ink">
                                Setup prerequisites needed
                            </p>
                            <p className="text-xs text-soft">
                                {stats?.missingToolsCount} required CLI tools or
                                runtimes are missing.
                            </p>
                        </div>
                        <Link
                            href={readiness().url}
                            className={buttonClass('primary', 'sm')}
                        >
                            <span>Complete Setup</span>
                            <ArrowRight className="size-3" />
                        </Link>
                    </div>
                </div>
            )}

            {/* Core Fleet Workloads: Rich Mini-Cards for Projects & Servers */}
            <div
                className={cn(
                    'grid items-start gap-5',
                    hideProjects ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2',
                )}
            >
                {/* Projects Section */}
                {!hideProjects && (
                    <Card>
                        <div className="mb-3.5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <h2 className="text-xs font-semibold tracking-[0.06em] text-soft uppercase">
                                    Projects
                                </h2>
                                {stats?.projectsCount !== undefined && (
                                    <span className="rounded-full bg-paper px-2 py-0.5 font-mono text-[11px] font-medium text-soft ring-1 ring-line/60">
                                        {stats.projectsCount}
                                    </span>
                                )}
                            </div>
                            <Link
                                href={indexProjects().url}
                                className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                            >
                                <span>View all</span>
                                <ArrowRight className="size-3" />
                            </Link>
                        </div>

                        <Deferred
                            data="projects"
                            fallback={<MiniCardGridSkeleton count={4} />}
                        >
                            {!projects || projects.length === 0 ? (
                                <div className="rounded-xl bg-paper/40 py-8 text-center ring-1 ring-line/60">
                                    <p className="text-sm text-soft">
                                        No projects registered yet.
                                    </p>
                                    <Link
                                        href={createProject().url}
                                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                                    >
                                        <Plus className="size-3.5" />
                                        <span>
                                            Create or add your first app
                                        </span>
                                    </Link>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    {projects.map((project) => (
                                        <DashboardProjectMiniCard
                                            key={project.id}
                                            project={project}
                                            home={defaultProjectParent}
                                        />
                                    ))}
                                </div>
                            )}
                        </Deferred>
                    </Card>
                )}

                {/* Servers Section */}
                <Card>
                    <div className="mb-3.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h2 className="text-xs font-semibold tracking-[0.06em] text-soft uppercase">
                                Servers & Clusters
                            </h2>
                            {stats?.serversCount !== undefined && (
                                <span className="rounded-full bg-paper px-2 py-0.5 font-mono text-[11px] font-medium text-soft ring-1 ring-line/60">
                                    {stats.serversCount}
                                </span>
                            )}
                        </div>
                        <Link
                            href={indexServers().url}
                            className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                        >
                            <span>View all</span>
                            <ArrowRight className="size-3" />
                        </Link>
                    </div>

                    <Deferred
                        data="servers"
                        fallback={<MiniCardGridSkeleton count={4} />}
                    >
                        {!servers || servers.length === 0 ? (
                            <div className="rounded-xl bg-paper/40 py-8 text-center ring-1 ring-line/60">
                                <p className="text-sm text-soft">
                                    No servers provisioned yet.
                                </p>
                                <Link
                                    href={createServer().url}
                                    prefetch
                                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                                >
                                    <Plus className="size-3.5" />
                                    <span>Create a server with OpenTofu</span>
                                </Link>
                            </div>
                        ) : (
                            <div
                                className={cn(
                                    'grid gap-3',
                                    hideProjects
                                        ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                                        : 'grid-cols-1 sm:grid-cols-2',
                                )}
                            >
                                {servers.map((server) => (
                                    <DashboardServerMiniCard
                                        key={server.name}
                                        server={server}
                                    />
                                ))}
                            </div>
                        )}
                    </Deferred>
                </Card>
            </div>
        </AppLayout>
    );
}

function DashboardProjectMiniCard({
    project,
    home,
}: {
    project: Project;
    home?: string;
}) {
    const frameworkSlug =
        project.framework ?? project.detectedFramework ?? 'code';
    const effectiveHost =
        project.webHost ||
        project.localStatus?.domain ||
        project.environments?.local?.webHost;
    const serverDisplay = project.serverName ?? project.serverIp;
    const displayPath = shortenPath(project.path, home);

    return (
        <div className="group flex flex-col justify-between rounded-xl bg-paper/35 p-3.5 ring-1 ring-line/80 transition-all hover:bg-paper/60 hover:ring-faint">
            <div>
                {/* Header: Framework Logo, Project Name, Group */}
                <div className="flex items-start justify-between gap-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface p-1.5 shadow-2xs ring-1 ring-line/70">
                            <FrameworkLogo slug={frameworkSlug} size="sm" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5 truncate">
                                <Link
                                    href={showProject(project.id).url}
                                    className="truncate text-sm font-semibold text-ink transition-colors group-hover:text-brand hover:underline"
                                    title={project.name}
                                >
                                    {project.name}
                                </Link>
                                {project.group && (
                                    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                                        <FolderTree className="size-2.5" />
                                        <span className="max-w-[70px] truncate">
                                            {project.group}
                                        </span>
                                    </span>
                                )}
                            </div>
                            <span className="block truncate text-[11px] text-soft">
                                {resolveFrameworkLabel(frameworkSlug)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Host Preview Strip or Shortened Path */}
                {effectiveHost ? (
                    <div className="mt-3 flex items-center justify-between gap-1.5 rounded-lg bg-surface/90 px-2.5 py-1.5 ring-1 ring-line/60">
                        <div className="flex min-w-0 items-center gap-1.5 truncate font-mono text-[11px] font-medium text-ink">
                            <Globe className="size-3 shrink-0 text-brand" />
                            <a
                                href={`https://${effectiveHost}`}
                                target="_blank"
                                rel="noreferrer"
                                className="truncate hover:text-brand hover:underline"
                                title={`Open https://${effectiveHost}`}
                            >
                                https://{effectiveHost}
                            </a>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                            <QrCodePopover
                                url={`https://${effectiveHost}`}
                                title={project.name}
                                description="Scan with your phone to preview your project"
                            />
                            <a
                                href={`https://${effectiveHost}`}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded p-1 text-soft transition hover:bg-paper hover:text-ink"
                                title="Open in browser"
                            >
                                <ExternalLink className="size-3" />
                            </a>
                        </div>
                    </div>
                ) : (
                    <div className="mt-3 flex items-center justify-between gap-1.5 rounded-lg bg-surface/60 px-2.5 py-1.5 font-mono text-[11px] text-faint ring-1 ring-line/50">
                        <div className="flex min-w-0 items-center gap-1.5 truncate">
                            <Folder className="size-3 shrink-0 text-faint" />
                            <span className="truncate" title={project.path}>
                                {displayPath}
                            </span>
                        </div>
                        <CopyButton
                            value={project.path}
                            label=""
                            copiedLabel=""
                            size="xs"
                            variant="ghost"
                            className="h-4 w-4 shrink-0 p-0 text-faint hover:text-ink"
                            title="Copy path"
                        />
                    </div>
                )}

                {/* Backing Services & Linked Server Chips */}
                {(serverDisplay ||
                    project.database ||
                    project.cacheDriver ||
                    project.objectStorage) && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        {serverDisplay && (
                            <Link
                                href={showServer(serverDisplay).url}
                                className="inline-flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 font-mono text-[10px] font-medium text-soft ring-1 ring-line/60 hover:text-brand"
                                title={`Target Server: ${serverDisplay}`}
                            >
                                <ProviderLogo
                                    provider={project.serverProvider}
                                    size="xs"
                                    className="size-3.5 shrink-0 [&_svg]:size-2.5"
                                />
                                <span className="max-w-[95px] truncate">
                                    {serverDisplay}
                                </span>
                            </Link>
                        )}
                        {project.database && (
                            <span
                                className="inline-flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 text-[10px] font-medium text-soft capitalize ring-1 ring-line/60"
                                title={`Database: ${project.database}`}
                            >
                                <Database className="size-2.5 text-faint" />
                                {project.database}
                            </span>
                        )}
                        {project.cacheDriver && (
                            <span
                                className="inline-flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 text-[10px] font-medium text-soft capitalize ring-1 ring-line/60"
                                title={`Cache: ${project.cacheDriver}`}
                            >
                                <Zap className="size-2.5 text-faint" />
                                {project.cacheDriver}
                            </span>
                        )}
                        {project.objectStorage && (
                            <span
                                className="inline-flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 text-[10px] font-medium text-soft capitalize ring-1 ring-line/60"
                                title={`Storage: ${project.objectStorage}`}
                            >
                                <HardDrive className="size-2.5 text-faint" />
                                {project.objectStorage}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5">
                <span
                    className="truncate font-mono text-[10px] text-faint"
                    title={project.path}
                >
                    {effectiveHost ? displayPath : 'Local workspace'}
                </span>
                <Link
                    href={showProject(project.id).url}
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand hover:underline"
                >
                    <span>Manage</span>
                    <ChevronRight className="size-3.5" />
                </Link>
            </div>
        </div>
    );
}

function DashboardServerMiniCard({ server }: { server: Server }) {
    const [statusLabel, statusTone] = getServerStatusBadge(server.status);
    const isLocal = isLocalServer(server);
    const endpoint = serverEndpointLabel(server);

    return (
        <div className="group flex flex-col justify-between rounded-xl bg-paper/35 p-3.5 ring-1 ring-line/80 transition-all hover:bg-paper/60 hover:ring-faint">
            <div>
                <div className="flex items-start justify-between gap-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface p-1.5 shadow-2xs ring-1 ring-line/70">
                            <ProviderLogo
                                provider={server.provider}
                                size="sm"
                            />
                        </div>
                        <div className="min-w-0">
                            <Link
                                href={showServer(server.name).url}
                                className="block truncate text-sm font-semibold text-ink transition-colors group-hover:text-brand hover:underline"
                                title={server.name}
                            >
                                {server.name}
                            </Link>
                            <div className="mt-0.5 truncate font-mono text-[11px] text-faint">
                                {server.ip ? (
                                    <Redactable value={server.ip} kind="ip" />
                                ) : (
                                    endpoint
                                )}
                            </div>
                        </div>
                    </div>
                    <StatusPill tone={statusTone}>{statusLabel}</StatusPill>
                </div>

                {/* Provider, Region, Kind, and Active Badges */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-soft">
                    <span className="font-medium">
                        {providerLabels[server.provider] ??
                            server.provider.toUpperCase()}
                    </span>
                    {server.region && <span>· {server.region}</span>}
                    {server.kind === 'managed' && (
                        <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                            Managed
                        </span>
                    )}
                    {server.kind === 'vps' && (
                        <span className="rounded bg-badge px-1.5 py-0.5 text-[10px] font-semibold text-soft">
                            VPS
                        </span>
                    )}
                    {server.kind === 'discovered' && (
                        <span className="rounded bg-badge px-1.5 py-0.5 text-[10px] font-semibold text-soft">
                            {isLocal ? 'Local' : 'Discovered'}
                        </span>
                    )}
                    {server.isCurrent && (
                        <span className="rounded bg-ok-tint px-1.5 py-0.5 text-[10px] font-semibold text-ok">
                            Active
                        </span>
                    )}
                </div>

                {/* Connected ExternalDNS Domains */}
                {server.domains && server.domains.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        {server.domains.slice(0, 3).map((d) => (
                            <span
                                key={d.domain}
                                className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-0.5 font-mono text-[10px] font-medium text-ink ring-1 ring-line/60"
                                title={`${d.domain}${d.dnsProvider ? ` (${d.dnsProvider})` : ''}`}
                            >
                                <Globe className="size-2.5 shrink-0 text-brand" />
                                <span className="max-w-[130px] truncate">
                                    {d.domain}
                                </span>
                            </span>
                        ))}
                        {server.domains.length > 3 && (
                            <span className="text-[10px] text-faint">
                                +{server.domains.length - 3} more
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Footer: Backup Shield + View Link */}
            <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5">
                {isLocal ? (
                    <span className="text-[11px] text-faint">
                        Local dev cluster
                    </span>
                ) : server.backupConfigured ? (
                    <Link
                        href={`/servers/${server.name}/backups`}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-ok hover:underline"
                        title="Backups configured"
                    >
                        <ShieldCheck className="size-3.5" />
                        <span>DR Protected</span>
                    </Link>
                ) : server.backupConfigured === false ? (
                    <Link
                        href={`/servers/${server.name}/backups`}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-warn hover:underline"
                        title="Configure offsite backups"
                    >
                        <ShieldAlert className="size-3.5" />
                        <span>No backup</span>
                    </Link>
                ) : (
                    <Link
                        href={`/servers/${server.name}/backups`}
                        className="inline-flex items-center gap-1 text-[11px] text-soft hover:text-ink"
                    >
                        <ShieldCheck className="size-3.5 text-faint" />
                        <span>Backups</span>
                    </Link>
                )}
                <Link
                    href={showServer(server.name).url}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                >
                    <span>View</span>
                    <ChevronRight className="size-3.5" />
                </Link>
            </div>
        </div>
    );
}
