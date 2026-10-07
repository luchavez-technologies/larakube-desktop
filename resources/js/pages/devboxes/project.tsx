import { Deferred, Link, router, usePoll } from '@inertiajs/react';
import { useState } from 'react';
import {
    Laptop,
    Cloud,
    Code2,
    ArrowUpCircle,
    ChevronDown,
    ExternalLink,
    Terminal,
    Share2,
    Trash2,
    Globe,
    Server,
} from 'lucide-react';
import BackingServicesCard from '@/components/backing-services-card';
import BoxProjectActions from '@/components/box-project-actions';
import Button, { buttonClass } from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import EnvironmentSecretsCard from '@/components/environment-secrets-card';
import { ListRow, TwoLine } from '@/components/list-row';
import PageHeader from '@/components/page-header';
import ProjectTerminalCard, {
    type ProjectRun,
} from '@/components/project-terminal-card';
import RecentRunsCard, { type RecentRun } from '@/components/recent-runs-card';
import StatusPill from '@/components/status-pill';
import WorkloadScalingCard from '@/components/workload-scaling-card';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import { open } from '@/routes';
import { show as showBox, shareDomainPage } from '@/routes/devboxes';
import { index } from '@/routes/projects';
import type {
    BackingServices,
    DevBoxProject,
    Project,
    ProjectEnvironment,
} from '@/types/larakube';

type Props = {
    box: string;
    name: string;
    devBox?: {
        name: string;
        ip: string | null;
        sshKey: string | null;
    };
    details?: DevBoxProject | { state: 'unreachable' | 'missing' };
    blueprint?: Project | null;
    backing?: BackingServices | null;
    sharing?: Sharing | null;
    endpoints?: {
        operate: string;
        scaling: {
            replicas: string;
            autoscale: string;
            resources: string;
        };
        dotenv: {
            status: string;
            push: string;
            pull: string;
        };
    };
    runs: RecentRun[];
    latestRun: ProjectRun | null;
};

