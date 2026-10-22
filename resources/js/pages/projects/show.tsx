import {
    Deferred,
    Form,
    Link,
    router,
    useForm,
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
    Laptop,
    Cloud,
    X,
    Folder,
    RotateCw,
    Share2,
    Unplug,
    Key,
    ArrowUpCircle,
    Square,
    PowerOff,
    Save,
    Network,
} from 'lucide-react';
import { SiGithub, SiGitlab, SiForgejo } from '@icons-pack/react-simple-icons';
import Button, { buttonClass } from '@/components/button';
import CopyButton from '@/components/copy-button';
import EnvironmentSettingsDrawer, {
    LinkServerForm,
    HostForm,
    CiPipelineForm,
    type EnvironmentSettingsDrawerSection,
} from '@/components/environment-settings-drawer';
import BackingServicesCard from '@/components/backing-services-card';
import LocalDevCompanionsCard from '@/components/local-dev-companions-card';
import WorkloadScalingCard from '@/components/workload-scaling-card';
import EnvironmentSecretsCard from '@/components/environment-secrets-card';
import ProjectTerminalCard, {
    type ProjectRun,
} from '@/components/project-terminal-card';
import RecentRunsCard, { type RecentRun } from '@/components/recent-runs-card';
import Sparkline from '@/components/metrics/sparkline';
import Card from '@/components/card';
import FrameworkBadge from '@/components/framework-badge';
import ProviderLogo from '@/components/provider-logo';
import Redactable from '@/components/redactable';
import EditorMenu from '@/components/editor-menu';
import FrameworkFields, {
    defaultAnswers,
    reconcile,
} from '@/components/framework-fields';
import PageHeader from '@/components/page-header';
import SelectMenu from '@/components/select-menu';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import QrCodePopover from '@/components/qr-code-popover';
import { ExternalLinkButton } from '@/lib/open-external';
import {
    deploy,
    destroy,
    down,
    folder as showFolder,
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
import { show as showRun } from '@/routes/runs';
import { create as createServer, show as showServer } from '@/routes/servers';
import { providerLabels } from '@/types/larakube';
import type {
    BackingServices,
    CompanionApp,
    DeployMetrics,
    HealthMetrics,
    NewAppAnswers,
    NewAppQuestion,
    PodMetrics,
    Project,
    ProjectEnvironment,
    RunStatus,
    Server,
    ServerDomain,
} from '@/types/larakube';

const STATIC = ['vite', 'astro', 'docusaurus'];

type Editor = { slug: string; label: string; category?: 'editor' | 'agent' };

type ReadyServer = {
    name: string;
    ip: string | null;
    provider?: string | null;
};

export function resolveServerProvider(
    serverName?: string | null,
    serverProvider?: string | null,
    readyServers: ReadyServer[] = [],
): string | null {
    if (serverProvider) return serverProvider;
    if (!serverName) return null;
    const found = readyServers.find((s) => s.name === serverName);
    if (found?.provider) return found.provider;
    const lower = serverName.toLowerCase();
    if (lower.includes('gcp') || lower.includes('google')) return 'gcp';
    if (lower.includes('do') || lower.includes('digitalocean')) return 'do';
    if (lower.includes('hetzner')) return 'hetzner';
    if (lower.includes('aws') || lower.includes('amazon')) return 'aws';
    return null;
}

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
    healthMetrics,
    podMetrics,
    deployMetrics,
    domains,
    companions,
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
    healthMetrics?: Record<string, HealthMetrics | null> | null;
    podMetrics?: Record<string, PodMetrics | null>;
    deployMetrics?: Record<string, DeployMetrics | null> | null;
    domains?: Record<string, ServerDomain[]> | null;
    companions?: CompanionApp[] | null;
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
                    webHost: `${project.name}.${project.effectiveTld || project.localTld || project.globalTld || 'kube'}`,
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
                provider: activeEnvConfig.serverProvider ?? null,
            };
        }
        if (activeEnv === 'production' && server) {
            return server;
        }
        return null;
    }, [activeEnvConfig, activeEnv, server, readyServers]);

    const activeServerProvider = useMemo(
        () =>
            resolveServerProvider(
                activeServer?.name,
                (activeServer && 'provider' in activeServer
                    ? activeServer.provider
                    : null) ?? activeEnvConfig?.serverProvider,
                readyServers,
            ),
        [activeServer, activeEnvConfig, readyServers],
    );

    const activeHost =
        activeEnvConfig?.webHost ??
        (activeEnv === 'production' ? project.webHost : null);

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
                        <FrameworkBadge slug={project.framework} />
                    ) : undefined
                }
                meta={
                    <div className="flex items-center gap-1.5 font-mono text-xs text-soft">
                        <span
                            className="max-w-md truncate"
                            title={project.path}
                        >
                            {project.path}
                        </span>
                        <CopyButton
                            value={project.path}
                            label=""
                            copiedLabel=""
                            size="xs"
                            variant="ghost"
                            className="h-5 w-5 p-0 text-faint hover:text-ink"
                            title="Copy path"
                        />
                    </div>
                }
                actions={
                    <div className="flex items-center gap-2.5">
                        {project.exists && (
                            <Link
                                href={showFolder(project.id).url}
                                method="post"
                                as="button"
                                preserveScroll
                                className={buttonClass('secondary')}
                            >
                                <Folder className="size-4" />
                                <span>Show folder</span>
                            </Link>
                        )}
                        {project.exists && (
                            <EditorMenu project={project} editors={editors} />
                        )}
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
                                <RotateCw className="size-3.5" />
                                <span>Try again</span>
                            </Link>
                        )}
                        <Link
                            href={destroy(project.id).url}
                            method="delete"
                            as="button"
                            className={buttonClass('secondary', 'sm')}
                        >
                            <Trash2 className="size-3.5" />
                            <span>Remove</span>
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
                                            healthMetrics={
                                                healthMetrics?.local ?? null
                                            }
                                            podMetrics={
                                                podMetrics?.local ?? null
                                            }
                                        />
                                    )}

                                    {project.initialized && (
                                        <Deferred
                                            data={[
                                                'healthMetrics',
                                                'deployMetrics',
                                            ]}
                                            fallback={
                                                <Card label="App Health & Telemetry">
                                                    <div className="animate-pulse p-4 text-xs text-soft">
                                                        Loading workload
                                                        telemetry…
                                                    </div>
                                                </Card>
                                            }
                                        >
                                            <AppPerformanceMetricsCard
                                                projectId={project.id}
                                                activeEnv={activeEnv}
                                                healthMetrics={healthMetrics}
                                                podMetrics={podMetrics}
                                                deployMetrics={deployMetrics}
                                            />
                                        </Deferred>
                                    )}

                                    {project.initialized && (
                                        <WorkloadScalingCard
                                            project={project}
                                            activeEnv={activeEnv}
                                            activeEnvConfig={activeEnvConfig}
                                        />
                                    )}

                                    <EnvironmentBackingServicesCard
                                        key={activeEnv}
                                        project={project}
                                        currentEnv={activeEnvConfig}
                                        services={backing?.[activeEnv]}
                                    />

                                    <Deferred
                                        data="companions"
                                        fallback={
                                            <div className="h-40 animate-pulse rounded-2xl bg-surface ring-1 ring-line" />
                                        }
                                    >
                                        <LocalDevCompanionsCard
                                            project={project}
                                            companions={companions}
                                        />
                                    </Deferred>

                                    {project.initialized && (
                                        <EnvironmentSecretsCard
                                            project={project}
                                            activeEnv={activeEnv}
                                            activeEnvConfig={activeEnvConfig}
                                        />
                                    )}
                                </>
                            ) : (
                                <>
                                    <CloudEnvironmentOverviewCard
                                        project={project}
                                        activeEnv={activeEnv}
                                        activeEnvConfig={activeEnvConfig}
                                        activeServer={activeServer}
                                        activeServerProvider={
                                            activeServerProvider
                                        }
                                        activeHost={activeHost}
                                        readyServers={readyServers}
                                        runs={runs}
                                        domains={domains?.[activeEnv] ?? null}
                                        onOpenDeploy={() =>
                                            setDeployModalOpen(true)
                                        }
                                        onOpenCi={() =>
                                            setDeployModalOpen(true)
                                        }
                                    />

                                    <Deferred
                                        data={[
                                            'healthMetrics',
                                            'podMetrics',
                                            'deployMetrics',
                                        ]}
                                        fallback={
                                            <Card
                                                label={`App Health & Telemetry · ${activeEnv.toUpperCase()}`}
                                            >
                                                <div className="animate-pulse p-4 text-xs text-soft">
                                                    Loading workload telemetry…
                                                </div>
                                            </Card>
                                        }
                                    >
                                        <AppPerformanceMetricsCard
                                            activeEnv={activeEnv}
                                            healthMetrics={healthMetrics}
                                            podMetrics={podMetrics}
                                            deployMetrics={deployMetrics}
                                        />
                                    </Deferred>

                                    <WorkloadScalingCard
                                        project={project}
                                        activeEnv={activeEnv}
                                        activeEnvConfig={activeEnvConfig}
                                    />

                                    <EnvironmentBackingServicesCard
                                        key={activeEnv}
                                        project={project}
                                        currentEnv={activeEnvConfig}
                                        services={backing?.[activeEnv]}
                                    />

                                    <EnvironmentSecretsCard
                                        project={project}
                                        activeEnv={activeEnv}
                                        activeEnvConfig={activeEnvConfig}
                                    />
                                </>
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
                        activeEnvConfig={activeEnvConfig}
                        activeServer={activeServer}
                        activeServerProvider={activeServerProvider}
                        activeHost={activeHost}
                        frameworks={frameworks}
                        runs={runs}
                        latestRun={latestRun}
                        wizardFrameworks={wizardFrameworks}
                        email={email}
                        laravelOptions={laravelOptions}
                        readyServers={readyServers}
                        domains={domains?.[activeCloudEnvName] ?? null}
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
    readyServers,
    onAddEnv,
    runs,
    project,
}: {
    activeEnv: string;
    onSelectEnv: (env: string) => void;
    cloudEnvs: ProjectEnvironment[];
    readyServers: ReadyServer[];
    onAddEnv: () => void;
    runs: RecentRun[];
    project: Project;
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
        project.effectiveTld || project.localTld || project.globalTld || 'kube';
    const localDomain = `${project.name}.${effectiveTld}`;

    // Only the cloud environments the project really has: none until one is created.
    const envsToRender = cloudEnvs;

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
                    const serverProvider = resolveServerProvider(
                        env.serverName,
                        env.serverProvider,
                        readyServers,
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
                            {serverProvider ? (
                                <ProviderLogo
                                    provider={serverProvider}
                                    size="xs"
                                    className="size-4 rounded-sm border-0 p-0 shadow-none"
                                />
                            ) : (
                                <Cloud className="size-3.5 text-sky-500" />
                            )}
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
                    title="Create a cloud environment, such as staging or production"
                >
                    <Plus className="size-3.5" />
                    <span>New environment</span>
                </button>
            </div>

            {/* Contextual Action on the Right */}
            <div className="flex items-center gap-2 pr-1">
                {isLocalActive ? (
                    <ExternalLinkButton
                        url={`https://${localDomain}`}
                        className={cn(
                            buttonClass('secondary', 'sm'),
                            'gap-1.5',
                        )}
                        title="Open local application in browser"
                    >
                        <span>Open local site</span>
                        <ExternalLink className="size-3" />
                    </ExternalLinkButton>
                ) : (
                    <div className="flex items-center gap-2">
                        {activeDeploy && (
                            <StatusPill tone="busy">
                                {`Deploying (${activeEnv})`}
                            </StatusPill>
                        )}
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
    activeEnvConfig,
    activeServer,
    activeServerProvider: propProvider,
    activeHost,
    readyServers,
    runs,
    domains,
    onOpenDeploy,
    onOpenCi: _onOpenCi,
}: {
    project: Project;
    activeEnv: string;
    activeEnvConfig?: ProjectEnvironment;
    activeServer: ReadyServer | Server | null;
    activeServerProvider?: string | null;
    activeHost: string | null;
    readyServers: ReadyServer[];
    runs: RecentRun[];
    domains?: ServerDomain[] | null;
    onOpenDeploy: () => void;
    onOpenCi?: () => void;
}) {
    const [settingsSection, setSettingsSection] =
        useState<EnvironmentSettingsDrawerSection | null>(null);

    const activeCi =
        activeEnvConfig?.ci ?? project.environments?.[activeEnv]?.ci;

    const activeServerProvider =
        propProvider ??
        resolveServerProvider(
            activeServer?.name,
            (activeServer && 'provider' in activeServer
                ? activeServer.provider
                : null) ?? activeEnvConfig?.serverProvider,
            readyServers,
        );

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
                <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
                    {/* Server Details */}
                    <div className="rounded-xl border border-line bg-paper/60 p-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium tracking-wider text-soft uppercase">
                                Target Server
                            </span>
                            {activeServer ? (
                                <button
                                    type="button"
                                    onClick={() => setSettingsSection('server')}
                                    className="cursor-pointer text-[11px] font-medium text-brand hover:underline focus:outline-none"
                                >
                                    Change
                                </button>
                            ) : null}
                        </div>

                        {activeServer ? (
                            <div className="mt-2.5 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <ProviderLogo
                                        provider={activeServerProvider}
                                        size="sm"
                                    />
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <Link
                                                href={
                                                    showServer(
                                                        activeServer.name,
                                                    ).url
                                                }
                                                className="truncate text-xs font-semibold text-ink hover:underline"
                                            >
                                                {activeServer.name}
                                            </Link>
                                            {activeServerProvider && (
                                                <span className="rounded bg-line/60 px-1.5 py-0.5 text-[10px] font-medium text-soft">
                                                    {providerLabels[
                                                        activeServerProvider
                                                    ] ?? activeServerProvider}
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-0.5 font-mono text-[11px] text-soft">
                                            {activeServer.ip ? (
                                                <Redactable
                                                    value={activeServer.ip}
                                                    kind="ip"
                                                />
                                            ) : (
                                                'No public IP'
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-2 text-xs text-soft">
                                <span>No server linked yet. </span>
                                <button
                                    type="button"
                                    onClick={() => setSettingsSection('server')}
                                    className="cursor-pointer font-medium text-brand hover:underline"
                                >
                                    Link server
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Public Address Details */}
                    <div className="rounded-xl border border-line bg-paper/60 p-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium tracking-wider text-soft uppercase">
                                Public Address
                            </span>
                            <button
                                type="button"
                                onClick={() => setSettingsSection('address')}
                                className="cursor-pointer text-[11px] font-medium text-brand hover:underline focus:outline-none"
                            >
                                {activeHost ? 'Edit' : 'Configure'}
                            </button>
                        </div>

                        {activeHost ? (
                            <div className="mt-2 flex items-center justify-between">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="truncate font-mono text-xs font-semibold text-ink">
                                            https://{activeHost}
                                        </span>
                                        <QrCodePopover
                                            url={`https://${activeHost}`}
                                            title={project.name}
                                            description="Scan with your phone to preview your app"
                                        />
                                        <ExternalLinkButton
                                            url={`https://${activeHost}`}
                                            className="shrink-0 cursor-pointer text-brand hover:underline"
                                            title="Visit public URL"
                                        >
                                            <ExternalLink className="size-3" />
                                        </ExternalLinkButton>
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
                                    onClick={() =>
                                        setSettingsSection('address')
                                    }
                                    className="cursor-pointer font-medium text-brand hover:underline"
                                >
                                    Configure domain
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Delivery Pipeline Details */}
                    <div className="rounded-xl border border-line bg-paper/60 p-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium tracking-wider text-soft uppercase">
                                Delivery Pipeline
                            </span>
                            {activeCi?.hasWorkflow ? (
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setSettingsSection('pipeline')
                                        }
                                        className="flex cursor-pointer items-center gap-1 text-[11px] text-soft hover:text-ink focus:outline-none"
                                        title="Rotate scoped deployer secrets"
                                    >
                                        <Key className="size-2.5" />
                                        <span>Rotate</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setSettingsSection('pipeline')
                                        }
                                        className="cursor-pointer text-[11px] font-medium text-brand hover:underline focus:outline-none"
                                    >
                                        Edit
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() =>
                                        setSettingsSection('pipeline')
                                    }
                                    className="cursor-pointer text-[11px] font-medium text-brand hover:underline focus:outline-none"
                                >
                                    Set up
                                </button>
                            )}
                        </div>

                        {activeCi?.hasWorkflow ? (
                            <div className="mt-2.5 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-line/60 bg-surface shadow-2xs">
                                        {activeCi.platform === 'gitlab' ? (
                                            <SiGitlab className="size-4 text-[#FC6D26]" />
                                        ) : activeCi.platform === 'forgejo' ? (
                                            <SiForgejo className="size-4 text-[#FB532A]" />
                                        ) : (
                                            <SiGithub className="size-4 text-ink" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="truncate text-xs font-semibold text-ink">
                                                {activeCi.platform === 'gitlab'
                                                    ? 'GitLab CI'
                                                    : activeCi.platform ===
                                                        'forgejo'
                                                      ? 'Forgejo'
                                                      : 'GitHub Actions'}
                                            </span>
                                            <span className="rounded bg-line/60 px-1.5 py-0.5 text-[10px] font-medium text-soft">
                                                {activeCi.branch ?? 'main'}
                                            </span>
                                        </div>
                                        <p className="mt-0.5 truncate font-mono text-[11px] text-soft">
                                            {activeCi.registry?.image
                                                ? `${activeCi.registry.provider ?? 'ghcr'}:${activeCi.registry.image}`
                                                : `${activeCi.platform === 'gitlab' ? '.gitlab-ci.yml' : '.github/workflows'}`}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-2 text-xs text-soft">
                                <span>Automated CI/CD not configured. </span>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setSettingsSection('pipeline')
                                    }
                                    className="cursor-pointer font-medium text-brand hover:underline"
                                >
                                    Set up CI/CD
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <EnvironmentSettingsDrawer
                    isOpen={settingsSection !== null}
                    onClose={() => setSettingsSection(null)}
                    project={project}
                    environment={activeEnv}
                    activeServer={activeServer}
                    readyServers={readyServers}
                    activeHost={activeHost}
                    domains={domains}
                    activeCi={activeCi}
                    initialSection={settingsSection}
                />

                {/* Deploy Action Banner */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                    <p className="text-xs text-soft">
                        {activeDeploy
                            ? 'Building and shipping app containers to cluster…'
                            : activeCi?.hasWorkflow
                              ? `Automated CI/CD is active on ${activeCi.branch ?? 'main'}. Push commits to Git to deploy, or trigger a manual deploy from this Mac.`
                              : hasSucceededDeploy
                                ? `Last deployment to ${activeServer?.name ?? 'server'} succeeded.`
                                : activeServer
                                  ? `Ready to deploy to ${activeServer.name}. Click Deploy to ship.`
                                  : 'Configure server and host to ship this environment.'}
                    </p>
                    <Button
                        variant={
                            activeCi?.hasWorkflow ? 'secondary' : 'primary'
                        }
                        size="sm"
                        onClick={onOpenDeploy}
                        className="gap-1.5"
                    >
                        <Play className="size-3.5 fill-current" />
                        <span>
                            {activeCi?.hasWorkflow
                                ? 'Deploy from Mac (Manual)'
                                : hasSucceededDeploy
                                  ? `Deploy ${activeEnv.toUpperCase()} again`
                                  : activeServer
                                    ? `Deploy to ${activeEnv.toUpperCase()}`
                                    : 'Set up deployment'}
                        </span>
                    </Button>
                </div>
            </div>
        </Card>
    );
}

function AppPerformanceMetricsCard({
    projectId,
    activeEnv,
    healthMetrics,
    podMetrics,
    deployMetrics,
}: {
    projectId?: number;
    activeEnv: string;
    healthMetrics?: Record<string, HealthMetrics | null> | null;
    podMetrics?: Record<string, PodMetrics | null>;
    deployMetrics?: Record<string, DeployMetrics | null> | null;
}) {
    const envHealth = healthMetrics?.[activeEnv];
    const envPodMetrics = podMetrics?.[activeEnv];
    const envDeploy = deployMetrics?.[activeEnv] ?? deployMetrics?.['_all'];
    const components = envPodMetrics?.components
        ? Object.entries(envPodMetrics.components)
        : [];

    return (
        <Card
            label={`App Health & Telemetry · ${activeEnv.toUpperCase()}`}
            action={
                projectId ? (
                    <Link
                        href={`/simulator?project=${projectId}`}
                        className={cn(
                            buttonClass('secondary', 'sm'),
                            'gap-1.5 text-xs font-semibold text-ink shadow-2xs hover:border-brand/40',
                        )}
                        title="Trace request flow through Cloudflare, Traefik, Pod, and Database"
                    >
                        <Network className="size-3 text-brand" />
                        <span>Trace Request</span>
                    </Link>
                ) : undefined
            }
        >
            <div className="grid grid-cols-1 divide-y divide-line lg:grid-cols-3 lg:divide-x lg:divide-y-0">
                {/* 1. Endpoint Latency */}
                <div className="flex flex-col justify-between p-3.5">
                    <div>
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold tracking-wider text-soft uppercase">
                                Endpoint Latency
                            </span>
                            {envHealth?.isUp ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                    <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                                    Healthy ({envHealth.status ?? 200})
                                </span>
                            ) : envHealth?.checkedAt ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-500">
                                    <span className="size-1.5 rounded-full bg-rose-500" />
                                    Unreachable
                                </span>
                            ) : (
                                <span className="text-[11px] text-faint">
                                    Idle
                                </span>
                            )}
                        </div>

                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="font-mono text-2xl font-bold tracking-tight text-ink">
                                {envHealth?.latencyMs !== null &&
                                envHealth?.latencyMs !== undefined
                                    ? `${envHealth.latencyMs}ms`
                                    : '—'}
                            </span>
                            <span className="text-xs text-soft">
                                response time
                            </span>
                        </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                        <span className="font-mono text-[10px] text-faint">
                            Recent pings (/up)
                        </span>
                        {envHealth && envHealth.history.length > 0 ? (
                            <Sparkline
                                data={envHealth.history}
                                type="line"
                                height={24}
                                width={100}
                                unit="ms"
                            />
                        ) : (
                            <span className="font-mono text-[10px] text-faint">
                                No ping history
                            </span>
                        )}
                    </div>
                </div>

                {/* 2. Pod Resources */}
                <div className="flex flex-col justify-between p-3.5">
                    <div>
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold tracking-wider text-soft uppercase">
                                Pod Resources
                            </span>
                            <span className="font-mono text-[10px] text-faint">
                                {components.length > 0
                                    ? `${components.length} ${components.length === 1 ? 'service' : 'services'}`
                                    : 'metrics-server'}
                            </span>
                        </div>

                        {components.length > 0 ? (
                            <div className="mt-2.5 space-y-2">
                                {components.map(([name, stat]) => (
                                    <div
                                        key={name}
                                        className="flex items-center justify-between text-xs"
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <span className="size-1.5 rounded-full bg-brand" />
                                            <span className="font-medium text-ink capitalize">
                                                {name}
                                            </span>
                                            {stat.podCount > 1 && (
                                                <span className="font-mono text-[10px] text-faint">
                                                    (×{stat.podCount})
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 font-mono text-[11px] text-soft">
                                            <span>{stat.cpu}</span>
                                            <span className="text-line">/</span>
                                            <span>{stat.memory}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="mt-3 py-2 text-center text-xs text-soft">
                                <p>Pod telemetry warming up</p>
                                <p className="mt-0.5 text-[10px] text-faint">
                                    Awaiting Kubernetes metrics collection
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-line/50 pt-1 text-[10px] text-faint">
                        <span>CPU / Memory</span>
                        <span className="font-mono">
                            {envPodMetrics?.updatedAt
                                ? new Date(
                                      envPodMetrics.updatedAt,
                                  ).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                  })
                                : '—'}
                        </span>
                    </div>
                </div>

                {/* 3. Deployment Health */}
                <div className="flex flex-col justify-between p-3.5">
                    <div>
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold tracking-wider text-soft uppercase">
                                Deploy Health
                            </span>
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-ink">
                                {envDeploy ? `${envDeploy.successRate}%` : '—'}{' '}
                                success
                            </span>
                        </div>

                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="font-mono text-2xl font-bold tracking-tight text-ink">
                                {envDeploy?.totalDeploys ?? 0}
                            </span>
                            <span className="text-xs text-soft">
                                {envDeploy?.totalDeploys === 1
                                    ? 'total deploy'
                                    : 'total deploys'}
                            </span>
                        </div>
                    </div>

                    <div className="mt-3 flex items-end justify-between">
                        <div>
                            <span className="font-mono text-[10px] text-faint">
                                14-day cadence
                            </span>
                            <p className="text-[10px] text-soft">
                                Avg duration:{' '}
                                {envDeploy?.avgDurationSeconds
                                    ? `${envDeploy.avgDurationSeconds}s`
                                    : '—'}
                            </p>
                        </div>
                        {envDeploy && envDeploy.activity14d.length > 0 ? (
                            <Sparkline
                                data={envDeploy.activity14d}
                                type="bar"
                                height={24}
                                width={85}
                                unit=" deploys"
                            />
                        ) : (
                            <span className="font-mono text-[10px] text-faint">
                                No deploy activity
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </Card>
    );
}

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
        <BackingServicesCard
            label={`Backing Services · ${currentEnv.name.toUpperCase()}`}
            services={shown}
            hasCommons={hasPlex}
            footer={
                <>
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
                                    <Unplug className="size-3.5" />
                                    <span>Disconnect Commons</span>
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
                                    <Share2 className="size-3.5" />
                                    <span>Join Commons</span>
                                </Link>
                            )}
                        </div>
                    </div>
                </>
            }
        />
    );
}

/** Deployment wizard presented as a clean pop-up modal dialog */
function DeployDialog({
    open,
    onClose,
    project,
    server: _server,
    activeEnv,
    activeEnvConfig,
    activeServer,
    activeServerProvider: propProvider,
    activeHost,
    frameworks,
    runs,
    latestRun,
    wizardFrameworks,
    email,
    laravelOptions,
    readyServers,
    domains,
}: {
    open: boolean;
    onClose: () => void;
    project: Project;
    server: Server | null;
    activeEnv: string;
    activeEnvConfig?: ProjectEnvironment | null;
    activeServer: ReadyServer | Server | null;
    activeServerProvider?: string | null;
    activeHost: string | null;
    frameworks: Record<string, string>;
    runs: RecentRun[];
    latestRun: ProjectRun | null;
    wizardFrameworks: string[];
    email: string;
    laravelOptions?: NewAppQuestion[] | null;
    readyServers: ReadyServer[];
    domains?: ServerDomain[] | null;
}) {
    const [showSwitchServer, setShowSwitchServer] = useState(false);
    const [showEditCi, setShowEditCi] = useState(false);
    const [skippedCi, setSkippedCi] = useState(false);

    useEffect(() => {
        setSkippedCi(false);
        setShowEditCi(false);
    }, [activeEnv]);

    const activeCi =
        activeEnvConfig?.ci ?? project.environments?.[activeEnv]?.ci;

    const activeServerProvider =
        propProvider ??
        resolveServerProvider(
            activeServer?.name,
            activeServer && 'provider' in activeServer
                ? activeServer.provider
                : null,
            readyServers,
        );

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
                                    <div className="flex items-center gap-2">
                                        <ProviderLogo
                                            provider={activeServerProvider}
                                            size="xs"
                                        />
                                        <p className="text-xs text-soft">
                                            <Link
                                                href={
                                                    showServer(
                                                        activeServer.name,
                                                    ).url
                                                }
                                                className="font-medium text-ink hover:underline"
                                            >
                                                {activeServer.name}
                                            </Link>{' '}
                                            ·{' '}
                                            {activeServer.ip && (
                                                <Redactable
                                                    value={activeServer.ip}
                                                    kind="ip"
                                                />
                                            )}
                                            {activeServerProvider && (
                                                <span className="ml-1.5 rounded bg-line/60 px-1 text-[10px] text-soft">
                                                    {providerLabels[
                                                        activeServerProvider
                                                    ] ?? activeServerProvider}
                                                </span>
                                            )}
                                        </p>
                                    </div>
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
                            serverName={activeServer?.name ?? null}
                            disabled={!project.initialized}
                            environment={activeEnv}
                            currentHost={activeHost}
                            domains={domains}
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
                        title={`Registry & CI/CD (${activeEnv.toUpperCase()})`}
                        done={Boolean(activeCi?.hasWorkflow) || skippedCi}
                    >
                        <div className="space-y-2">
                            {activeCi?.hasWorkflow && !showEditCi ? (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2.5">
                                            <div className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-line bg-surface">
                                                {activeCi.platform ===
                                                'gitlab' ? (
                                                    <SiGitlab className="size-3.5 text-[#FC6D26]" />
                                                ) : activeCi.platform ===
                                                  'forgejo' ? (
                                                    <SiForgejo className="size-3.5 text-[#FB532A]" />
                                                ) : (
                                                    <SiGithub className="size-3.5 text-ink" />
                                                )}
                                            </div>
                                            <p className="text-xs text-soft">
                                                <strong className="text-ink">
                                                    {activeCi.platform ===
                                                    'gitlab'
                                                        ? 'GitLab CI'
                                                        : activeCi.platform ===
                                                            'forgejo'
                                                          ? 'Forgejo Actions'
                                                          : 'GitHub Actions'}
                                                </strong>{' '}
                                                · {activeCi.branch ?? 'main'} ·{' '}
                                                <span className="font-mono text-[11px]">
                                                    {activeCi.registry?.image ??
                                                        project.name}
                                                </span>
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowEditCi(true)}
                                            className="text-[11px] text-brand hover:underline"
                                        >
                                            Reconfigure
                                        </button>
                                    </div>
                                    <p className="text-xs text-soft">
                                        Automated workflow is committed to
                                        repository. Deployments trigger
                                        automatically when pushing to{' '}
                                        <strong>
                                            {activeCi.branch ?? 'main'}
                                        </strong>
                                        .
                                    </p>
                                </div>
                            ) : (
                                <CiPipelineForm
                                    project={project}
                                    environment={activeEnv}
                                    currentCi={activeCi}
                                    onSuccess={() => setShowEditCi(false)}
                                    onSkip={() => setSkippedCi(true)}
                                />
                            )}

                            {latestRun?.kind === 'configure-ci' && (
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
                                        `✓ CI/CD pipeline configured for ${activeEnv}.`}
                                    {latestRun.status === 'running' &&
                                        'Setting up CI/CD workflow and scoped secrets…'}
                                    {latestRun.status === 'failed' &&
                                        'Failed to configure CI/CD pipeline.'}
                                </p>
                            )}
                        </div>
                    </Step>

                    <Step
                        number={5}
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
                                    {activeCi?.hasWorkflow && (
                                        <div className="rounded-lg border border-line bg-paper/60 p-2.5 text-xs text-soft">
                                            <p className="font-medium text-ink">
                                                Push to deploy via CI/CD
                                            </p>
                                            <p className="mt-0.5">
                                                Pushing to{' '}
                                                <code className="font-mono text-[11px]">
                                                    {activeCi.branch ?? 'main'}
                                                </code>{' '}
                                                will trigger your automated
                                                workflow. You can also deploy
                                                immediately from this Mac below.
                                            </p>
                                        </div>
                                    )}
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
                                                      : activeCi?.hasWorkflow
                                                        ? 'Deploy from Mac (Manual)'
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
                                <SelectMenu
                                    name="server"
                                    value={server}
                                    accent="servers"
                                    onChange={setServer}
                                    options={readyServers.map((s) => ({
                                        value: s.name,
                                        label: (
                                            <>
                                                {s.name}
                                                {s.provider
                                                    ? ` (${providerLabels[s.provider] ?? s.provider})`
                                                    : ''}
                                                {s.ip && (
                                                    <>
                                                        {' · '}
                                                        <Redactable
                                                            value={s.ip}
                                                            kind="ip"
                                                        />
                                                    </>
                                                )}
                                            </>
                                        ),
                                    }))}
                                />
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
                <SelectMenu
                    value={form.data.framework}
                    accent="servers"
                    triggerClassName="py-1.5 text-[13px]"
                    onChange={(value) => setData('framework', value)}
                    options={Object.entries(frameworks).map(
                        ([value, label]) => ({
                            value,
                            label:
                                value === project.detectedFramework
                                    ? `${label} (detected)`
                                    : label,
                        }),
                    )}
                />
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

function LocalClusterCard({
    project,
    runs,
    healthMetrics,
    podMetrics,
}: {
    project: Project;
    runs: RecentRun[];
    healthMetrics?: HealthMetrics | null;
    podMetrics?: PodMetrics | null;
}) {
    const [confirmDownOpen, setConfirmDownOpen] = useState(false);

    const activeLifecycle = runs.find(
        (run) =>
            [
                'up-project',
                'down-project',
                'start-project',
                'stop-project',
            ].includes(run.kind ?? '') && run.status === 'running',
    );

    const latestLifecycleRun = runs.find(
        (run) =>
            [
                'up-project',
                'down-project',
                'start-project',
                'stop-project',
            ].includes(run.kind ?? '') &&
            ['succeeded', 'running'].includes(run.status),
    );

    const isLiveUp = Boolean(healthMetrics?.isUp);
    const hasActivePods = Boolean(
        podMetrics?.available &&
        Object.values(podMetrics.components ?? {}).some(
            (c) => (c.podCount ?? 0) > 0,
        ),
    );

    const status: 'running' | 'stopped' | 'down' | 'busy' = useMemo(() => {
        if (activeLifecycle) return 'busy';
        if (
            latestLifecycleRun?.kind === 'down-project' &&
            latestLifecycleRun?.status === 'succeeded'
        ) {
            return 'down';
        }
        if (
            latestLifecycleRun?.kind === 'stop-project' &&
            latestLifecycleRun?.status === 'succeeded'
        ) {
            return 'stopped';
        }
        if (isLiveUp || hasActivePods) {
            return 'running';
        }
        if (
            latestLifecycleRun?.kind === 'up-project' &&
            latestLifecycleRun?.status === 'succeeded'
        ) {
            return 'running';
        }

        return 'down';
    }, [activeLifecycle, latestLifecycleRun, isLiveUp, hasActivePods]);

    const effectiveTld =
        project.effectiveTld || project.localTld || project.globalTld || 'kube';
    const domain = `${project.name}.${effectiveTld}`;

    const isBusy = Boolean(activeLifecycle);
    const canUp = !isBusy;
    const canStart = !isBusy && status === 'stopped';
    const canStop = !isBusy && status === 'running';
    const canDown = !isBusy && (status === 'running' || status === 'stopped');

    return (
        <Card label="Local Development">
            <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-semibold text-ink">
                                https://{domain}
                            </span>
                            <ExternalLinkButton
                                url={`https://${domain}`}
                                className="inline-flex cursor-pointer items-center gap-1 text-xs text-brand hover:underline"
                            >
                                <span>Open</span>
                                <ExternalLink className="size-3" />
                            </ExternalLinkButton>
                        </div>
                        <p className="mt-0.5 text-xs text-soft">
                            Local cluster address (Traefik SSL)
                        </p>
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center gap-2">
                        {status === 'running' && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                                Running
                            </span>
                        )}
                        {status === 'stopped' && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
                                <span className="size-1.5 rounded-full bg-amber-500" />
                                Stopped (Paused)
                            </span>
                        )}
                        {status === 'down' && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/10 px-2.5 py-1 text-xs font-medium text-zinc-500 ring-1 ring-zinc-500/20 dark:text-zinc-400">
                                <span className="size-1.5 rounded-full bg-zinc-400" />
                                Down (Offline)
                            </span>
                        )}
                        {status === 'busy' && activeLifecycle && (
                            <Link
                                href={showRun(activeLifecycle.id).url}
                                className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand ring-1 ring-brand/20 hover:underline"
                            >
                                <span className="size-1.5 animate-ping rounded-full bg-brand" />
                                {activeLifecycle.label}…
                            </Link>
                        )}
                    </div>
                </div>

                {/* Lifecycle Controls Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Up / Rebuild */}
                        <Form action={up(project.id)}>
                            {({ processing }) => (
                                <Button
                                    type="submit"
                                    variant={
                                        status === 'down'
                                            ? 'primary'
                                            : 'secondary'
                                    }
                                    size="sm"
                                    disabled={!canUp || processing}
                                    title={
                                        status === 'running'
                                            ? 'Re-orchestrate and restart containers on local cluster (larakube up)'
                                            : 'Build and start local cluster workloads (larakube up)'
                                    }
                                >
                                    <ArrowUpCircle className="size-3.5" />
                                    <span>
                                        {processing
                                            ? 'Starting…'
                                            : status === 'running'
                                              ? 'Rebuild / Up'
                                              : 'Up (Build & Run)'}
                                    </span>
                                </Button>
                            )}
                        </Form>

                        {/* Start (Resume) */}
                        <Form action={startLifecycle(project.id)}>
                            {({ processing }) => (
                                <Button
                                    type="submit"
                                    variant={
                                        status === 'stopped'
                                            ? 'primary'
                                            : 'secondary'
                                    }
                                    size="sm"
                                    disabled={!canStart || processing}
                                    title={
                                        status === 'running'
                                            ? 'Workloads are already running'
                                            : status === 'down'
                                              ? 'Project is down. Run Up first.'
                                              : 'Resume paused workloads (larakube start)'
                                    }
                                >
                                    <Play className="size-3.5" />
                                    <span>
                                        {processing ? 'Starting…' : 'Start'}
                                    </span>
                                </Button>
                            )}
                        </Form>

                        {/* Stop (Pause) */}
                        <Form action={stopLifecycle(project.id)}>
                            {({ processing }) => (
                                <Button
                                    type="submit"
                                    variant="secondary"
                                    size="sm"
                                    disabled={!canStop || processing}
                                    title={
                                        status === 'stopped'
                                            ? 'Workloads are already stopped'
                                            : status === 'down'
                                              ? 'Project is down'
                                              : 'Pause workloads to save CPU & RAM (larakube stop)'
                                    }
                                >
                                    <Square className="size-3.5" />
                                    <span>
                                        {processing ? 'Stopping…' : 'Stop'}
                                    </span>
                                </Button>
                            )}
                        </Form>
                    </div>

                    {/* Down (Destructive / Teardown) */}
                    <div>
                        <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            disabled={!canDown}
                            onClick={() => setConfirmDownOpen(true)}
                            title={
                                status === 'down'
                                    ? 'Local cluster environment is already down'
                                    : 'Tear down local Kubernetes pods and services (larakube down)'
                            }
                        >
                            <PowerOff className="size-3.5" />
                            <span>Down</span>
                        </Button>
                    </div>
                </div>

                <div className="border-t border-line pt-2.5">
                    <ProjectTldForm project={project} />
                </div>
            </div>

            {/* Confirmation Modal for Down */}
            {confirmDownOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
                    <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
                        <div className="flex items-start gap-3.5">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
                                <PowerOff className="size-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-base font-semibold text-ink">
                                    Tear Down Local Environment?
                                </h3>
                                <p className="mt-1.5 text-xs leading-relaxed text-soft">
                                    This will run{' '}
                                    <code className="rounded bg-paper px-1 py-0.5 font-mono text-ink">
                                        larakube down
                                    </code>{' '}
                                    to remove all Kubernetes pods, deployments,
                                    services, and ingress for{' '}
                                    <strong className="text-ink">
                                        {project.name}
                                    </strong>{' '}
                                    on your local cluster.
                                </p>
                                <p className="mt-2 text-[11px] text-faint">
                                    Your project files, source repository, and
                                    database volumes remain safe and untouched.
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 flex items-center justify-end gap-2.5">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setConfirmDownOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Form
                                action={down(project.id)}
                                onSubmit={() => setConfirmDownOpen(false)}
                            >
                                {({ processing }) => (
                                    <Button
                                        type="submit"
                                        variant="dangerFill"
                                        size="sm"
                                        disabled={processing}
                                    >
                                        <PowerOff className="size-3.5" />
                                        <span>
                                            {processing
                                                ? 'Tearing down…'
                                                : 'Confirm Down'}
                                        </span>
                                    </Button>
                                )}
                            </Form>
                        </div>
                    </div>
                </div>
            )}
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
                    <SelectMenu
                        name="tld"
                        value={tldValue}
                        triggerClassName="h-7 px-2 py-0.5 text-xs"
                        onChange={setTldValue}
                        options={[
                            {
                                value: '',
                                label: `Default (.${project.globalTld || 'kube'})`,
                            },
                            { value: 'test', label: '.test' },
                            { value: 'kube', label: '.kube' },
                            { value: 'localhost', label: '.localhost' },
                            { value: 'local', label: '.local' },
                            { value: 'internal', label: '.internal' },
                        ]}
                    />
                    <Button
                        type="submit"
                        variant="secondary"
                        size="sm"
                        disabled={
                            processing || tldValue === (project.localTld ?? '')
                        }
                    >
                        {processing ? (
                            <RotateCw className="size-3 animate-spin" />
                        ) : (
                            <Save className="size-3" />
                        )}
                        <span>{processing ? 'Saving…' : 'Save'}</span>
                    </Button>
                </>
            )}
        </Form>
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
