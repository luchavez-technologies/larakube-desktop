import { Link } from '@inertiajs/react';
import { Plus, ArrowRight } from 'lucide-react';
import { buttonClass } from '@/components/button';
import Card from '@/components/card';
import PageHeader from '@/components/page-header';
import StatusPill from '@/components/status-pill';
import WelcomeOnboarding from '@/components/welcome-onboarding';
import QuickActionsBar from '@/components/quick-actions-bar';
import AppLayout from '@/layouts/app-layout';
import { runStatus } from '@/lib/servers';
import { readiness } from '@/routes';
import {
    create as createProject,
    show as showProject,
} from '@/routes/projects';
import { show as showRun } from '@/routes/runs';
import { create as createServer, show as showServer } from '@/routes/servers';
import Sparkline from '@/components/metrics/sparkline';
import RadialGauge from '@/components/metrics/radial-gauge';
import type {
    FleetMetrics,
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

type DashboardProps = {
    stats: {
        projectsCount: number;
        serversCount: number;
        readyServersCount: number;
        missingToolsCount: number;
    };
    projects: Project[];
    servers: Server[];
    runs: RecentRun[];
    toolsReady: boolean;
    unprotectedServers?: string[];
    localCluster: {
        engine: string;
        context?: string | null;
        status: string;
        tone: 'ok' | 'warn' | 'muted' | 'bad';
    };
    fleetMetrics?: FleetMetrics | null;
};

export default function DashboardIndex({
    stats,
    projects,
    servers,
    runs,
    toolsReady,
    unprotectedServers,
    localCluster,
    fleetMetrics,
}: DashboardProps) {
    return (
        <AppLayout title="Dashboard">
            <PageHeader
                title="Fleet Dashboard"
                meta={<span>LaraKube Fleet Overview</span>}
                actions={
                    <div className="flex items-center gap-2.5">
                        <Link
                            href={createProject().url}
                            className={buttonClass('primary')}
                        >
                            <Plus className="size-4" />
                            <span>New Project</span>
                        </Link>
                        <Link
                            href={createServer().url}
                            className={buttonClass('secondary')}
                        >
                            <Plus className="size-4" />
                            <span>Create Server</span>
                        </Link>
                    </div>
                }
            />

            {/* Quick Metrics */}
            <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Card>
                    <p className="text-xs font-medium text-soft">Projects</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">
                        {stats.projectsCount}
                    </p>
                    <p className="mt-0.5 text-[11px] text-soft">
                        Active workspaces
                    </p>
                </Card>
                <Card>
                    <p className="text-xs font-medium text-soft">Servers</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">
                        {stats.readyServersCount}
                        <span className="text-sm font-normal text-soft">
                            /{stats.serversCount}
                        </span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-soft">
                        Ready clusters
                    </p>
                </Card>
                <Card>
                    <p className="text-xs font-medium text-soft">
                        Local Cluster
                    </p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">
                        {localCluster.engine}
                    </p>
                    <p
                        className={`mt-0.5 text-[11px] font-medium ${
                            localCluster.tone === 'ok'
                                ? 'text-ok'
                                : localCluster.tone === 'warn'
                                  ? 'text-warn'
                                  : 'text-soft'
                        }`}
                    >
                        {localCluster.status}
                    </p>
                </Card>
                <Card>
                    <p className="text-xs font-medium text-soft">
                        System Health
                    </p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">
                        {toolsReady ? 'Healthy' : 'Action needed'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-soft">
                        All core daemons
                    </p>
                </Card>
            </div>

            {fleetMetrics && (
                <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Card className="flex items-center justify-between p-4">
                        <div>
                            <p className="text-xs font-medium text-soft">
                                Fleet Health Score
                            </p>
                            <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">
                                {fleetMetrics.fleetHealthScore}%
                            </p>
                            <p className="mt-0.5 text-[11px] text-faint">
                                {fleetMetrics.readyServers} of{' '}
                                {fleetMetrics.totalServers} clusters healthy
                            </p>
                        </div>
                        <RadialGauge
                            value={fleetMetrics.fleetHealthScore}
                            label=""
                            size="sm"
                            tone="auto"
                        />
                    </Card>

                    <Card className="flex items-center justify-between p-4">
                        <div>
                            <p className="text-xs font-medium text-soft">
                                Deployment Success
                            </p>
                            <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">
                                {fleetMetrics.deploySuccessRate}%
                            </p>
                            <p className="mt-0.5 text-[11px] text-faint">
                                {fleetMetrics.deploys30d} deploys in last 30d
                            </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                            <span className="font-mono text-[10px] text-faint">
                                14-day activity
                            </span>
                            <Sparkline
                                data={fleetMetrics.deployActivity14d}
                                type="bar"
                                height={28}
                                width={100}
                                unit=" deploys"
                            />
                        </div>
                    </Card>

                    <Card className="flex flex-col justify-between p-4">
                        <div>
                            <p className="text-xs font-medium text-soft">
                                Average Rollout
                            </p>
                            <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">
                                {fleetMetrics.avgDeployDurationSeconds
                                    ? `${fleetMetrics.avgDeployDurationSeconds}s`
                                    : '—'}
                            </p>
                            <p className="mt-0.5 text-[11px] text-faint">
                                Deploy & rollout duration
                            </p>
                        </div>
                        <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                            <span>Zero-downtime rolling updates</span>
                        </div>
                    </Card>
                </div>
            )}

            {!toolsReady && (
                <div className="mb-6 rounded-xl border border-line bg-paper p-4">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-medium text-ink">
                                Setup prerequisites needed
                            </p>
                            <p className="text-xs text-soft">
                                {stats.missingToolsCount} required CLI tools or
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

            {unprotectedServers && unprotectedServers.length > 0 && (
                <div className="mb-6 rounded-xl border border-warn-line bg-warn-tint p-4">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-medium text-ink">
                                {unprotectedServers.length === 1
                                    ? '1 server has no backups'
                                    : `${unprotectedServers.length} servers have no backups`}
                            </p>
                            <p className="text-xs text-soft">
                                {unprotectedServers.join(', ')}. If a server is
                                lost, what is on it is lost too.
                            </p>
                        </div>
                        <Link
                            href={`/servers/${unprotectedServers[0]}`}
                            className={buttonClass('primary', 'sm')}
                        >
                            <span>Set up backups</span>
                            <ArrowRight className="size-3" />
                        </Link>
                    </div>
                </div>
            )}

            {/* Main Content Grid */}
            <div className="grid grid-cols-[1fr_340px] items-start gap-5">
                <div className="flex flex-col gap-5">
                    {/* Projects Fleet */}
                    <Card label="Projects">
                        {projects.length === 0 ? (
                            <div className="py-6 text-center">
                                <p className="text-sm text-soft">
                                    No projects registered yet.
                                </p>
                                <Link
                                    href={createProject().url}
                                    className="mt-2 inline-block text-xs font-medium text-brand hover:underline"
                                >
                                    Create or add your first app →
                                </Link>
                            </div>
                        ) : (
                            <div className="divide-y divide-line">
                                {projects.map((project) => (
                                    <div
                                        key={project.id}
                                        className="flex items-center justify-between gap-4 py-3 first:pt-1 last:pb-1"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <Link
                                                    href={
                                                        showProject(project.id)
                                                            .url
                                                    }
                                                    className="truncate text-sm font-medium text-ink hover:underline"
                                                >
                                                    {project.name}
                                                </Link>
                                                {project.framework && (
                                                    <StatusPill tone="muted">
                                                        {project.framework}
                                                    </StatusPill>
                                                )}
                                            </div>
                                            <p className="mt-0.5 truncate font-mono text-xs text-soft">
                                                {project.webHost
                                                    ? `https://${project.webHost}`
                                                    : project.path}
                                            </p>
                                        </div>
                                        <Link
                                            href={showProject(project.id).url}
                                            className={buttonClass(
                                                'secondary',
                                                'sm',
                                            )}
                                        >
                                            <span>Manage</span>
                                            <ArrowRight className="size-3" />
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>

                    {/* Servers Fleet */}
                    <Card label="Cloud Servers">
                        {servers.length === 0 ? (
                            <div className="py-6 text-center">
                                <p className="text-sm text-soft">
                                    No cloud servers provisioned yet.
                                </p>
                                <Link
                                    href={createServer().url}
                                    className="mt-2 inline-block text-xs font-medium text-brand hover:underline"
                                >
                                    Create a server with OpenTofu →
                                </Link>
                            </div>
                        ) : (
                            <div className="divide-y divide-line">
                                {servers.map((server) => (
                                    <div
                                        key={server.name}
                                        className="flex items-center justify-between gap-4 py-3 first:pt-1 last:pb-1"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <Link
                                                    href={
                                                        showServer(server.name)
                                                            .url
                                                    }
                                                    className="truncate text-sm font-medium text-ink hover:underline"
                                                >
                                                    {server.name}
                                                </Link>
                                                <StatusPill
                                                    tone={
                                                        server.status ===
                                                        'ready'
                                                            ? 'ok'
                                                            : 'muted'
                                                    }
                                                >
                                                    {server.status}
                                                </StatusPill>
                                            </div>
                                            <p className="mt-0.5 truncate font-mono text-xs text-soft">
                                                {server.ip ??
                                                    'Provisioning IP…'}{' '}
                                                ·{' '}
                                                {server.provider.toUpperCase()}
                                            </p>
                                        </div>
                                        <Link
                                            href={showServer(server.name).url}
                                            className={buttonClass(
                                                'secondary',
                                                'sm',
                                            )}
                                        >
                                            <span>View</span>
                                            <ArrowRight className="size-3" />
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>

                {/* Right Column: Activity Feed */}
                <div className="flex flex-col gap-5">
                    <Card label="Recent Activity">
                        {runs.length === 0 ? (
                            <p className="py-3 text-xs text-soft">
                                No recent activity.
                            </p>
                        ) : (
                            <div className="divide-y divide-line">
                                {runs.map((run) => {
                                    const [label, tone] = runStatus[run.status];
                                    return (
                                        <Link
                                            key={run.id}
                                            href={showRun(run.id).url}
                                            className="flex items-center justify-between gap-3 py-2.5 hover:opacity-85"
                                        >
                                            <span className="truncate text-[13px] text-ink">
                                                {run.label}
                                            </span>
                                            <StatusPill tone={tone}>
                                                {label}
                                            </StatusPill>
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                    </Card>
                </div>
            </div>

            {/* 1-Click Companion Apps */}
            <QuickActionsBar servers={servers} />

            {/* Getting Started Walkthrough */}
            <WelcomeOnboarding
                serversCount={stats.serversCount}
                projectsCount={stats.projectsCount}
            />
        </AppLayout>
    );
}