export default function ShowDevBoxProject({
    box,
    name,
    devBox,
    details,
    blueprint,
    backing,
    sharing,
    endpoints,
    runs,
    latestRun,
}: Props) {
    const [activeEnv, setActiveEnv] = useState('local');

    // Follow an action that is still running until it finishes.
    usePoll(
        2000,
        { only: ['runs', 'latestRun', 'details'] },
        { autoStart: latestRun?.status === 'running', keepAlive: false },
    );

    const environments = blueprint?.environments ?? {
        local: {
            name: 'local',
            isLocal: true,
            webHost: `${name}.test`,
            serverIp: null,
            plex: [],
            managed: [],
            components: ['web'],
            replicas: {},
            autoscale: {},
            resources: {},
            ci: {
                platform: 'github',
                repoSlug: null,
                hasWorkflow: false,
                branch: 'main',
                registry: null,
                securityAudit: null,
            },
        },
    };

    const currentEnvConfig: ProjectEnvironment = environments[activeEnv] ??
        environments['local'] ?? {
            name: activeEnv,
            isLocal: activeEnv === 'local',
            webHost: null,
            serverIp: null,
            plex: [],
            managed: [],
            components: ['web'],
            replicas: {},
            autoscale: {},
            resources: {},
            ci: {
                platform: 'github',
                repoSlug: null,
                hasWorkflow: false,
                branch: 'main',
                registry: null,
                securityAudit: null,
            },
        };

    const cloudEnvs = Object.values(environments).filter((e) => !e.isLocal);

    return (
        <AppLayout title={`${name} · ${box}`}>
            <Link
                href={index({ query: { box } }).url}
                className="mb-3 inline-block text-xs text-soft hover:text-ink"
            >
                ← Projects
            </Link>

            <Deferred
                data="details"
                fallback={
                    <PageHeader title={name} meta={<span>On {box}</span>} />
                }
            >
                <Header
                    box={box}
                    name={name}
                    devBox={devBox}
                    details={details}
                />
            </Deferred>

            <Deferred
                data="details"
                fallback={
                    <div className="h-40 animate-pulse rounded-2xl bg-surface ring-1 ring-line" />
                }
            >
                {details && !('state' in details) ? (
                    <div className="space-y-6">
                        {/* Multi-Environment Tab Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-paper/60 p-1.5 shadow-2xs backdrop-blur-xs">
                            <div className="flex flex-wrap items-center gap-1.5">
                                {/* Local Dev Tab */}
                                <button
                                    type="button"
                                    onClick={() => setActiveEnv('local')}
                                    className={cn(
                                        'flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all',
                                        activeEnv === 'local'
                                            ? 'bg-surface text-ink shadow-2xs ring-1 ring-line'
                                            : 'text-soft hover:bg-paper hover:text-ink',
                                    )}
                                >
                                    <Laptop className="size-3.5 text-brand" />
                                    <span>DevBox Local</span>
                                    {details.local === 'running' && (
                                        <span className="size-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
                                    )}
                                </button>

                                {cloudEnvs.length > 0 && (
                                    <div className="mx-1 h-5 w-px shrink-0 bg-line" />
                                )}

                                {/* Cloud Environment Tabs */}
                                {cloudEnvs.map((env) => {
                                    const isSelected = activeEnv === env.name;
                                    const isDeploying = runs.some(
                                        (r) =>
                                            r.kind === 'deploy-app' &&
                                            r.status === 'running' &&
                                            (r.label.includes(
                                                `(${env.name})`,
                                            ) ||
                                                (!r.label.includes('(') &&
                                                    env.name === 'production')),
                                    );

                                    return (
                                        <button
                                            key={env.name}
                                            type="button"
                                            onClick={() =>
                                                setActiveEnv(env.name)
                                            }
                                            className={cn(
                                                'flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all',
                                                isSelected
                                                    ? 'bg-surface text-ink shadow-2xs ring-1 ring-line'
                                                    : 'text-soft hover:bg-paper hover:text-ink',
                                            )}
                                        >
                                            <Cloud className="size-3.5" />
                                            <span className="capitalize">
                                                {env.name}
                                            </span>
                                            {isDeploying && (
                                                <span className="size-2 animate-ping rounded-full bg-brand" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Active Environment Deploy Button */}
                            {activeEnv !== 'local' && endpoints?.operate && (
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => {
                                        router.post(
                                            `${endpoints.operate}/deploy`,
                                            { environment: activeEnv },
                                            { preserveScroll: true },
                                        );
                                    }}
                                    className="gap-1.5"
                                >
                                    <ArrowUpCircle className="size-3.5" />
                                    <span>Deploy to {activeEnv}</span>
                                </Button>
                            )}
                        </div>

                        {/* Main Grid */}
                        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                            <div className="flex flex-col gap-5">
                                {activeEnv === 'local' ? (
                                    <>
                                        <DevelopmentCard
                                            box={box}
                                            project={details}
                                        />

                                        <WorkloadScalingCard
                                            project={{ name }}
                                            activeEnv="local"
                                            activeEnvConfig={currentEnvConfig}
                                            customEndpoints={endpoints?.scaling}
                                        />

                                        <EnvironmentSecretsCard
                                            project={{ name }}
                                            activeEnv="local"
                                            activeEnvConfig={currentEnvConfig}
                                            customEndpoints={endpoints?.dotenv}
                                        />

                                        <Deferred
                                            data="backing"
                                            fallback={
                                                <div className="h-40 animate-pulse rounded-2xl bg-surface ring-1 ring-line" />
                                            }
                                        >
                                            <BackingServicesCard
                                                label="Backing Services · DEVBOX LOCAL"
                                                services={backing}
                                                hasCommons={
                                                    backing?.commons ?? false
                                                }
                                            />
                                        </Deferred>

                                        <Deferred
                                            data="sharing"
                                            fallback={
                                                <div className="h-24 animate-pulse rounded-2xl bg-surface ring-1 ring-line" />
                                            }
                                        >
                                            <SharingCard
                                                box={box}
                                                project={details}
                                                sharing={sharing}
                                            />
                                        </Deferred>
                                    </>
                                ) : (
                                    <>
                                        <CloudEnvironmentCard
                                            envName={activeEnv}
                                            envConfig={currentEnvConfig}
                                            endpoints={endpoints}
                                        />

                                        <WorkloadScalingCard
                                            project={{ name }}
                                            activeEnv={activeEnv}
                                            activeEnvConfig={currentEnvConfig}
                                            customEndpoints={endpoints?.scaling}
                                        />

                                        <EnvironmentSecretsCard
                                            project={{ name }}
                                            activeEnv={activeEnv}
                                            activeEnvConfig={currentEnvConfig}
                                            customEndpoints={endpoints?.dotenv}
                                        />

                                        <Deferred
                                            data="backing"
                                            fallback={
                                                <div className="h-40 animate-pulse rounded-2xl bg-surface ring-1 ring-line" />
                                            }
                                        >
                                            <BackingServicesCard
                                                label={`Backing Services · ${activeEnv.toUpperCase()}`}
                                                services={backing}
                                                hasCommons={
                                                    backing?.commons ?? false
                                                }
                                            />
                                        </Deferred>
                                    </>
                                )}

                                {latestRun && (
                                    <ProjectTerminalCard run={latestRun} />
                                )}
                            </div>

                            <div className="flex flex-col gap-5">
                                <DevBoxConnectionCard
                                    box={box}
                                    project={details}
                                    devBox={devBox}
                                />
                                <RecentRunsCard
                                    runs={runs}
                                    activeEnv={activeEnv}
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    <Card tone="warn">
                        <p className="text-sm">
                            {details &&
                            'state' in details &&
                            details.state === 'missing'
                                ? `${box} answered, but ${name} is not in ~/projects there. Only apps in that folder are listed.`
                                : `${box} did not answer in time. It may be busy (an Up can take a while on a small box) or unreachable. Reload in a moment.`}
                        </p>
                    </Card>
                )}
            </Deferred>
        </AppLayout>
    );
}

function Header({
    box,
    name,
    devBox,
    details,
}: {
    box: string;
    name: string;
    devBox?: {
        name: string;
        ip: string | null;
        sshKey: string | null;
    };
    details?: DevBoxProject | { state: 'unreachable' | 'missing' };
}) {
    const project = details && !('state' in details) ? details : null;
    const [editorMenuOpen, setEditorMenuOpen] = useState(false);

    return (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <PageHeader
                title={name}
                badge={
                    project?.framework ? (
                        <StatusPill tone="muted">
                            {project.framework}
                        </StatusPill>
                    ) : undefined
                }
                meta={
                    <span>
                        <Link
                            href={showBox({ box }).url}
                            className="hover:text-ink hover:underline"
                        >
                            {box}
                        </Link>
                        {project ? ` · ${project.path}` : ''}
                    </span>
                }
            />

            <div className="flex flex-wrap items-center gap-2">
                {devBox?.ip && (
                    <div className="relative">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditorMenuOpen((o) => !o)}
                            className="gap-1.5"
                            title="Open project in remote IDE"
                        >
                            <Code2 className="size-3.5 text-brand" />
                            <span>Open in Editor</span>
                            <ChevronDown className="size-3 text-soft" />
                        </Button>

                        {editorMenuOpen && (
                            <div className="absolute right-0 z-20 mt-1.5 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
                                <Link
                                    href={open().url}
                                    method="post"
                                    data={{
                                        url: `vscode://vscode-remote/ssh-remote+larakube@${devBox.ip}/home/larakube/projects/${name}`,
                                    }}
                                    as="button"
                                    onClick={() => setEditorMenuOpen(false)}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-ink transition hover:bg-paper"
                                >
                                    <Code2 className="size-3.5 text-blue-500" />
                                    <span>VS Code (Remote SSH)</span>
                                </Link>

                                <Link
                                    href={open().url}
                                    method="post"
                                    data={{
                                        url: `cursor://vscode-remote/ssh-remote+larakube@${devBox.ip}/home/larakube/projects/${name}`,
                                    }}
                                    as="button"
                                    onClick={() => setEditorMenuOpen(false)}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-ink transition hover:bg-paper"
                                >
                                    <Code2 className="size-3.5 text-purple-500" />
                                    <span>Cursor (Remote SSH)</span>
                                </Link>

                                <div className="my-1 border-t border-line" />

                                <div className="px-2.5 py-1.5">
                                    <span className="block text-[11px] font-medium text-soft">
                                        Terminal SSH Command:
                                    </span>
                                    <div className="mt-1 flex items-center justify-between gap-1 rounded bg-paper px-2 py-1 font-mono text-[11px] text-ink">
                                        <span className="truncate">
                                            ssh larakube@{devBox.ip}
                                        </span>
                                        <CopyButton
                                            value={`ssh -i ${devBox.sshKey ?? '~/.ssh/id_rsa'} larakube@${devBox.ip}`}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <Link
                    href={showBox({ box }).url}
                    className={buttonClass('secondary', 'sm')}
                    title="View dev box details"
                >
                    <Server className="size-3.5" />
                    <span>DevBox</span>
                </Link>
            </div>
        </div>
    );
}

function DevelopmentCard({
    box,
    project,
}: {
    box: string;
    project: DevBoxProject;
}) {
    const host = project.environments[0]?.host;
    const running = project.local === 'running';

    return (
        <Card label={`Development on ${box}`}>
            <div className="space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        {host ? (
                            <span className="font-mono text-sm font-medium">
                                https://{host}
                            </span>
                        ) : (
                            <span className="text-sm text-soft">
                                No web host configured
                            </span>
                        )}
                        <p className="text-xs text-soft">
                            This address resolves locally on the box. To access
                            externally, share it via Cloudflare tunnel below.
                        </p>
                    </div>
                    <StatusPill tone={running ? 'ok' : 'muted'}>
                        {running ? 'Running' : 'Stopped'}
                    </StatusPill>
                </div>
                <BoxProjectActions box={box} project={project} />
            </div>
            <div className="mt-3 border-t border-line pt-1">
                <ListRow action={<CopyButton value={`cd ${project.path}`} />}>
                    <TwoLine
                        title="Folder on the box"
                        detail={project.path}
                        mono
                    />
                </ListRow>
            </div>
        </Card>
    );
}

function CloudEnvironmentCard({
    envName,
    envConfig,
    endpoints,
}: {
    envName: string;
    envConfig: ProjectEnvironment;
    endpoints?: { operate: string };
}) {
    const host = envConfig.webHost;
    const serverContext = envConfig.serverContext ?? envConfig.serverIp;

    return (
        <Card
            label={`Cloud Deployment · ${envName.toUpperCase()}`}
            action={
                endpoints?.operate ? (
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                            router.post(
                                `${endpoints.operate}/deploy`,
                                { environment: envName },
                                { preserveScroll: true },
                            );
                        }}
                        className="gap-1.5"
                    >
                        <ArrowUpCircle className="size-3.5" />
                        <span>Deploy</span>
                    </Button>
                ) : undefined
            }
        >
            <div className="space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        {host ? (
                            <div className="flex items-center gap-2">
                                <Globe className="size-4 text-ink" />
                                <span className="font-mono text-sm font-medium text-ink">
                                    https://{host}
                                </span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <Globe className="size-4 text-soft" />
                                <span className="text-sm text-soft">
                                    No public host domain configured
                                </span>
                            </div>
                        )}
                        <p className="mt-1 text-xs text-soft">
                            {serverContext
                                ? `Target cluster: ${serverContext}`
                                : 'Cluster not linked yet. Configure server linking to deploy.'}
                        </p>
                    </div>
                    <StatusPill tone={serverContext ? 'ok' : 'muted'}>
                        {serverContext ? 'Linked' : 'Unlinked'}
                    </StatusPill>
                </div>

                <div className="border-t border-line pt-2 text-xs text-soft">
                    <span>
                        Components deployed to Kubernetes:{' '}
                        <code className="font-mono text-ink">
                            {(envConfig.components ?? ['web']).join(', ')}
                        </code>
                    </span>
                </div>
            </div>
        </Card>
    );
}

type Sharing = {
    zone: string | null;
    urls: Record<string, string>;
    running: boolean;
};

const serviceLabels: Record<string, string> = {
    web: 'App',
    hmr: 'Vite hot reload',
    reverb: 'Reverb',
    storage: 'File storage',
    'storage-console': 'Storage console',
};

function SharingCard({
    box,
    project,
    sharing,
}: {
    box: string;
    project: DevBoxProject;
    sharing?: Sharing | null;
}) {
    const running = project.local === 'running';
    const names = Object.entries(sharing?.urls ?? {});
    const hasNames = names.length > 0;

    return (
        <Card
            label="Share via Cloudflare Tunnel"
            action={
                hasNames ? (
                    <StatusPill tone={sharing?.running ? 'ok' : 'warn'}>
                        {sharing?.running ? 'Active' : 'Tunnel stopped'}
                    </StatusPill>
                ) : undefined
            }
        >
            {hasNames && (
                <div className="mb-3 divide-y divide-line">
                    {names.map(([key, url]) => (
                        <div
                            key={key}
                            className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                        >
                            <div className="min-w-0">
                                <p className="text-xs text-soft">
                                    {serviceLabels[key] ?? key}
                                </p>
                                <p className="truncate font-mono text-sm">
                                    {url}
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <CopyButton value={url} />
                                {key === 'web' && (
                                    <Link
                                        href={open().url}
                                        method="post"
                                        data={{ url }}
                                        as="button"
                                        className={cn(
                                            buttonClass('secondary', 'sm'),
                                            'gap-1.5',
                                        )}
                                    >
                                        <ExternalLink className="size-3.5" />
                                        <span>Open</span>
                                    </Link>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {!running ? (
                <p className="text-sm text-soft">
                    {hasNames
                        ? 'Start the app to use these names.'
                        : 'Start the app first, then share it.'}
                </p>
            ) : (
                <div className="flex flex-wrap items-center gap-2">
                    <Link
                        href={
                            shareDomainPage({ box, project: project.name }).url
                        }
                        title="Public names under your own Cloudflare domain: app, Vite, Reverb and storage"
                        className={cn(
                            buttonClass(
                                hasNames ? 'secondary' : 'primary',
                                'sm',
                            ),
                            'gap-1.5',
                        )}
                    >
                        <Share2 className="size-3.5" />
                        <span>Share Domain</span>
                    </Link>
                    {hasNames && (
                        <Link
                            href={
                                shareDomainPage({
                                    box,
                                    project: project.name,
                                }).url
                            }
                            title="Take the public names down"
                            className={cn(
                                buttonClass('ghost', 'sm'),
                                'gap-1.5',
                            )}
                        >
                            <Trash2 className="size-3.5 text-accent" />
                            <span>Remove names</span>
                        </Link>
                    )}
                </div>
            )}
        </Card>
    );
}

function DevBoxConnectionCard({
    box,
    project,
    devBox,
}: {
    box: string;
    project: DevBoxProject;
    devBox?: {
        name: string;
        ip: string | null;
        sshKey: string | null;
    };
}) {
    return (
        <Card label="Connection & Host Info">
            <div className="space-y-3">
                <ListRow>
                    <TwoLine title="Dev Box Name" detail={box} />
                </ListRow>

                {devBox?.ip && (
                    <ListRow
                        action={
                            <CopyButton
                                value={`ssh -i ${devBox.sshKey ?? '~/.ssh/id_rsa'} larakube@${devBox.ip}`}
                            />
                        }
                    >
                        <TwoLine
                            title="SSH Endpoint"
                            detail={`larakube@${devBox.ip}`}
                            mono
                        />
                    </ListRow>
                )}

                <ListRow action={<CopyButton value={project.path} />}>
                    <TwoLine
                        title="Remote Directory"
                        detail={project.path}
                        mono
                    />
                </ListRow>

                <div className="rounded-xl border border-line bg-paper/60 p-2.5 text-xs text-soft">
                    <div className="flex items-center gap-1.5 font-medium text-ink">
                        <Terminal className="size-3.5 text-brand" />
                        <span>Remote SSH Parity</span>
                    </div>
                    <p className="mt-1 text-[11px]">
                        Commands and scaling actions execute directly on this
                        box. Project code is stored remotely in{' '}
                        <code className="font-mono text-ink">~/projects</code>.
                    </p>
                </div>
            </div>
        </Card>
    );
}
