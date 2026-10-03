import {
    Form,
    Link,
    router,
    useForm,
    usePage,
    usePoll,
} from '@inertiajs/react';
import type { FormEvent, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
    Eye,
    EyeOff,
    Trash2,
    Play,
    ExternalLink,
    Plus,
    ArrowRight,
    Terminal,
    ChevronDown,
    ChevronUp,
    MoreHorizontal,
    Laptop,
    Cloud,
    X,
    Server as ServerIcon,
} from 'lucide-react';
import Button, { buttonClass } from '@/components/button';
import Card from '@/components/card';
import FrameworkFields, {
    defaultAnswers,
    reconcile,
} from '@/components/framework-fields';
import LogPanel from '@/components/log-panel';
import PageHeader from '@/components/page-header';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { runStatus } from '@/lib/servers';
import { cn } from '@/lib/utils';
import { open } from '@/routes';
import {
    deploy,
    destroy,
    down,
    editor as openEditor,
    host as setHost,
    index,
    init,
    link,
    retry,
    start as startLifecycle,
    stop as stopLifecycle,
    tld as setProjectTld,
    up,
} from '@/routes/projects';
import { join as joinPlex, leave as leavePlex } from '@/routes/projects/plex';
import { cancel, show as showRun } from '@/routes/runs';
import { create as createServer, show as showServer } from '@/routes/servers';
import type {
    BackingService,
    BackingServices,
    NewAppAnswers,
    NewAppQuestion,
    Project,
    ProjectEnvironment,
    RunStatus,
    Server,
} from '@/types/larakube';

type RecentRun = {
    id: number;
    label: string;
    kind?: string;
    status: RunStatus;
    created_at: string;
    environment?: string | null;
};

type ProjectRun = {
    id: number;
    label: string;
    kind: string | null;
    status: RunStatus;
    output: string;
    startedAt: string | null;
    finishedAt: string | null;
    environment?: string | null;
};

const STATIC = ['vite', 'astro', 'docusaurus'];

type Editor = { slug: string; label: string };

type ReadyServer = { name: string; ip: string | null };

export default function ShowProject({
    project,
    server,
    frameworks,
    runs,
    latestRun,
    scaffold,
    editors,
    wizardFrameworks,
    email,
    laravelOptions,
    readyServers,
    backing,
}: {
    project: Project;
    server: Server | null;
    frameworks: Record<string, string>;
    runs: RecentRun[];
    latestRun: ProjectRun | null;
    scaffold: { id: number; status: RunStatus; canRetry: boolean } | null;
    editors: Editor[];
    wizardFrameworks: string[];
    email: string;
    laravelOptions?: NewAppQuestion[] | null;
    readyServers: ReadyServer[];
    backing?: Record<string, BackingServices | null>;
}) {
    const isRunning =
        runs.some((r) => r.status === 'running') ||
        latestRun?.status === 'running';

    const { start, stop } = usePoll(
        1000,
        { only: ['runs', 'latestRun', 'project', 'server'] },
        { autoStart: isRunning },
    );

    useEffect(() => {
        if (isRunning) {
            start();
        } else {
            stop();
        }
    }, [isRunning, start, stop]);

    // Cloud environments: non-local environments configured in the project
    const cloudEnvs = useMemo(
        () =>
            Object.values(project.environments ?? {}).filter((e) => !e.isLocal),
        [project.environments],
    );

    // Primary environment switcher state: 'local' | '<cloud-env-name>'
    const [activeEnv, setActiveEnv] = useState<string>('local');
    const [deployModalOpen, setDeployModalOpen] = useState(false);
    const [addEnvModalOpen, setAddEnvModalOpen] = useState(false);

    // Active cloud environment config when viewing cloud tabs
    const activeCloudEnvName =
        activeEnv === 'local'
            ? (cloudEnvs[0]?.name ?? 'production')
            : activeEnv;

    const activeEnvConfig = useMemo<ProjectEnvironment>(() => {
        if (activeEnv === 'local') {
            return (
                project.environments?.['local'] ?? {
                    name: 'local',
                    isLocal: true,
                    webHost: `${project.name}.${project.effectiveTld || project.localTld || project.globalTld || 'test'}`,
                    serverIp: null,
                    serverName: 'Local Dev Cluster',
                    plex: project.environments?.['local']?.plex ?? [],
                    managed: [],
                }
            );
        }
        return (
            project.environments?.[activeEnv] ?? {
                name: activeEnv,
                isLocal: false,
                webHost: activeEnv === 'production' ? project.webHost : null,
                serverIp: server?.ip ?? null,
                serverName: server?.name ?? null,
                plex: [],
                managed: [],
            }
        );
    }, [activeEnv, project, server]);

    const activeServer = useMemo(() => {
        if (activeEnv === 'local') return null;
        if (activeEnvConfig?.serverName) {
            const found = readyServers.find(
                (s) => s.name === activeEnvConfig.serverName,
            );
            if (found) return found;
        }
        if (activeEnvConfig?.serverIp) {
            const found = readyServers.find(
                (s) => s.ip === activeEnvConfig.serverIp,
            );
            if (found) return found;
            return {
                name: activeEnvConfig.serverName ?? activeEnvConfig.serverIp,
                ip: activeEnvConfig.serverIp,
            };
        }
        if (activeEnv === 'production' && server) {
            return server;
        }
        return null;
    }, [activeEnvConfig, activeEnv, server, readyServers]);

    const activeHost =
        activeEnvConfig?.webHost ??
        (activeEnv === 'production' ? project.webHost : null);

    const activeTerminalRun = useMemo(() => {
        if (!latestRun) return null;
        if (latestRun.status === 'running') return latestRun;
        const runEnv = latestRun.environment?.toLowerCase();
        if (activeEnv === 'local') {
            const isLocal =
                !runEnv ||
                runEnv === 'local' ||
                [
                    'up-project',
                    'down-project',
                    'start-project',
                    'stop-project',
                    'init-project',
                    'new-project',
                ].includes(latestRun.kind ?? '');
            return isLocal ? latestRun : null;
        }
        const isThisCloudEnv =
            runEnv === activeEnv.toLowerCase() ||
            latestRun.label
                .toLowerCase()
                .includes(`(${activeEnv.toLowerCase()})`) ||
            (!latestRun.label.includes('(') &&
                activeEnv.toLowerCase() === 'production' &&
                ['deploy-app', 'link-server', 'configure-host'].includes(
                    latestRun.kind ?? '',
                ));
        return isThisCloudEnv ? latestRun : null;
    }, [latestRun, activeEnv]);

    return (
        <AppLayout title={project.name}>
            <Link
                href={index().url}
                className="mb-3 inline-block text-xs text-soft hover:text-ink"
            >
                ← Projects
            </Link>
            <PageHeader
                title={project.name}
                badge={
                    project.framework ? (
                        <StatusPill tone="muted">
                            {frameworks[project.framework] ?? project.framework}
                        </StatusPill>
                    ) : undefined
                }
                meta={<span>{project.path}</span>}
                actions={
                    <div className="flex items-center gap-2.5">
                        {project.exists && (
                            <EditorMenu project={project} editors={editors} />
                        )}
                        <ProjectOptionsMenu project={project} />
                    </div>
                }
            />

            {!project.exists && scaffold?.status === 'running' ? (
                <div className="grid items-start gap-6 lg:grid-cols-12">
                    <div className="lg:col-span-5">
                        <Card>
                            <div className="flex items-center gap-2.5">
                                <span className="size-2 animate-ping rounded-full bg-brand" />
                                <p className="text-sm font-semibold text-ink">
                                    Creating application…
                                </p>
                            </div>
                            <p className="mt-2 text-xs leading-relaxed text-soft">
                                LaraKube is provisioning your app container and
                                installing dependencies. Live terminal output is
                                streaming on the right.
                            </p>
                        </Card>
                    </div>
                    <div className="lg:col-span-7">
                        {latestRun && <ProjectTerminalCard run={latestRun} />}
                    </div>
                </div>
            ) : !project.exists ? (
                <Card tone="error">
                    <p className="text-sm">
                        {scaffold
                            ? "This app couldn't be created. "
                            : 'This folder no longer exists. Remove the project, or move the folder back.'}
                        {scaffold && (
                            <Link
                                href={showRun(scaffold.id).url}
                                className="font-medium underline"
                            >
                                See what went wrong
                            </Link>
                        )}
                    </p>
                    <div className="mt-3 flex items-center gap-2.5">
                        {scaffold?.canRetry && (
                            <Link
                                href={retry(project.id).url}
                                method="post"
                                as="button"
                                className={buttonClass('primary', 'sm')}
                            >
                                Try again
                            </Link>
                        )}
                        <Link
                            href={destroy(project.id).url}
                            method="delete"
                            as="button"
                            className={buttonClass('secondary', 'sm')}
                        >
                            Remove
                        </Link>
                    </div>
                </Card>
            ) : (
                <div className="space-y-5">
                    {/* Top-Level Environment Switcher Bar */}
                    <EnvironmentSwitchBar
                        activeEnv={activeEnv}
                        onSelectEnv={setActiveEnv}
                        cloudEnvs={cloudEnvs}
                        readyServers={readyServers}
                        onAddEnv={() => setAddEnvModalOpen(true)}
                        runs={runs}
                        project={project}
                        onDeployClick={() => setDeployModalOpen(true)}
                    />

                    {/* Main Layout Grid */}
                    <div className="grid grid-cols-[1fr_360px] items-start gap-5">
                        {/* Main Column (Left): Segregated by Environment */}
                        <div className="flex flex-col gap-5">
                            {activeEnv === 'local' ? (
                                <>
                                    {project.initialized && (
                                        <LocalClusterCard
                                            project={project}
                                            runs={runs}
                                        />
                                    )}

                                    <EnvironmentBackingServicesCard
                                        key={activeEnv}
                                        project={project}
                                        currentEnv={activeEnvConfig}
                                        services={backing?.[activeEnv]}
                                    />
                                </>
                            ) : (
                                <>
                                    <CloudEnvironmentOverviewCard
                                        project={project}
                                        activeEnv={activeEnv}
                                        activeEnvConfig={activeEnvConfig}
                                        activeServer={activeServer}
                                        activeHost={activeHost}
                                        readyServers={readyServers}
                                        runs={runs}
                                        onOpenDeploy={() =>
                                            setDeployModalOpen(true)
                                        }
                                    />

                                    <EnvironmentBackingServicesCard
                                        key={activeEnv}
                                        project={project}
                                        currentEnv={activeEnvConfig}
                                        services={backing?.[activeEnv]}
                                    />
                                </>
                            )}

                            {activeTerminalRun && (
                                <ProjectTerminalCard run={activeTerminalRun} />
                            )}
                        </div>

                        {/* Sidebar Column (Right): Activity, Settings */}
                        <div className="flex flex-col gap-5">
                            <RecentRunsCard runs={runs} activeEnv={activeEnv} />
                            <ProjectSettingsCard project={project} />
                        </div>
                    </div>

                    {/* Deploy Modal Popup */}
                    <DeployDialog
                        open={deployModalOpen}
                        onClose={() => setDeployModalOpen(false)}
                        project={project}
                        server={server}
                        activeEnv={activeCloudEnvName}
                        activeServer={activeServer}
                        activeHost={activeHost}
                        frameworks={frameworks}
                        runs={runs}
                        latestRun={latestRun}
                        wizardFrameworks={wizardFrameworks}
                        email={email}
                        laravelOptions={laravelOptions}
                        readyServers={readyServers}
                    />

                    {/* Add Environment Modal Popup */}
                    <AddEnvironmentDialog
                        open={addEnvModalOpen}
                        onClose={() => setAddEnvModalOpen(false)}
                        project={project}
                        readyServers={readyServers}
                        onCreated={(newEnv) => setActiveEnv(newEnv)}
                    />
                </div>
            )}
        </AppLayout>
    );
}

/** Top navigation bar for toggling between Local Dev and Cloud Environments */
function EnvironmentSwitchBar({
    activeEnv,
    onSelectEnv,
    cloudEnvs,
    onAddEnv,
    runs,
    project,
    onDeployClick,
}: {
    activeEnv: string;
    onSelectEnv: (env: string) => void;
    cloudEnvs: ProjectEnvironment[];
    readyServers: ReadyServer[];
    onAddEnv: () => void;
    runs: RecentRun[];
    project: Project;
    onDeployClick: () => void;
}) {
    const isLocalActive = activeEnv === 'local';
    const isLocalRunning = runs.some(
        (r) =>
            [
                'up-project',
                'down-project',
                'start-project',
                'stop-project',
            ].includes(r.kind ?? '') && r.status === 'running',
    );

    const effectiveTld =
        project.effectiveTld || project.localTld || project.globalTld || 'test';
    const localDomain = `${project.name}.${effectiveTld}`;

    // Target cloud environments to render (defaults to production if none configured)
    const envsToRender =
        cloudEnvs.length > 0
            ? cloudEnvs
            : [
                  {
                      name: 'production',
                      isLocal: false,
                      webHost: project.webHost,
                      serverIp: project.serverIp,
                      serverName: null,
                  },
              ];

    const activeDeploy = runs.find(
        (r) =>
            r.kind === 'deploy-app' &&
            r.status === 'running' &&
            (r.label.includes(`(${activeEnv})`) ||
                (!r.label.includes('(') && activeEnv === 'production')),
    );

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-paper/60 p-1.5 shadow-2xs backdrop-blur-xs">
            {/* Tabs List */}
            <div className="flex flex-wrap items-center gap-1.5">
                {/* Local Dev Tab */}
                <button
                    type="button"
                    onClick={() => onSelectEnv('local')}
                    className={cn(
                        'flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all',
                        isLocalActive
                            ? 'bg-surface text-ink shadow-2xs ring-1 ring-line'
                            : 'text-soft hover:bg-paper hover:text-ink',
                    )}
                >
                    <Laptop className="size-3.5 text-brand" />
                    <span>Local Dev</span>
                    {isLocalRunning && (
                        <span className="size-2 animate-ping rounded-full bg-brand" />
                    )}
                </button>

                <div className="mx-1 h-5 w-px shrink-0 bg-line" />

                {/* Cloud Environment Tabs */}
                {envsToRender.map((env) => {
                    const isSelected = activeEnv === env.name;
                    const isRunning = runs.some(
                        (r) =>
                            r.kind === 'deploy-app' &&
                            r.status === 'running' &&
                            (r.label.includes(`(${env.name})`) ||
                                (!r.label.includes('(') &&
                                    env.name === 'production')),
                    );
                    return (
                        <button
                            key={env.name}
                            type="button"
                            onClick={() => onSelectEnv(env.name)}
                            className={cn(
                                'flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all',
                                isSelected
                                    ? 'bg-surface text-ink shadow-2xs ring-1 ring-line'
                                    : 'text-soft hover:bg-paper hover:text-ink',
                            )}
                        >
                            <Cloud className="size-3.5 text-sky-500" />
                            <span className="uppercase">{env.name}</span>
                            {env.serverName && (
                                <span className="rounded bg-line/60 px-1 text-[10px] font-normal text-soft">
                                    {env.serverName}
                                </span>
                            )}
                            {isRunning && (
                                <span className="size-2 animate-ping rounded-full bg-brand" />
                            )}
                        </button>
                    );
                })}

                {/* Add Environment Button */}
                <button
                    type="button"
                    onClick={onAddEnv}
                    className="flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-medium text-soft transition-colors hover:bg-paper hover:text-ink"
                    title="Add a new cloud environment overlay"
                >
                    <Plus className="size-3.5" />
                    <span>Add</span>
                </button>
            </div>

            {/* Contextual Action on the Right */}
            <div className="flex items-center gap-2 pr-1">
                {isLocalActive ? (
                    <Link
                        href={open().url}
                        method="post"
                        data={{ url: `https://${localDomain}` }}
                        as="button"
                        className={cn(
                            buttonClass('secondary', 'sm'),
                            'gap-1.5',
                        )}
                        title="Open local application in browser"
                    >
                        <span>Open local site</span>
                        <ExternalLink className="size-3" />
                    </Link>
                ) : (
                    <div className="flex items-center gap-2">
                        {activeDeploy && (
                            <StatusPill tone="busy">
                                {`Deploying (${activeEnv})`}
                            </StatusPill>
                        )}
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={onDeployClick}
                            className="gap-1.5 shadow-2xs"
                        >
                            <Play className="size-3 fill-current" />
                            <span>Deploy to {activeEnv.toUpperCase()}</span>
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}

/** Focused dashboard card for a cloud environment (e.g. Staging, Production) */
function CloudEnvironmentOverviewCard({
    project,
    activeEnv,
    activeServer,
    activeHost,
    readyServers,
    runs,
    onOpenDeploy,
}: {
    project: Project;
    activeEnv: string;
    activeEnvConfig?: ProjectEnvironment;
    activeServer: ReadyServer | Server | null;
    activeHost: string | null;
    readyServers: ReadyServer[];
    runs: RecentRun[];
    onOpenDeploy: () => void;
}) {
    const [showSwitchServer, setShowSwitchServer] = useState(false);
    const [showEditHost, setShowEditHost] = useState(false);

    const activeDeploy = runs.find(
        (run) =>
            run.kind === 'deploy-app' &&
            run.status === 'running' &&
            (run.label.includes(`(${activeEnv})`) ||
                (!run.label.includes('(') && activeEnv === 'production')),
    );

    const hasSucceededDeploy = runs.some(
        (run) =>
            run.kind === 'deploy-app' &&
            run.status === 'succeeded' &&
            (run.label.includes(`(${activeEnv})`) ||
                (!run.label.includes('(') && activeEnv === 'production')),
    );

    const headerPill = activeDeploy ? (
        <StatusPill tone="busy">{`Deploying (${activeEnv})`}</StatusPill>
    ) : hasSucceededDeploy ? (
        <StatusPill tone="ok">
            {activeServer?.name
                ? `Deployed · ${activeServer.name}`
                : `Deployed (${activeEnv})`}
        </StatusPill>
    ) : activeServer ? (
        <StatusPill tone="muted">{`Server: ${activeServer.name}`}</StatusPill>
    ) : (
        <StatusPill tone="muted">Not deployed</StatusPill>
    );

    return (
        <Card
            label={`Cloud Environment · ${activeEnv.toUpperCase()}`}
            action={headerPill}
        >
            <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    {/* Server Details */}
                    <div className="rounded-xl border border-line bg-paper/60 p-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium tracking-wider text-soft uppercase">
                                Target Server
                            </span>
                            {readyServers.length > 1 && activeServer && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        setShowSwitchServer(!showSwitchServer)
                                    }
                                    className="text-[11px] text-brand hover:underline"
                                >
                                    {showSwitchServer ? 'Cancel' : 'Change'}
                                </button>
                            )}
                        </div>

                        {activeServer ? (
                            <div className="mt-2 flex items-center justify-between">
                                <div>
                                    <Link
                                        href={showServer(activeServer.name).url}
                                        className="flex items-center gap-1.5 text-xs font-semibold text-ink hover:underline"
                                    >
                                        <ServerIcon className="size-3.5 text-brand" />
                                        <span>{activeServer.name}</span>
                                    </Link>
                                    <p className="mt-0.5 font-mono text-[11px] text-soft">
                                        {activeServer.ip ?? 'No public IP'}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-2 text-xs text-soft">
                                <span>No server linked yet. </span>
                                <button
                                    type="button"
                                    onClick={onOpenDeploy}
                                    className="font-medium text-brand hover:underline"
                                >
                                    Link server
                                </button>
                            </div>
                        )}

                        {showSwitchServer && (
                            <div className="mt-2.5 rounded-lg border border-line bg-surface p-2">
                                <p className="mb-1.5 text-[11px] font-medium text-ink">
                                    Rebind {activeEnv} to:
                                </p>
                                <LinkServerForm
                                    project={project}
                                    servers={readyServers}
                                    environment={activeEnv}
                                    onSuccess={() => setShowSwitchServer(false)}
                                />
                            </div>
                        )}
                    </div>

                    {/* Public Address Details */}
                    <div className="rounded-xl border border-line bg-paper/60 p-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium tracking-wider text-soft uppercase">
                                Public Address
                            </span>
                            {activeHost && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        setShowEditHost(!showEditHost)
                                    }
                                    className="text-[11px] text-soft hover:text-ink"
                                >
                                    {showEditHost ? 'Cancel' : 'Edit'}
                                </button>
                            )}
                        </div>

                        {activeHost ? (
                            <div className="mt-2 flex items-center justify-between">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="truncate font-mono text-xs font-semibold text-ink">
                                            https://{activeHost}
                                        </span>
                                        <Link
                                            href={open().url}
                                            method="post"
                                            data={{
                                                url: `https://${activeHost}`,
                                            }}
                                            as="button"
                                            className="shrink-0 text-brand hover:underline"
                                            title="Visit public URL"
                                        >
                                            <ExternalLink className="size-3" />
                                        </Link>
                                    </div>
                                    <p className="mt-0.5 text-[11px] text-soft">
                                        Traefik Ingress SSL
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-2 text-xs text-soft">
                                <span>No domain configured. </span>
                                <button
                                    type="button"
                                    onClick={() => setShowEditHost(true)}
                                    className="font-medium text-brand hover:underline"
                                >
                                    Configure domain
                                </button>
                            </div>
                        )}

                        {showEditHost && (
                            <div className="mt-2.5 rounded-lg border border-line bg-surface p-2">
                                <HostForm
                                    project={project}
                                    serverIp={activeServer?.ip ?? null}
                                    disabled={!project.initialized}
                                    environment={activeEnv}
                                    currentHost={activeHost}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Deploy Action Banner */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                    <p className="text-xs text-soft">
                        {activeDeploy
                            ? 'Building and shipping app containers to cluster…'
                            : hasSucceededDeploy
                              ? `Last deployment to ${activeServer?.name ?? 'server'} succeeded.`
                              : activeServer
                                ? `Ready to deploy to ${activeServer.name}. Click Deploy to ship.`
                                : 'Configure server and host to ship this environment.'}
                    </p>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={onOpenDeploy}
                        className="gap-1.5"
                    >
                        <Play className="size-3.5 fill-current" />
                        <span>
                            {hasSucceededDeploy
                                ? `Deploy ${activeEnv.toUpperCase()} again`
                                : `Deploy to ${activeEnv.toUpperCase()}`}
                        </span>
                    </Button>
                </div>
            </div>
        </Card>
    );
}

const MODE_LABEL: Record<BackingService['mode'], string> = {
    commons: 'Plex Commons',
    managed: 'Cloud managed',
    pod: 'Own pod',
    file: 'Local file',
    none: 'Not used',
};

/** Where each backing service runs and how the app reaches it, as the CLI reports it. */
function EnvironmentBackingServicesCard({
    project,
    currentEnv,
    services,
}: {
    project: Project;
    currentEnv: ProjectEnvironment;
    /** undefined while loading, null when the CLI could not say. */
    services?: BackingServices | null;
}) {
    const hasPlex = services?.commons ?? (currentEnv.plex?.length ?? 0) > 0;
    const [revealed, setRevealed] = useState<BackingServices | null>(null);
    const [revealing, setRevealing] = useState(false);
    const shown = revealed ?? services;

    function reveal() {
        setRevealing(true);
        fetch(
            `/projects/${project.id}/services?environment=${encodeURIComponent(currentEnv.name)}`,
            { headers: { Accept: 'application/json' } },
        )
            .then((res) => (res.ok ? res.json() : null))
            .then((data: BackingServices | null) => setRevealed(data))
            .catch(() => setRevealed(null))
            .finally(() => setRevealing(false));
    }

    const hasSecrets = shown?.services.some((service) =>
        service.details.some((row) => row.secret),
    );

    return (
        <Card
            label={`Backing Services · ${currentEnv.name.toUpperCase()}`}
            action={
                hasPlex ? (
                    <span className="inline-flex items-center gap-1 rounded bg-tools-tint px-2 py-0.5 font-mono text-[11px] font-medium text-tools ring-1 ring-tools/20">
                        🟣 Plex Commons Active
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-line/60 px-2 py-0.5 font-mono text-[11px] text-soft">
                        Standalone Services
                    </span>
                )
            }
        >
            <div className="space-y-4">
                {shown === undefined ? (
                    <div className="h-32 animate-pulse rounded-xl bg-paper" />
                ) : shown === null ? (
                    <p className="text-xs text-warn">
                        This LaraKube CLI can&apos;t describe the services yet.
                        Update it from Setup.
                    </p>
                ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {shown.services.map((service) => (
                            <div
                                key={service.kind}
                                className="rounded-xl border border-line bg-paper/60 p-3"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <span className="text-[11px] font-medium tracking-wider text-soft uppercase">
                                            {service.label}
                                        </span>
                                        <div className="mt-1 text-xs font-semibold text-ink">
                                            {service.name ?? 'None'}
                                        </div>
                                    </div>
                                    <span
                                        className={cn(
                                            'shrink-0 rounded px-2 py-0.5 font-mono text-[11px] ring-1 ring-inset',
                                            service.mode === 'commons'
                                                ? 'bg-tools-tint text-tools ring-tools/20'
                                                : 'bg-paper text-soft ring-line',
                                        )}
                                    >
                                        {MODE_LABEL[service.mode]}
                                    </span>
                                </div>
                                {service.details.length > 0 && (
                                    <dl className="mt-3 space-y-1 text-[11px]">
                                        {service.details.map((row) => (
                                            <div
                                                key={row.label}
                                                className="flex justify-between gap-3"
                                            >
                                                <dt className="shrink-0 text-soft">
                                                    {row.label}
                                                </dt>
                                                <dd className="min-w-0 truncate font-mono text-ink">
                                                    {row.value ?? '••••••••'}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {hasSecrets && (
                    <button
                        type="button"
                        role="switch"
                        aria-checked={revealed !== null}
                        onClick={() =>
                            revealed ? setRevealed(null) : reveal()
                        }
                        disabled={revealing}
                        className={cn(
                            buttonClass('secondary', 'sm'),
                            'h-7 gap-1.5 px-2.5 text-xs',
                        )}
                    >
                        {revealed ? (
                            <EyeOff className="size-3.5" />
                        ) : (
                            <Eye className="size-3.5" />
                        )}
                        {revealing
                            ? 'Revealing…'
                            : revealed
                              ? 'Hide passwords and keys'
                              : 'Show passwords and keys'}
                    </button>
                )}

                {/* Plex Commons Status & Action Banner */}
                <div className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2.5">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-tools-tint text-base">
                            🟣
                        </span>
                        <div>
                            <p className="text-xs font-semibold text-ink">
                                {hasPlex
                                    ? `Connected to Plex Commons (${currentEnv.name})`
                                    : `Plex Commons (${currentEnv.name})`}
                            </p>
                            <p className="text-[11px] text-soft">
                                {hasPlex
                                    ? 'Shares the cluster-wide database, cache and storage to conserve CPU and RAM.'
                                    : 'Connect this environment to Plex Commons to share cluster-wide services.'}
                            </p>
                        </div>
                    </div>

                    <div className="shrink-0">
                        {hasPlex ? (
                            <Link
                                href={leavePlex(project.id).url}
                                method="post"
                                data={{ environment: currentEnv.name }}
                                as="button"
                                className={cn(
                                    buttonClass('danger', 'sm'),
                                    'h-7 px-2.5 text-xs',
                                )}
                                title={`Disconnect ${currentEnv.name} from Plex Commons`}
                            >
                                Disconnect Commons
                            </Link>
                        ) : (
                            <Link
                                href={joinPlex(project.id).url}
                                method="post"
                                data={{ environment: currentEnv.name }}
                                as="button"
                                className={cn(
                                    buttonClass('tools', 'sm'),
                                    'h-7 px-2.5 text-xs',
                                )}
                                title={`Join ${currentEnv.name} to Plex Commons`}
                            >
                                Join Commons
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </Card>
    );
}

/** Deployment wizard presented as a clean pop-up modal dialog */
function DeployDialog({
    open,
    onClose,
    project,
    server: _server,
    activeEnv,
    activeServer,
    activeHost,
    frameworks,
    runs,
    latestRun,
    wizardFrameworks,
    email,
    laravelOptions,
    readyServers,
}: {
    open: boolean;
    onClose: () => void;
    project: Project;
    server: Server | null;
    activeEnv: string;
    activeServer: ReadyServer | Server | null;
    activeHost: string | null;
    frameworks: Record<string, string>;
    runs: RecentRun[];
    latestRun: ProjectRun | null;
    wizardFrameworks: string[];
    email: string;
    laravelOptions?: NewAppQuestion[] | null;
    readyServers: ReadyServer[];
}) {
    const [showSwitchServer, setShowSwitchServer] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        if (open) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose]);

    if (!open) return null;

    const ready =
        project.initialized &&
        project.deployable &&
        activeServer !== null &&
        Boolean(activeHost);

    const activeDeploy = runs.find(
        (run) =>
            run.kind === 'deploy-app' &&
            run.status === 'running' &&
            (run.label.includes(`(${activeEnv})`) ||
                (!run.label.includes('(') && activeEnv === 'production')),
    );

    const hasSucceededDeploy = runs.some(
        (run) =>
            run.kind === 'deploy-app' &&
            run.status === 'succeeded' &&
            (run.label.includes(`(${activeEnv})`) ||
                (!run.label.includes('(') && activeEnv === 'production')),
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-6 backdrop-blur-xs">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="deploy-dialog-title"
                className="custom-scrollbar max-h-[90vh] w-full max-w-[620px] overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl ring-1 ring-line"
            >
                <div className="mb-4 flex items-center justify-between border-b border-line pb-4">
                    <div>
                        <h3
                            id="deploy-dialog-title"
                            className="text-base font-semibold text-ink"
                        >
                            Deploy to {activeEnv.toUpperCase()}
                        </h3>
                        <p className="mt-0.5 text-xs text-soft">
                            Configure server, public address, and ship your
                            container image.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-soft transition-colors hover:bg-paper hover:text-ink"
                        title="Close dialog"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                <div className="space-y-0">
                    <Step
                        number={1}
                        title="Set up for LaraKube"
                        done={project.initialized}
                    >
                        {project.initialized ? (
                            <p className="text-xs text-soft">
                                {project.deployable
                                    ? 'Ready.'
                                    : `LaraKube can't deploy ${project.framework ?? 'this framework'} yet.`}
                            </p>
                        ) : (
                            <InitForm
                                project={project}
                                frameworks={frameworks}
                                wizardFrameworks={wizardFrameworks}
                                email={email}
                                laravelOptions={laravelOptions}
                            />
                        )}
                        {latestRun?.kind === 'init-project' && (
                            <p
                                className={cn(
                                    'mt-2 text-xs',
                                    latestRun.status === 'succeeded'
                                        ? 'font-medium text-ok'
                                        : latestRun.status === 'running'
                                          ? 'animate-pulse font-medium text-brand'
                                          : 'text-accent',
                                )}
                            >
                                {latestRun.status === 'succeeded' &&
                                    '✓ Framework initialized.'}
                                {latestRun.status === 'running' &&
                                    'Setting up for LaraKube…'}
                                {latestRun.status === 'failed' &&
                                    'Failed to set up project.'}
                            </p>
                        )}
                    </Step>

                    <Step
                        number={2}
                        title={`Server (${activeEnv.toUpperCase()})`}
                        done={activeServer !== null}
                    >
                        {activeServer ? (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs text-soft">
                                        <Link
                                            href={
                                                showServer(activeServer.name)
                                                    .url
                                            }
                                            className="font-medium text-ink hover:underline"
                                        >
                                            {activeServer.name}
                                        </Link>{' '}
                                        · {activeServer.ip}
                                    </p>
                                    {readyServers.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setShowSwitchServer(
                                                    !showSwitchServer,
                                                )
                                            }
                                            className="text-[11px] text-brand hover:underline"
                                        >
                                            {showSwitchServer
                                                ? 'Cancel'
                                                : 'Change server'}
                                        </button>
                                    )}
                                </div>
                                {showSwitchServer && (
                                    <div className="rounded-lg border border-line bg-paper p-2.5">
                                        <p className="mb-2 text-xs font-medium text-ink">
                                            Rebind {activeEnv} to a different
                                            server:
                                        </p>
                                        <LinkServerForm
                                            project={project}
                                            servers={readyServers}
                                            environment={activeEnv}
                                            onSuccess={() =>
                                                setShowSwitchServer(false)
                                            }
                                        />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {readyServers.length > 0 && (
                                    <LinkServerForm
                                        project={project}
                                        servers={readyServers}
                                        environment={activeEnv}
                                    />
                                )}
                                <Link
                                    href={
                                        createServer({
                                            query: {
                                                project: project.id,
                                            },
                                        }).url
                                    }
                                    className={buttonClass(
                                        readyServers.length > 0
                                            ? 'ghost'
                                            : 'secondary',
                                        'sm',
                                        !project.initialized
                                            ? 'pointer-events-none opacity-45'
                                            : undefined,
                                    )}
                                >
                                    {readyServers.length > 0
                                        ? 'Or create a new server'
                                        : 'Create a server for this project'}
                                </Link>
                            </div>
                        )}
                        {latestRun?.kind === 'link-server' && (
                            <p
                                className={cn(
                                    'mt-2 text-xs',
                                    latestRun.status === 'succeeded'
                                        ? 'font-medium text-ok'
                                        : latestRun.status === 'running'
                                          ? 'animate-pulse font-medium text-brand'
                                          : 'text-accent',
                                )}
                            >
                                {latestRun.status === 'succeeded' &&
                                    '✓ Server linked.'}
                                {latestRun.status === 'running' &&
                                    'Linking to server…'}
                                {latestRun.status === 'failed' &&
                                    'Failed to link server.'}
                            </p>
                        )}
                    </Step>

                    <Step
                        number={3}
                        title={`Address (${activeEnv.toUpperCase()})`}
                        done={Boolean(activeHost)}
                    >
                        <HostForm
                            project={project}
                            serverIp={activeServer?.ip ?? null}
                            disabled={!project.initialized}
                            environment={activeEnv}
                            currentHost={activeHost}
                        />
                        {latestRun?.kind === 'configure-host' && (
                            <p
                                className={cn(
                                    'mt-2 text-xs',
                                    latestRun.status === 'succeeded'
                                        ? 'font-medium text-ok'
                                        : latestRun.status === 'running'
                                          ? 'animate-pulse font-medium text-brand'
                                          : 'text-accent',
                                )}
                            >
                                {latestRun.status === 'succeeded' &&
                                    `✓ Hosts saved for ${activeEnv}.`}
                                {latestRun.status === 'running' &&
                                    'Configuring hosts…'}
                                {latestRun.status === 'failed' &&
                                    'Failed to save hosts.'}
                            </p>
                        )}
                    </Step>

                    <Step
                        number={4}
                        title={`Deploy (${activeEnv.toUpperCase()})`}
                        done={hasSucceededDeploy}
                        last
                    >
                        <Form action={deploy(project.id)}>
                            {({ processing }) => (
                                <div className="space-y-2">
                                    <input
                                        type="hidden"
                                        name="environment"
                                        value={activeEnv}
                                    />
                                    <div className="flex items-center gap-3">
                                        <Button
                                            type="submit"
                                            disabled={
                                                !ready ||
                                                processing ||
                                                Boolean(activeDeploy)
                                            }
                                        >
                                            <Play className="size-3.5 fill-current" />
                                            <span>
                                                {processing
                                                    ? 'Starting…'
                                                    : activeDeploy
                                                      ? 'Deploying…'
                                                      : hasSucceededDeploy
                                                        ? `Deploy ${activeEnv} again`
                                                        : `Deploy to ${activeEnv}`}
                                            </span>
                                        </Button>
                                        {activeDeploy && (
                                            <Link
                                                href={
                                                    showRun(activeDeploy.id).url
                                                }
                                                className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
                                            >
                                                <span className="size-2 animate-ping rounded-full bg-brand" />
                                                <span>View live progress</span>
                                                <ArrowRight className="size-3" />
                                            </Link>
                                        )}
                                    </div>
                                    <p className="text-xs text-soft">
                                        {project.framework &&
                                        STATIC.includes(project.framework)
                                            ? `Builds the site on this computer and publishes it to ${activeServer?.name ?? 'the server'}. Needs Plex Commons on the server.`
                                            : `Builds the app image on this computer (needs Docker or Podman) and ships it to ${activeServer?.name ?? 'the server'} (${activeEnv}).`}
                                    </p>
                                </div>
                            )}
                        </Form>
                    </Step>
                </div>
            </div>
        </div>
    );
}

/** Modal dialog for adding a new cloud environment */
function AddEnvironmentDialog({
    open,
    onClose,
    project,
    readyServers,
    onCreated: _onCreated,
}: {
    open: boolean;
    onClose: () => void;
    project: Project;
    readyServers: ReadyServer[];
    onCreated?: (envName: string) => void;
}) {
    const [name, setName] = useState('');
    const [server, setServer] = useState(readyServers[0]?.name ?? '');

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        if (open) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-6 backdrop-blur-xs">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-env-dialog-title"
                className="w-full max-w-[480px] rounded-2xl bg-surface p-6 shadow-2xl ring-1 ring-line"
            >
                <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
                    <div>
                        <h3
                            id="add-env-dialog-title"
                            className="text-base font-semibold text-ink"
                        >
                            Add Cloud Environment
                        </h3>
                        <p className="mt-0.5 text-xs text-soft">
                            Create an environment overlay and bind it to a
                            server.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-soft transition-colors hover:bg-paper hover:text-ink"
                        title="Close dialog"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                <Form action={link(project.id)} className="space-y-4">
                    {({ errors, processing }) => (
                        <>
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-ink">
                                    Environment Name
                                </label>
                                <input
                                    name="environment"
                                    value={name}
                                    onChange={(e) =>
                                        setName(
                                            e.target.value
                                                .toLowerCase()
                                                .replace(/[^a-z0-9_-]/g, ''),
                                        )
                                    }
                                    placeholder="staging, qa, uat"
                                    spellCheck={false}
                                    className="w-full rounded-lg border-0 bg-paper px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                />
                                {errors.environment && (
                                    <p className="mt-1 text-xs text-accent">
                                        {errors.environment}
                                    </p>
                                )}
                                <p className="mt-1 text-[11px] text-soft">
                                    Lowercase letters, numbers, hyphens, and
                                    underscores only.
                                </p>
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-ink">
                                    Target Server
                                </label>
                                <select
                                    name="server"
                                    value={server}
                                    onChange={(e) => setServer(e.target.value)}
                                    className="w-full rounded-lg border-0 bg-paper px-3 py-2 text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                >
                                    {readyServers.map((s) => (
                                        <option key={s.name} value={s.name}>
                                            {s.name} {s.ip ? `· ${s.ip}` : ''}
                                        </option>
                                    ))}
                                </select>
                                {errors.server && (
                                    <p className="mt-1 text-xs text-accent">
                                        {errors.server}
                                    </p>
                                )}
                            </div>

                            <div className="flex items-center justify-end gap-2.5 border-t border-line pt-3">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={onClose}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    size="sm"
                                    disabled={
                                        name.trim() === '' ||
                                        processing ||
                                        readyServers.length === 0
                                    }
                                >
                                    {processing
                                        ? 'Creating…'
                                        : 'Create Environment'}
                                </Button>
                            </div>
                        </>
                    )}
                </Form>
            </div>
        </div>
    );
}

function Step({
    number,
    title,
    done,
    last = false,
    children,
}: {
    number: number;
    title: string;
    done: boolean;
    last?: boolean;
    children: ReactNode;
}) {
    return (
        <div
            className={
                last
                    ? 'flex gap-3.5 pt-3'
                    : 'flex gap-3.5 border-b border-line py-3'
            }
        >
            <span
                className={
                    done
                        ? 'flex size-6 shrink-0 items-center justify-center rounded-full bg-ok text-xs font-semibold text-white'
                        : 'flex size-6 shrink-0 items-center justify-center rounded-full bg-badge text-xs font-semibold text-soft'
                }
            >
                {done ? '✓' : number}
            </span>
            <div className="min-w-0 flex-1">
                <p className="mb-1.5 text-sm font-medium">{title}</p>
                {children}
            </div>
        </div>
    );
}

function InitForm({
    project,
    frameworks,
    wizardFrameworks,
    email,
    laravelOptions,
}: {
    project: Project;
    frameworks: Record<string, string>;
    wizardFrameworks: string[];
    email: string;
    laravelOptions?: NewAppQuestion[] | null;
}) {
    const form = useForm<{
        framework: string;
        email: string;
        laravel: NewAppAnswers;
    }>({
        framework: project.detectedFramework ?? 'laravel',
        email,
        laravel: {},
    });
    const { setData } = form;
    const needsEmail = wizardFrameworks.includes(form.data.framework);
    const isLaravel = form.data.framework === 'laravel';
    const questions = useMemo(
        () => laravelOptions?.filter((question) => question.key !== 'frontend'),
        [laravelOptions],
    );
    const errors = form.errors as Record<string, string>;

    useEffect(() => {
        if (isLaravel && laravelOptions === undefined) {
            router.reload({ only: ['laravelOptions'] });
        }
    }, [isLaravel, laravelOptions]);

    useEffect(() => {
        if (questions) {
            setData('laravel', reconcile(questions, defaultAnswers(questions)));
        }
    }, [questions, setData]);

    function submit(event: FormEvent) {
        event.preventDefault();
        form.post(init(project.id).url);
    }

    return (
        <form onSubmit={submit} className="space-y-3">
            <div className="flex items-center gap-2.5">
                <select
                    value={form.data.framework}
                    onChange={(event) =>
                        setData('framework', event.target.value)
                    }
                    className="rounded-lg border-0 bg-surface px-3 py-1.5 text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                >
                    {Object.entries(frameworks).map(([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                            {value === project.detectedFramework
                                ? ' (detected)'
                                : ''}
                        </option>
                    ))}
                </select>
                <Button
                    type="submit"
                    size="sm"
                    disabled={
                        form.processing ||
                        (needsEmail && form.data.email.trim() === '') ||
                        (isLaravel && !laravelOptions)
                    }
                >
                    {form.processing ? 'Starting…' : 'Set up'}
                </Button>
            </div>
            {errors.framework && (
                <p className="text-xs text-accent">{errors.framework}</p>
            )}
            {needsEmail && (
                <label className="block max-w-sm">
                    <span className="mb-1 block text-xs font-medium text-soft">
                        Your email
                    </span>
                    <input
                        type="email"
                        value={form.data.email}
                        onChange={(event) =>
                            setData('email', event.target.value)
                        }
                        placeholder="you@example.com"
                        spellCheck={false}
                        className="w-full rounded-lg border-0 px-3 py-1.5 text-[13px] ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-servers"
                    />
                    <span
                        className={cn(
                            'mt-1 block text-xs',
                            errors.email ? 'text-accent' : 'text-soft',
                        )}
                    >
                        {errors.email ??
                            "For your site's SSL certificate. It needs a real mail domain."}
                    </span>
                </label>
            )}
            {isLaravel &&
                (questions ? (
                    <div className="space-y-3">
                        <FrameworkFields
                            fields={questions}
                            errorPrefix="laravel"
                            answers={form.data.laravel}
                            errors={errors}
                            onChange={(answers) => setData('laravel', answers)}
                        />
                    </div>
                ) : laravelOptions === null ? (
                    <p className="text-xs text-warn">
                        This LaraKube CLI is too old to set up Laravel apps from
                        here. Update it from Setup.
                    </p>
                ) : (
                    <div className="h-10 animate-pulse rounded-lg bg-paper" />
                ))}
        </form>
    );
}

/** Binds the project's cloud environment to one of the user's ready servers. */
function LinkServerForm({
    project,
    servers,
    environment = 'production',
    onSuccess: _onSuccess,
}: {
    project: Project;
    servers: ReadyServer[];
    environment?: string;
    onSuccess?: () => void;
}) {
    const [server, setServer] = useState(servers[0]?.name ?? '');

    return (
        <Form action={link(project.id)} className="space-y-1.5">
            {({ errors, processing }) => (
                <>
                    <input
                        type="hidden"
                        name="environment"
                        value={environment}
                    />
                    <div className="flex items-center gap-2.5">
                        <select
                            name="server"
                            value={server}
                            onChange={(event) => setServer(event.target.value)}
                            disabled={!project.initialized}
                            className="rounded-lg border-0 bg-surface px-3 py-1.5 text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers disabled:opacity-45"
                        >
                            {servers.map((candidate) => (
                                <option
                                    key={candidate.name}
                                    value={candidate.name}
                                >
                                    {candidate.name}
                                    {candidate.ip ? ` · ${candidate.ip}` : ''}
                                </option>
                            ))}
                        </select>
                        <Button
                            type="submit"
                            size="sm"
                            disabled={
                                !project.initialized ||
                                processing ||
                                servers.length === 0
                            }
                        >
                            {processing ? 'Linking…' : 'Link'}
                        </Button>
                    </div>
                    {errors.server && (
                        <p className="text-xs text-accent">{errors.server}</p>
                    )}
                </>
            )}
        </Form>
    );
}

function HostForm({
    project,
    serverIp,
    disabled,
    environment = 'production',
    currentHost,
}: {
    project: Project;
    serverIp: string | null;
    disabled: boolean;
    environment?: string;
    currentHost?: string | null;
}) {
    const [value, setValue] = useState(currentHost ?? project.webHost ?? '');

    useEffect(() => {
        setValue(currentHost ?? '');
    }, [currentHost]);

    return (
        <Form action={setHost(project.id)} className="space-y-1.5">
            {({ errors, processing }) => (
                <>
                    <input
                        type="hidden"
                        name="environment"
                        value={environment}
                    />
                    <div className="flex items-center gap-2.5">
                        <input
                            name="host"
                            value={value}
                            onChange={(event) =>
                                setValue(
                                    event.target.value.trim().toLowerCase(),
                                )
                            }
                            placeholder={
                                environment === 'production'
                                    ? 'app.example.com'
                                    : `${environment}.example.com`
                            }
                            disabled={disabled}
                            spellCheck={false}
                            className="w-72 rounded-lg border-0 px-3 py-1.5 font-mono text-[13px] ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-servers disabled:opacity-45"
                        />
                        <Button
                            type="submit"
                            variant="secondary"
                            size="sm"
                            disabled={
                                disabled ||
                                processing ||
                                value === '' ||
                                value === (currentHost ?? '')
                            }
                        >
                            {processing ? 'Saving…' : 'Save'}
                        </Button>
                    </div>
                    <p
                        className={
                            errors.host
                                ? 'text-xs text-accent'
                                : 'text-xs text-soft'
                        }
                    >
                        {errors.host ??
                            `Point this name's DNS at ${serverIp ?? 'your server'} (or connect a domain on the server page).`}
                    </p>
                </>
            )}
        </Form>
    );
}

/** Opens the project folder in a code editor found on this machine. */
function EditorMenu({
    project,
    editors,
}: {
    project: Project;
    editors: Editor[];
}) {
    const { errors } = usePage().props as { errors: Record<string, string> };

    if (editors.length === 0) {
        return null;
    }

    const link = (editor: Editor, className: string, label: string) => (
        <Link
            key={editor.slug}
            href={openEditor(project.id).url}
            method="post"
            data={{ editor: editor.slug }}
            as="button"
            preserveScroll
            className={className}
        >
            {label}
        </Link>
    );

    return (
        <div className="relative">
            {editors.length === 1 ? (
                link(
                    editors[0],
                    buttonClass('secondary'),
                    `Open in ${editors[0].label}`,
                )
            ) : (
                <details className="group">
                    <summary
                        className={cn(
                            buttonClass('secondary'),
                            'cursor-pointer list-none',
                        )}
                    >
                        Open in editor ▾
                    </summary>
                    <div className="absolute right-0 z-10 mt-1.5 w-44 rounded-xl bg-surface p-1 shadow-lg ring-1 ring-line">
                        {editors.map((editor) =>
                            link(
                                editor,
                                'block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-paper',
                                editor.label,
                            ),
                        )}
                    </div>
                </details>
            )}
            {errors.editor && (
                <p className="absolute right-0 mt-1.5 w-56 text-right text-xs text-accent">
                    {errors.editor}
                </p>
            )}
        </div>
    );
}

function ProjectOptionsMenu({ project }: { project: Project }) {
    return (
        <details className="group relative">
            <summary
                className={cn(
                    buttonClass('secondary'),
                    'cursor-pointer list-none px-2.5',
                )}
                title="More options"
            >
                <MoreHorizontal className="size-4" />
            </summary>
            <div className="absolute right-0 z-20 mt-1.5 w-56 rounded-xl bg-surface p-1 shadow-lg ring-1 ring-line">
                <Link
                    href={destroy(project.id).url}
                    method="delete"
                    as="button"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-accent transition-colors hover:bg-paper"
                >
                    <Trash2 className="size-3.5" />
                    <span>Remove from Desktop</span>
                </Link>
            </div>
        </details>
    );
}

function LocalClusterCard({
    project,
    runs,
}: {
    project: Project;
    runs: RecentRun[];
}) {
    const activeLifecycle = runs.find(
        (run) =>
            [
                'up-project',
                'down-project',
                'start-project',
                'stop-project',
            ].includes(run.kind ?? '') && run.status === 'running',
    );
    const effectiveTld =
        project.effectiveTld || project.localTld || project.globalTld || 'test';
    const domain = `${project.name}.${effectiveTld}`;

    return (
        <Card label="Local Development">
            <div className="space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium">
                                https://{domain}
                            </span>
                            <Link
                                href={open().url}
                                method="post"
                                data={{ url: `https://${domain}` }}
                                as="button"
                                className="text-xs text-brand hover:underline"
                            >
                                Open ↗
                            </Link>
                        </div>
                        <p className="text-xs text-soft">
                            Local cluster address (Traefik SSL)
                        </p>
                    </div>
                    {activeLifecycle && (
                        <Link
                            href={showRun(activeLifecycle.id).url}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
                        >
                            <span className="size-2 animate-ping rounded-full bg-brand" />
                            {activeLifecycle.label}…
                        </Link>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    <Form action={up(project.id)}>
                        {({ processing }) => (
                            <Button
                                type="submit"
                                size="sm"
                                disabled={
                                    Boolean(activeLifecycle) || processing
                                }
                            >
                                {processing ? 'Starting…' : 'Up / Rebuild'}
                            </Button>
                        )}
                    </Form>
                    <Form action={startLifecycle(project.id)}>
                        {({ processing }) => (
                            <Button
                                type="submit"
                                variant="secondary"
                                size="sm"
                                disabled={
                                    Boolean(activeLifecycle) || processing
                                }
                            >
                                Resume
                            </Button>
                        )}
                    </Form>
                    <Form action={stopLifecycle(project.id)}>
                        {({ processing }) => (
                            <Button
                                type="submit"
                                variant="secondary"
                                size="sm"
                                disabled={
                                    Boolean(activeLifecycle) || processing
                                }
                            >
                                Pause
                            </Button>
                        )}
                    </Form>
                    <Form action={down(project.id)}>
                        {({ processing }) => (
                            <Button
                                type="submit"
                                variant="ghost"
                                size="sm"
                                disabled={
                                    Boolean(activeLifecycle) || processing
                                }
                            >
                                Down
                            </Button>
                        )}
                    </Form>
                </div>

                <div className="border-t border-line pt-2.5">
                    <ProjectTldForm project={project} />
                </div>
            </div>
        </Card>
    );
}

function ProjectTldForm({ project }: { project: Project }) {
    const [tldValue, setTldValue] = useState(project.localTld ?? '');

    return (
        <Form
            action={setProjectTld(project.id)}
            className="flex items-center gap-2 text-xs"
        >
            {({ processing }) => (
                <>
                    <span className="text-soft">TLD override:</span>
                    <select
                        name="tld"
                        value={tldValue}
                        onChange={(e) => setTldValue(e.target.value)}
                        className="rounded border border-line bg-surface px-2 py-0.5 text-xs text-ink outline-none"
                    >
                        <option value="">
                            Default (.
                            {project.globalTld || 'test'})
                        </option>
                        <option value="test">.test</option>
                        <option value="kube">.kube</option>
                        <option value="localhost">.localhost</option>
                        <option value="local">.local</option>
                        <option value="internal">.internal</option>
                    </select>
                    <Button
                        type="submit"
                        variant="secondary"
                        size="sm"
                        disabled={
                            processing || tldValue === (project.localTld ?? '')
                        }
                    >
                        {processing ? 'Saving…' : 'Save'}
                    </Button>
                </>
            )}
        </Form>
    );
}

function RecentRunsCard({
    runs,
    activeEnv,
}: {
    runs: RecentRun[];
    activeEnv: string;
}) {
    const [filterByEnv, setFilterByEnv] = useState(true);

    const filteredRuns = useMemo(() => {
        if (!filterByEnv) return runs;
        return runs.filter((run) => {
            const runEnv = run.environment?.toLowerCase();
            if (runEnv) {
                return runEnv === activeEnv.toLowerCase();
            }

            if (activeEnv === 'local') {
                return (
                    !runEnv ||
                    runEnv === 'local' ||
                    [
                        'up-project',
                        'down-project',
                        'start-project',
                        'stop-project',
                        'init-project',
                        'new-project',
                    ].includes(run.kind ?? '')
                );
            }
            return (
                runEnv === activeEnv.toLowerCase() ||
                run.label
                    .toLowerCase()
                    .includes(`(${activeEnv.toLowerCase()})`) ||
                (!run.label.includes('(') &&
                    activeEnv.toLowerCase() === 'production' &&
                    ['deploy-app', 'link-server', 'configure-host'].includes(
                        run.kind ?? '',
                    ))
            );
        });
    }, [runs, activeEnv, filterByEnv]);

    return (
        <Card
            label={
                filterByEnv
                    ? `Recent runs · ${activeEnv.toUpperCase()}`
                    : 'Recent runs (All)'
            }
            action={
                <button
                    type="button"
                    onClick={() => setFilterByEnv(!filterByEnv)}
                    className="cursor-pointer text-[11px] text-soft transition-colors hover:text-ink"
                    title={
                        filterByEnv
                            ? 'Show all project runs'
                            : `Filter runs for ${activeEnv}`
                    }
                >
                    {filterByEnv ? 'Show all' : `Filter ${activeEnv}`}
                </button>
            }
        >
            {filteredRuns.length === 0 ? (
                <p className="py-2 text-xs text-soft">
                    {filterByEnv
                        ? `No recent runs for ${activeEnv}.`
                        : 'Nothing yet.'}
                </p>
            ) : (
                filteredRuns.map((run) => {
                    const [label, tone] = runStatus[run.status];
                    return (
                        <Link
                            key={run.id}
                            href={showRun(run.id).url}
                            className="-mx-1 flex items-center justify-between gap-3 rounded border-t border-line px-1 py-2 transition-colors first:border-t-0 hover:bg-paper"
                        >
                            <span className="truncate text-[13px]">
                                {run.label}
                            </span>
                            <StatusPill tone={tone}>{label}</StatusPill>
                        </Link>
                    );
                })
            )}
        </Card>
    );
}

function ProjectSettingsCard({ project }: { project: Project }) {
    return (
        <Card label="Project Settings">
            <div className="space-y-2">
                <Link
                    href={destroy(project.id).url}
                    method="delete"
                    as="button"
                    className={buttonClass(
                        'danger',
                        'sm',
                        'w-full justify-center gap-1.5',
                    )}
                >
                    <Trash2 className="size-3.5" />
                    <span>Remove from LaraKube Desktop</span>
                </Link>
                <p className="text-center text-xs leading-relaxed text-soft">
                    Only forgets the project in Desktop. Your local files,
                    database, and cloud servers stay untouched.
                </p>
            </div>
        </Card>
    );
}

function ProjectTerminalCard({ run }: { run: ProjectRun }) {
    const running = run.status === 'running';
    const [label, tone] = runStatus[run.status];
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        if (running) {
            setCollapsed(false);
        }
    }, [running, run.id]);

    return (
        <Card>
            <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="relative flex size-6 shrink-0 items-center justify-center rounded-lg bg-term text-white shadow-2xs">
                        <Terminal className="size-3 text-brand" />
                        {running && (
                            <span className="absolute -top-0.5 -right-0.5 size-2 animate-ping rounded-full bg-brand" />
                        )}
                    </span>
                    <span
                        className="truncate text-xs font-semibold text-ink"
                        title={run.label}
                    >
                        {run.label}
                    </span>
                </div>

                <div className="flex shrink-0 items-center gap-2.5">
                    <StatusPill tone={tone}>{label}</StatusPill>
                    {running && (
                        <Link
                            href={cancel(run.id).url}
                            method="post"
                            as="button"
                            className="text-xs font-medium text-accent hover:underline"
                        >
                            Cancel
                        </Link>
                    )}
                    <Link
                        href={showRun(run.id).url}
                        className="inline-flex items-center gap-1 text-xs text-soft hover:text-ink hover:underline"
                        title="View in Activity"
                    >
                        <span>Activity</span>
                        <ExternalLink className="size-3" />
                    </Link>
                    <button
                        type="button"
                        onClick={() => setCollapsed(!collapsed)}
                        className="ml-1 inline-flex cursor-pointer items-center gap-1 text-xs text-soft transition-colors hover:text-ink"
                        title={
                            collapsed
                                ? 'Expand terminal output'
                                : 'Collapse terminal output'
                        }
                    >
                        <span>{collapsed ? 'Expand' : 'Collapse'}</span>
                        {collapsed ? (
                            <ChevronDown className="size-3" />
                        ) : (
                            <ChevronUp className="size-3" />
                        )}
                    </button>
                </div>
            </div>

            {!collapsed && (
                <div className="pt-3">
                    <LogPanel
                        output={run.output}
                        placeholder={
                            running ? 'Running command…' : 'No output recorded.'
                        }
                        follow={running}
                        className="h-72 max-h-96 min-h-[160px]"
                    />
                </div>
            )}
        </Card>
    );
}
