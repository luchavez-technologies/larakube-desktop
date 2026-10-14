import { Deferred, Form, Link, usePage } from '@inertiajs/react';
import { useState } from 'react';
import {
    Activity,
    ArrowRight,
    ExternalLink,
    FlaskConical,
    FolderGit2,
    Globe,
    HardDrive,
    Plus,
    RotateCw,
    ShieldCheck,
    SquareTerminal,
    Trash2,
    Upload,
    UserPlus,
    Users,
    Wrench,
    X,
    XCircle,
} from 'lucide-react';
import Button, { buttonClass } from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import {
    DestroyServerDialog,
    RepairServerDialog,
    ResizeServerDialog,
} from '@/components/server-dialogs';
import DiagnoseCard from '@/components/diagnose-card';
import { ListRow, TwoLine } from '@/components/list-row';
import PageHeader from '@/components/page-header';
import ProviderLogo from '@/components/provider-logo';
import Redactable from '@/components/redactable';
import SelectMenu from '@/components/select-menu';
import StatusPill, { type Tone } from '@/components/status-pill';
import ToolLogo from '@/components/tool-logo';
import RadialGauge from '@/components/metrics/radial-gauge';
import AppLayout from '@/layouts/app-layout';
import { serverStatus } from '@/lib/servers';
import { ExternalLinkButton } from '@/lib/open-external';
import { cn } from '@/lib/utils';
import {
    create as projectsCreate,
    index as projectsIndex,
    show as showProject,
} from '@/routes/projects';
import { dns, index, terminal, tls } from '@/routes/servers';
import { index as toolsIndex, show as showTool } from '@/routes/servers/tools';
import BackupsCard from '@/pages/servers/backups-card';
import PlexCommonsCard, { CheckingRow } from '@/components/plex-commons-card';
import { providerLabels, toolName, toolTagline } from '@/types/larakube';
import type {
    BackupStatus,
    ClusterTool,
    ClusterUser,
    DiagnoseReport,
    NodeMetrics,
    PlexStatus,
    Project,
    Provider,
    Server,
} from '@/types/larakube';

type DnsGroup = {
    group: string;
    zones: string[];
    ready: boolean;
    provider?: string;
};
type TlsReport = {
    challenge: 'dns' | 'http' | 'local';
    provider?: string;
    zones?: string[];
    cannotRenew?: string[];
};
type Dialog =
    | 'destroy'
    | 'domain'
    | 'ssl'
    | 'grantAccess'
    | 'repair'
    | 'resize'
    | null;

export default function ShowServer({
    server,
    projects,
    lastVerifiedTools,
    tools: verifiedTools,
    dns: dnsGroups,
    tls: tlsReport,
    plex,
    backup,
    clusterUsers,
    nodeMetrics,
    reachable,
    diagnosis,
    providers,
    k9sInstalled,
}: {
    server: Server;
    projects?: Project[];
    lastVerifiedTools?: ClusterTool[] | null;
    tools?: ClusterTool[] | null;
    dns?: DnsGroup[] | null;
    tls?: TlsReport | null;
    plex?: PlexStatus | null;
    backup?: BackupStatus | null;
    clusterUsers?: ClusterUser[] | null;
    nodeMetrics?: NodeMetrics | null;
    /** The live kubectl reachability check — optimistically true until it loads, so a healthy cluster never flashes a warning. */
    reachable?: boolean;
    diagnosis?: DiagnoseReport | null;
    providers?: Provider[] | null;
    k9sInstalled: boolean;
}) {
    const { url } = usePage();
    const [dialog, setDialog] = useState<Dialog>(() => {
        // "?step=domain|ssl" opens that dialog, e.g. from a finished create run.
        const step = new URLSearchParams(url.split('?')[1] ?? '').get('step');
        return server.status === 'ready' &&
            (step === 'domain' || step === 'ssl')
            ? step
            : null;
    });
    const [revokingUser, setRevokingUser] = useState<ClusterUser | null>(null);
    const ready = server.status === 'ready';
    const unreachable = ready && reachable === false;
    const [label, tone]: [string, Tone] = unreachable
        ? ['Unreachable', 'warn']
        : serverStatus[server.status];

    const allTools = verifiedTools ?? lastVerifiedTools;
    const installedTools = allTools
        ? allTools.filter((t) => t.installed)
        : null;

    return (
        <AppLayout title={server.name}>
            <Link
                href={index().url}
                className="mb-3 inline-block text-xs text-soft hover:text-ink"
            >
                ← Servers
            </Link>
            <PageHeader
                title={server.name}
                badge={<StatusPill tone={tone}>{label}</StatusPill>}
                meta={[
                    <span
                        key="provider"
                        className="inline-flex items-center gap-1.5"
                    >
                        <ProviderLogo provider={server.provider} size="xs" />
                        <span>
                            {providerLabels[server.provider] ?? server.provider}
                        </span>
                    </span>,
                    server.account && (
                        <span
                            key="account"
                            className="inline-flex items-center gap-1.5"
                        >
                            <Users className="size-3 text-soft" />
                            <Redactable value={server.account} kind="account" />
                        </span>
                    ),
                    server.region && <span key="region">{server.region}</span>,
                    server.ip && (
                        <span key="ip">
                            <Redactable value={server.ip} kind="ip" />
                        </span>
                    ),
                    <span key="kind">
                        {server.kind === 'vps'
                            ? 'single-node k3s'
                            : server.kind}
                    </span>,
                ].filter(Boolean)}
            />

            {!ready && (
                <Card tone="warn" className="mb-4">
                    <p className="text-sm font-semibold text-warn">
                        This server never finished setting up
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed">
                        Anything the provider already created is tracked by
                        LaraKube. Destroy it to stop billing, then create the
                        server again.
                    </p>
                </Card>
            )}

            <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-4.5">
                <div className="flex flex-col gap-4.5">
                    {server.kind === 'vps' && (unreachable || ready) && (
                        <Deferred
                            data="diagnosis"
                            fallback={
                                <Card label="Diagnose">
                                    <CheckingRow title="Checking cluster health…" />
                                </Card>
                            }
                        >
                            <DiagnoseCard
                                diagnosis={diagnosis}
                                unreachable={unreachable}
                                onRepair={() => setDialog('repair')}
                                onResize={() => setDialog('resize')}
                            />
                        </Deferred>
                    )}

                    {ready && (
                        <Deferred
                            data="nodeMetrics"
                            fallback={
                                <Card label="Cluster Hardware & Capacity">
                                    <CheckingRow title="Checking cluster hardware metrics…" />
                                </Card>
                            }
                        >
                            <NodeMetricsCard metrics={nodeMetrics} />
                        </Deferred>
                    )}

                    <Card label="Domain & SSL">
                        <Deferred
                            data="dns"
                            fallback={<CheckingRow title="Connect a domain" />}
                        >
                            <DomainRow
                                groups={dnsGroups}
                                disabled={!ready}
                                onSetUp={() => setDialog('domain')}
                            />
                        </Deferred>
                        <Deferred
                            data="tls"
                            fallback={
                                <CheckingRow title="Automatic SSL certificates" />
                            }
                        >
                            <SslRow
                                report={tlsReport}
                                disabled={!ready}
                                onEnable={() => setDialog('ssl')}
                            />
                        </Deferred>
                    </Card>

                    <Card
                        label={`Hosted Projects${projects && projects.length > 0 ? ` · ${projects.length}` : ''}`}
                        action={
                            ready ? (
                                <Link
                                    href={projectsIndex().url}
                                    className={buttonClass('ghost', 'sm')}
                                >
                                    View all
                                </Link>
                            ) : null
                        }
                    >
                        {!projects || projects.length === 0 ? (
                            <div className="py-6 text-center">
                                <FolderGit2 className="mx-auto mb-2 size-8 text-faint" />
                                <p className="text-sm font-medium text-ink">
                                    No projects hosted on this server yet
                                </p>
                                <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-soft">
                                    Deploy an app from your workspace or create
                                    a new one and link it to {server.name}.
                                </p>
                                {ready && (
                                    <div className="mt-4 flex items-center justify-center gap-2.5">
                                        <Link
                                            href={projectsIndex().url}
                                            className={buttonClass(
                                                'secondary',
                                                'sm',
                                            )}
                                        >
                                            <FolderGit2 className="size-3.5" />
                                            <span>Browse Projects</span>
                                        </Link>
                                        <Link
                                            href={projectsCreate().url}
                                            className={buttonClass(
                                                'primary',
                                                'sm',
                                            )}
                                        >
                                            <Plus className="size-3.5" />
                                            <span>New Project</span>
                                        </Link>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="divide-y divide-line">
                                {projects.map((project) => {
                                    const matchingEnvs = Object.values(
                                        project.environments ?? {},
                                    ).filter(
                                        (env) =>
                                            (server.ip &&
                                                env.serverIp === server.ip) ||
                                            (server.context &&
                                                env.serverContext ===
                                                    server.context),
                                    );

                                    return (
                                        <div
                                            key={project.id}
                                            className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <Link
                                                        href={
                                                            showProject(
                                                                project.id,
                                                            ).url
                                                        }
                                                        className="truncate text-sm font-semibold hover:underline"
                                                    >
                                                        {project.name}
                                                    </Link>
                                                    <span className="rounded bg-paper px-2 py-0.5 text-[11px] font-medium text-soft capitalize">
                                                        {project.framework ??
                                                            'laravel'}
                                                    </span>
                                                    {matchingEnvs.map((env) => (
                                                        <span
                                                            key={env.name}
                                                            className="rounded bg-paper px-1.5 py-0.5 font-mono text-[10px] text-soft"
                                                        >
                                                            {env.name}
                                                        </span>
                                                    ))}
                                                </div>
                                                <div className="mt-0.5 flex items-center gap-3 text-xs text-soft">
                                                    {project.webHost ? (
                                                        <span className="font-mono text-ink">
                                                            {project.webHost}
                                                        </span>
                                                    ) : (
                                                        <span>
                                                            No web host
                                                            configured
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <Link
                                                href={
                                                    showProject(project.id).url
                                                }
                                                className={buttonClass(
                                                    'secondary',
                                                    'sm',
                                                )}
                                            >
                                                <span>Manage</span>
                                                <ArrowRight className="size-3.5" />
                                            </Link>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Card>

                    <Card
                        label={`Cluster Tools${installedTools && installedTools.length > 0 ? ` · ${installedTools.length}` : ''}`}
                        action={
                            ready ? (
                                <Link
                                    href={toolsIndex(server.name).url}
                                    className={buttonClass('ghost', 'sm')}
                                >
                                    <Wrench className="size-3.5" />
                                    <span>Browse catalog</span>
                                </Link>
                            ) : null
                        }
                    >
                        {allTools == null || installedTools == null ? (
                            <CheckingRow title="Checking cluster tools…" />
                        ) : installedTools.length === 0 ? (
                            <div className="py-6 text-center">
                                <Wrench className="mx-auto mb-2 size-8 text-faint" />
                                <p className="text-sm font-medium text-ink">
                                    No cluster tools installed yet
                                </p>
                                <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-soft">
                                    Equip your server with Stalwart Mail,
                                    Authentik SSO, NetBird VPN, Vaultwarden,
                                    GlitchTip, and more in one click.
                                </p>
                                {ready && (
                                    <div className="mt-4 flex justify-center">
                                        <Link
                                            href={toolsIndex(server.name).url}
                                            className={buttonClass(
                                                'primary',
                                                'sm',
                                            )}
                                        >
                                            <Plus className="size-3.5" />
                                            <span>Browse tools catalog</span>
                                        </Link>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="divide-y divide-line">
                                {installedTools.map((tool) => {
                                    const url = tool.url?.split(' ')[0] ?? null;
                                    const name = toolName(tool);
                                    const tagline = toolTagline(tool);
                                    const href = showTool(
                                        {
                                            server: server.name,
                                            tool: tool.tool,
                                        },
                                        tool.host
                                            ? {
                                                  query: {
                                                      domain: tool.host,
                                                  },
                                              }
                                            : undefined,
                                    ).url;

                                    return (
                                        <div
                                            key={`${tool.tool}-${tool.host || 'default'}`}
                                            className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
                                        >
                                            <div className="flex min-w-0 items-center gap-3">
                                                <ToolLogo
                                                    tool={tool}
                                                    size="md"
                                                />
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <Link
                                                            href={href}
                                                            className="truncate text-sm font-semibold hover:underline"
                                                        >
                                                            {name}
                                                        </Link>
                                                        {tagline && (
                                                            <span className="max-w-[200px] truncate rounded bg-paper px-1.5 py-0.5 text-[10px] font-medium text-soft">
                                                                {tagline}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="truncate text-xs text-soft">
                                                        {tool.host ? (
                                                            <span className="font-mono text-ink">
                                                                {tool.host}
                                                            </span>
                                                        ) : (
                                                            tool.label
                                                        )}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-2">
                                                {url && (
                                                    <ExternalLinkButton
                                                        url={url}
                                                        className={buttonClass(
                                                            'secondary',
                                                            'sm',
                                                        )}
                                                    >
                                                        <span>Open</span>
                                                        <ExternalLink className="size-3" />
                                                    </ExternalLinkButton>
                                                )}
                                                <Link
                                                    href={href}
                                                    className={buttonClass(
                                                        'ghost',
                                                        'sm',
                                                    )}
                                                >
                                                    Details
                                                </Link>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Card>

                    <Deferred
                        data="plex"
                        fallback={
                            <Card label="Plex Commons">
                                <CheckingRow title="Checking Plex Commons…" />
                            </Card>
                        }
                    >
                        <PlexCommonsCard
                            server={server}
                            plex={plex}
                            disabled={!ready}
                        />
                    </Deferred>

                    <Deferred
                        data="backup"
                        fallback={
                            <Card label="Backups">
                                <CheckingRow title="Checking backups…" />
                            </Card>
                        }
                    >
                        <BackupsCard
                            server={server}
                            backup={backup}
                            disabled={!ready}
                        />
                    </Deferred>
                </div>

                <div className="flex flex-col gap-4.5">
                    {ready && (
                        <Card label="Connection">
                            {server.context && (
                                <ListRow
                                    stack
                                    action={
                                        <div className="flex items-center gap-1.5">
                                            <CopyButton
                                                value={server.context}
                                            />
                                            <Link
                                                href={terminal(server.name).url}
                                                method="post"
                                                data={{ type: 'kubectl' }}
                                                as="button"
                                                disabled={!k9sInstalled}
                                                title={
                                                    k9sInstalled
                                                        ? 'Open k9s for this context in a terminal'
                                                        : 'Install k9s from Setup to use this'
                                                }
                                                className={buttonClass(
                                                    'ghost',
                                                    'sm',
                                                )}
                                            >
                                                <SquareTerminal className="size-3.5" />
                                                <span>Open in Terminal</span>
                                            </Link>
                                        </div>
                                    }
                                >
                                    <TwoLine
                                        title="kubectl context"
                                        detail={
                                            <Redactable
                                                value={server.context}
                                                kind="account"
                                            />
                                        }
                                        mono
                                        truncate={false}
                                    />
                                </ListRow>
                            )}
                            <ListRow
                                stack
                                action={
                                    <div className="flex items-center gap-1.5">
                                        <CopyButton
                                            value={`ssh ${server.name}`}
                                        />
                                        <Link
                                            href={terminal(server.name).url}
                                            method="post"
                                            data={{ type: 'ssh' }}
                                            as="button"
                                            title="Open an SSH session in a terminal"
                                            className={buttonClass(
                                                'ghost',
                                                'sm',
                                            )}
                                        >
                                            <SquareTerminal className="size-3.5" />
                                            <span>Open in Terminal</span>
                                        </Link>
                                    </div>
                                }
                            >
                                <TwoLine
                                    title="SSH"
                                    detail={`ssh ${server.name}`}
                                    mono
                                    truncate={false}
                                />
                            </ListRow>
                            <ListRow>
                                <TwoLine
                                    title="Login user"
                                    detail="larakube (root login disabled)"
                                    mono
                                />
                            </ListRow>
                        </Card>
                    )}

                    <Deferred
                        data="clusterUsers"
                        fallback={
                            <Card label="Team Access & RBAC">
                                <CheckingRow title="Checking team access…" />
                            </Card>
                        }
                    >
                        <TeamAccessCard
                            users={clusterUsers}
                            disabled={!ready}
                            onGrant={() => setDialog('grantAccess')}
                            onRevoke={(user) => setRevokingUser(user)}
                        />
                    </Deferred>

                    <Card label="Danger zone" tone="danger">
                        <p className="mt-1 mb-3 text-[13px] leading-relaxed text-soft">
                            {ready
                                ? 'Destroying deletes the server, its firewall rules and everything on it. Billing stops.'
                                : 'Removes whatever the unfinished setup created so you stop being billed.'}
                        </p>
                        <Button
                            variant="danger"
                            onClick={() => setDialog('destroy')}
                        >
                            <Trash2 className="size-4" />
                            <span>
                                {ready ? 'Destroy server' : 'Destroy leftovers'}
                            </span>
                        </Button>
                    </Card>
                </div>
            </div>

            {dialog === 'destroy' && (
                <DestroyServerDialog
                    server={server}
                    onClose={() => setDialog(null)}
                />
            )}
            {dialog === 'repair' && (
                <RepairServerDialog
                    server={server}
                    onClose={() => setDialog(null)}
                />
            )}
            {dialog === 'resize' && (
                <ResizeServerDialog
                    server={server}
                    providers={providers}
                    onClose={() => setDialog(null)}
                />
            )}
            {dialog === 'domain' && (
                <ConnectDomainDialog
                    server={server}
                    onClose={() => setDialog(null)}
                />
            )}
            {dialog === 'ssl' && (
                <EnableSslDialog
                    server={server}
                    dnsGroups={dnsGroups}
                    onClose={() => setDialog(null)}
                />
            )}
            {dialog === 'grantAccess' && (
                <GrantAccessDialog
                    server={server}
                    onClose={() => setDialog(null)}
                />
            )}
            {revokingUser && (
                <RevokeAccessDialog
                    server={server}
                    user={revokingUser}
                    onClose={() => setRevokingUser(null)}
                />
            )}
        </AppLayout>
    );
}

function NodeMetricsCard({ metrics }: { metrics?: NodeMetrics | null }) {
    if (!metrics) {
        return null;
    }

    if (!metrics.available) {
        return (
            <Card label="Cluster Hardware & Capacity">
                <div className="flex items-center gap-3 py-2 text-soft">
                    <Activity className="size-5 shrink-0 text-faint" />
                    <div className="min-w-0">
                        <p className="text-xs font-medium text-ink">
                            Hardware telemetry warming up
                        </p>
                        <p className="mt-0.5 text-[11px] text-faint">
                            Metrics Server collects hardware utilization data
                            every 60 seconds. Telemetry will appear
                            automatically once ready.
                        </p>
                    </div>
                </div>
            </Card>
        );
    }

    return (
        <Card
            label="Cluster Hardware & Capacity"
            action={
                <span className="font-mono text-[10px] text-faint">
                    Updated{' '}
                    {new Date(metrics.updatedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                    })}
                </span>
            }
        >
            <div className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <div className="flex flex-col items-center justify-center p-2">
                    <RadialGauge
                        value={metrics.cpuPercent}
                        label="Node CPU"
                        subtext={
                            metrics.nodes.length > 1
                                ? `${metrics.nodes.length} nodes avg`
                                : (metrics.nodes[0]?.cpu ?? null)
                        }
                        size="md"
                        tone="auto"
                    />
                </div>

                <div className="flex flex-col items-center justify-center p-2">
                    <RadialGauge
                        value={metrics.memoryPercent}
                        label="Node RAM"
                        subtext={
                            metrics.nodes.length > 1
                                ? `${metrics.nodes.length} nodes avg`
                                : (metrics.nodes[0]?.memory ?? null)
                        }
                        size="md"
                        tone="auto"
                    />
                </div>

                <div className="flex flex-col items-center justify-center p-2 text-center">
                    <div className="flex size-[92px] flex-col items-center justify-center rounded-full border border-line bg-surface/50">
                        <HardDrive className="size-6 text-brand" />
                        <span className="mt-1 font-mono text-xs font-semibold text-ink">
                            {metrics.pvcCapacity ?? 'RWO'}
                        </span>
                    </div>
                    <p className="mt-2 text-xs font-medium text-ink">
                        Persistent Storage
                    </p>
                    <p className="font-mono text-[11px] text-faint">
                        {metrics.pvcCount} attached{' '}
                        {metrics.pvcCount === 1 ? 'volume' : 'volumes'}
                    </p>
                </div>
            </div>

            {metrics.nodes.length > 1 && (
                <div className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface/40 p-2.5">
                    <p className="mb-2 text-[11px] font-semibold tracking-wider text-soft uppercase">
                        Per-Node Allocation
                    </p>
                    {metrics.nodes.map((node) => (
                        <div
                            key={node.name}
                            className="flex items-center justify-between py-1.5 text-xs"
                        >
                            <span className="max-w-[200px] truncate font-mono font-medium text-ink">
                                {node.name}
                            </span>
                            <div className="flex items-center gap-4 font-mono text-[11px] text-soft">
                                <span>
                                    CPU:{' '}
                                    <strong className="text-ink">
                                        {node.cpu}
                                    </strong>{' '}
                                    ({node.cpuPercent}%)
                                </span>
                                <span>
                                    RAM:{' '}
                                    <strong className="text-ink">
                                        {node.memory}
                                    </strong>{' '}
                                    ({node.memoryPercent}%)
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}

function dnsProviderLabel(provider?: string): string {
    switch (provider) {
        case 'route53':
            return 'AWS Route 53';
        case 'google':
            return 'Google Cloud DNS';
        case 'cloudflare':
        default:
            return 'Cloudflare';
    }
}

const dnsProviderOptions = [
    { value: 'cloudflare', label: 'Cloudflare (Recommended)' },
    { value: 'route53', label: 'AWS Route 53 (Experimental)' },
    { value: 'google', label: 'Google Cloud DNS (Experimental)' },
];

function DomainRow({
    groups,
    disabled,
    onSetUp,
}: {
    groups?: DnsGroup[] | null;
    disabled: boolean;
    onSetUp: () => void;
}) {
    if (!groups || groups.length === 0) {
        return (
            <ListRow
                action={
                    <>
                        {groups === null && (
                            <StatusPill tone="muted">Couldn't check</StatusPill>
                        )}
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={disabled}
                            onClick={onSetUp}
                        >
                            <Plus className="size-3.5" />
                            <span>Set up</span>
                        </Button>
                    </>
                }
            >
                <TwoLine
                    title="Connect a domain"
                    detail="Create DNS records for your tools and apps automatically with Cloudflare, Route 53, or Google Cloud DNS."
                />
            </ListRow>
        );
    }

    const zoneCount = groups.reduce(
        (total, group) => total + group.zones.length,
        0,
    );
    const providerLabel = dnsProviderLabel(groups[0]?.provider);

    return (
        <div className="border-t border-line py-2.5 first-of-type:border-t-0">
            <div className="flex items-center justify-between gap-4">
                <TwoLine
                    title="Connect a domain"
                    detail={
                        groups.length === 1
                            ? `Managing ${zoneCount} ${zoneCount === 1 ? 'domain' : 'domains'} through ${providerLabel}.`
                            : `Managing ${zoneCount} domains through ${groups.length} accounts, each with its own ExternalDNS.`
                    }
                />
                <div className="flex shrink-0 items-center gap-2.5">
                    <StatusPill tone="ok">Connected</StatusPill>
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        onClick={onSetUp}
                    >
                        <Plus className="size-3.5" />
                        <span>Add domain</span>
                    </Button>
                </div>
            </div>
            <ul className="mt-2.5 space-y-1.5">
                {groups.map((group) => (
                    <li
                        key={group.group}
                        className="flex items-center gap-3 rounded-lg bg-paper px-3 py-2"
                    >
                        <span className="w-28 shrink-0 truncate font-mono text-xs font-medium">
                            {group.group}
                        </span>
                        <span className="rounded bg-line/60 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-soft uppercase">
                            {dnsProviderLabel(group.provider)}
                        </span>
                        <span className="min-w-0 flex-1 text-xs text-soft">
                            {group.zones.join(', ')}
                        </span>
                        {!group.ready && (
                            <StatusPill tone="warn">Not ready</StatusPill>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function SslRow({
    report,
    disabled,
    onEnable,
}: {
    report?: TlsReport | null;
    disabled: boolean;
    onEnable: () => void;
}) {
    const blocked = report?.cannotRenew ?? [];
    const enabled = report?.challenge === 'dns';
    const providerLabel = dnsProviderLabel(report?.provider);

    return (
        <div className="border-t border-line py-2.5">
            <div className="flex items-center justify-between gap-4">
                <TwoLine
                    title="Automatic SSL certificates"
                    detail={
                        enabled
                            ? `Renewing through ${providerLabel} DNS for ${report?.zones?.join(', ') || 'all managed zones'}.`
                            : "Issue Let's Encrypt certificates through DNS-01 challenge (Cloudflare, Route 53, or Google Cloud DNS), even behind a proxy or for wildcard domains."
                    }
                />
                <div className="flex shrink-0 items-center gap-2.5">
                    {report === null && (
                        <StatusPill tone="muted">Couldn't check</StatusPill>
                    )}
                    {enabled ? (
                        <>
                            <StatusPill
                                tone={blocked.length > 0 ? 'warn' : 'ok'}
                            >
                                {blocked.length > 0
                                    ? 'Needs attention'
                                    : 'Enabled'}
                            </StatusPill>
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={disabled}
                                onClick={onEnable}
                            >
                                <RotateCw className="size-3.5" />
                                <span>Change</span>
                            </Button>
                        </>
                    ) : (
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={disabled}
                            onClick={onEnable}
                        >
                            <ShieldCheck className="size-3.5" />
                            <span>Enable</span>
                        </Button>
                    )}
                </div>
            </div>
            {blocked.length > 0 && (
                <p className="mt-2 rounded-lg bg-warn-tint px-3 py-2 text-xs text-warn">
                    These can't renew because they're outside {providerLabel}'s
                    managed domains: {blocked.join(', ')}.
                </p>
            )}
        </div>
    );
}

function ConnectDomainDialog({
    server,
    onClose,
}: {
    server: Server;
    onClose: () => void;
}) {
    const defaultProvider =
        server.provider === 'aws'
            ? 'route53'
            : server.provider === 'gcp'
              ? 'google'
              : 'cloudflare';

    const [provider, setProvider] = useState<
        'cloudflare' | 'route53' | 'google'
    >(defaultProvider);
    const [token, setToken] = useState('');
    const [group, setGroup] = useState('');
    const [awsKeyId, setAwsKeyId] = useState('');
    const [awsSecretKey, setAwsSecretKey] = useState('');
    const [awsRegion, setAwsRegion] = useState(server.region || 'us-east-1');
    const [gcpProjectId, setGcpProjectId] = useState('');
    const [gcpCredentials, setGcpCredentials] = useState('');

    const handleGcpFileSelect = async (
        e: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            setGcpCredentials(text.trim());
            try {
                const parsed = JSON.parse(text.trim());
                if (parsed.project_id && !gcpProjectId) {
                    setGcpProjectId(parsed.project_id);
                }
            } catch {
                // ignore
            }
        } catch {
            // ignore
        }
    };

    const isSubmittable = (() => {
        if (provider === 'cloudflare') return token.trim() !== '';
        if (provider === 'route53')
            return awsKeyId.trim() !== '' && awsSecretKey.trim() !== '';
        if (provider === 'google')
            return gcpProjectId.trim() !== '' && gcpCredentials.trim() !== '';
        return false;
    })();

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-6"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="max-h-[90vh] w-full max-w-[540px] overflow-y-auto rounded-2xl bg-surface p-7 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-4">
                    <h2 className="text-xl font-semibold tracking-[-0.02em]">
                        Connect a domain
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-soft hover:bg-paper hover:text-ink"
                    >
                        <X className="size-4" />
                    </button>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-soft">
                    LaraKube installs ExternalDNS on {server.name}. From then
                    on, every tool and app you install gets its DNS record
                    created automatically.
                </p>
                <Form action={dns(server.name)} className="mt-5 space-y-4">
                    {({ errors, processing }) => (
                        <>
                            <input
                                type="hidden"
                                name="dns_provider"
                                value={provider}
                            />

                            <label className="block">
                                <span className="mb-1.5 block text-xs font-medium text-soft">
                                    DNS Provider
                                </span>
                                <SelectMenu
                                    value={provider}
                                    onChange={(val) =>
                                        setProvider(
                                            val as
                                                | 'cloudflare'
                                                | 'route53'
                                                | 'google',
                                        )
                                    }
                                    accent="servers"
                                    options={dnsProviderOptions}
                                />
                            </label>

                            {provider === 'cloudflare' && (
                                <div className="space-y-3">
                                    <p className="text-xs text-soft">
                                        Create a token with the{' '}
                                        <strong>Edit zone DNS</strong> template
                                        covering your domains at{' '}
                                        <ExternalLinkButton
                                            url="https://dash.cloudflare.com/profile/api-tokens"
                                            showIcon
                                            className="inline-flex cursor-pointer items-center gap-1 font-medium text-servers hover:underline"
                                        >
                                            Cloudflare API Tokens
                                        </ExternalLinkButton>
                                        .
                                    </p>
                                    <label className="block">
                                        <span className="mb-1.5 block text-xs font-medium text-soft">
                                            Cloudflare API token
                                        </span>
                                        <input
                                            type="password"
                                            name="cloudflare_token"
                                            value={token}
                                            onChange={(e) =>
                                                setToken(e.target.value)
                                            }
                                            autoFocus
                                            autoComplete="off"
                                            placeholder="Paste your Cloudflare API token"
                                            className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                        />
                                        {errors.cloudflare_token && (
                                            <span className="mt-1 block text-xs text-accent">
                                                {errors.cloudflare_token}
                                            </span>
                                        )}
                                    </label>
                                </div>
                            )}

                            {provider === 'route53' && (
                                <div className="space-y-3">
                                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                                        <div className="flex items-center gap-1.5 font-semibold">
                                            <FlaskConical className="size-3.5 shrink-0" />
                                            <span>Experimental Provider</span>
                                        </div>
                                        <p className="mt-1 leading-relaxed text-soft">
                                            AWS Route 53 integration is
                                            supported via ExternalDNS. Ensure
                                            your AWS IAM credentials have{' '}
                                            <code className="text-foreground font-mono">
                                                route53:ChangeResourceRecordSets
                                            </code>
                                            ,{' '}
                                            <code className="text-foreground font-mono">
                                                route53:ListResourceRecordSets
                                            </code>
                                            , and{' '}
                                            <code className="text-foreground font-mono">
                                                route53:ListHostedZonesByName
                                            </code>{' '}
                                            permissions.
                                        </p>
                                    </div>
                                    <label className="block">
                                        <span className="mb-1.5 block text-xs font-medium text-soft">
                                            AWS Access Key ID
                                        </span>
                                        <input
                                            type="text"
                                            name="aws_access_key_id"
                                            value={awsKeyId}
                                            onChange={(e) =>
                                                setAwsKeyId(e.target.value)
                                            }
                                            placeholder="AKIAIOSFODNN7EXAMPLE"
                                            className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                        />
                                        {errors.aws_access_key_id && (
                                            <span className="mt-1 block text-xs text-accent">
                                                {errors.aws_access_key_id}
                                            </span>
                                        )}
                                    </label>
                                    <label className="block">
                                        <span className="mb-1.5 block text-xs font-medium text-soft">
                                            AWS Secret Access Key
                                        </span>
                                        <input
                                            type="password"
                                            name="aws_secret_access_key"
                                            value={awsSecretKey}
                                            onChange={(e) =>
                                                setAwsSecretKey(e.target.value)
                                            }
                                            placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                                            className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                        />
                                        {errors.aws_secret_access_key && (
                                            <span className="mt-1 block text-xs text-accent">
                                                {errors.aws_secret_access_key}
                                            </span>
                                        )}
                                    </label>
                                    <label className="block">
                                        <span className="mb-1.5 block text-xs font-medium text-soft">
                                            AWS Region
                                        </span>
                                        <input
                                            type="text"
                                            name="aws_region"
                                            value={awsRegion}
                                            onChange={(e) =>
                                                setAwsRegion(e.target.value)
                                            }
                                            placeholder="us-east-1"
                                            className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                        />
                                        {errors.aws_region && (
                                            <span className="mt-1 block text-xs text-accent">
                                                {errors.aws_region}
                                            </span>
                                        )}
                                    </label>
                                </div>
                            )}

                            {provider === 'google' && (
                                <div className="space-y-3">
                                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                                        <div className="flex items-center gap-1.5 font-semibold">
                                            <FlaskConical className="size-3.5 shrink-0" />
                                            <span>Experimental Provider</span>
                                        </div>
                                        <p className="mt-1 leading-relaxed text-soft">
                                            Google Cloud DNS automation is
                                            supported via ExternalDNS. Ensure
                                            your GCP project has the{' '}
                                            <strong>Cloud DNS API</strong>{' '}
                                            enabled and the Service Account
                                            possesses the{' '}
                                            <code className="text-foreground font-mono">
                                                roles/dns.admin
                                            </code>{' '}
                                            IAM role.
                                        </p>
                                    </div>
                                    <label className="block">
                                        <span className="mb-1.5 block text-xs font-medium text-soft">
                                            Google Cloud Project ID
                                        </span>
                                        <input
                                            type="text"
                                            name="gcp_project_id"
                                            value={gcpProjectId}
                                            onChange={(e) =>
                                                setGcpProjectId(e.target.value)
                                            }
                                            placeholder="my-gcp-project"
                                            className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                        />
                                        {errors.gcp_project_id && (
                                            <span className="mt-1 block text-xs text-accent">
                                                {errors.gcp_project_id}
                                            </span>
                                        )}
                                    </label>
                                    <div>
                                        <div className="mb-1.5 flex items-center justify-between">
                                            <span className="text-xs font-medium text-soft">
                                                Service Account Credentials
                                                (JSON or path)
                                            </span>
                                            <label
                                                className={cn(
                                                    buttonClass(
                                                        'secondary',
                                                        'sm',
                                                    ),
                                                    'cursor-pointer text-xs',
                                                )}
                                            >
                                                <Upload className="size-3" />
                                                <span>Browse JSON File…</span>
                                                <input
                                                    type="file"
                                                    accept=".json,application/json"
                                                    onChange={
                                                        handleGcpFileSelect
                                                    }
                                                    className="sr-only"
                                                />
                                            </label>
                                        </div>
                                        <textarea
                                            name="gcp_credentials"
                                            rows={3}
                                            placeholder='{"type": "service_account", ...} or /path/to/key.json'
                                            value={gcpCredentials}
                                            onChange={(e) =>
                                                setGcpCredentials(
                                                    e.target.value,
                                                )
                                            }
                                            className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                        />
                                        {errors.gcp_credentials && (
                                            <span className="mt-1 block text-xs text-accent">
                                                {errors.gcp_credentials}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            <label className="block">
                                <span className="mb-1.5 block text-xs font-medium text-soft">
                                    Name (optional)
                                </span>
                                <input
                                    name="group"
                                    value={group}
                                    onChange={(e) => setGroup(e.target.value)}
                                    placeholder="e.g. company-domains"
                                    autoComplete="off"
                                    spellCheck={false}
                                    className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-servers"
                                />
                                <span
                                    className={
                                        errors.group
                                            ? 'mt-1 block text-xs text-accent'
                                            : 'mt-1 block text-xs text-soft'
                                    }
                                >
                                    {errors.group ??
                                        'Only needed when this instance manages a specific group or multiple accounts.'}
                                </span>
                            </label>

                            <p className="rounded-lg bg-paper px-3 py-2 text-xs text-soft">
                                Credentials travel securely over the run
                                environment and are stored inside your cluster
                                as Kubernetes secrets. They are never saved in
                                this app.
                            </p>

                            <div className="flex justify-end gap-2.5 pt-2">
                                <Button variant="secondary" onClick={onClose}>
                                    <X className="size-3.5" />
                                    <span>Cancel</span>
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={processing || !isSubmittable}
                                >
                                    <Globe className="size-3.5" />
                                    <span>
                                        {processing ? 'Connecting…' : 'Connect'}
                                    </span>
                                </Button>
                            </div>
                        </>
                    )}
                </Form>
            </div>
        </div>
    );
}

function EnableSslDialog({
    server,
    dnsGroups,
    onClose,
}: {
    server: Server;
    dnsGroups?: DnsGroup[] | null;
    onClose: () => void;
}) {
    const hasDnsGroups = Boolean(dnsGroups && dnsGroups.length > 0);
    const firstGroup = dnsGroups?.[0];
    const initialProvider = firstGroup?.provider
        ? (firstGroup.provider as 'cloudflare' | 'route53' | 'google')
        : server.provider === 'aws'
          ? 'route53'
          : server.provider === 'gcp'
            ? 'google'
            : 'cloudflare';

    const [reuseStored, setReuseStored] = useState(hasDnsGroups);
    const [selectedGroup, setSelectedGroup] = useState(firstGroup?.group ?? '');
    const [provider, setProvider] = useState<
        'cloudflare' | 'route53' | 'google'
    >(initialProvider);
    const [token, setToken] = useState('');
    const [awsKeyId, setAwsKeyId] = useState('');
    const [awsSecretKey, setAwsSecretKey] = useState('');
    const [awsRegion, setAwsRegion] = useState(server.region || 'us-east-1');
    const [gcpProjectId, setGcpProjectId] = useState('');
    const [gcpCredentials, setGcpCredentials] = useState('');

    const handleGcpFileSelect = async (
        e: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            setGcpCredentials(text.trim());
            try {
                const parsed = JSON.parse(text.trim());
                if (parsed.project_id && !gcpProjectId) {
                    setGcpProjectId(parsed.project_id);
                }
            } catch {
                // ignore
            }
        } catch {
            // ignore
        }
    };

    const isSubmittable = (() => {
        if (reuseStored) return true;
        if (provider === 'cloudflare') return true;
        if (provider === 'route53')
            return awsKeyId.trim() !== '' && awsSecretKey.trim() !== '';
        if (provider === 'google')
            return gcpProjectId.trim() !== '' && gcpCredentials.trim() !== '';
        return false;
    })();

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-6"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="max-h-[90vh] w-full max-w-[540px] overflow-y-auto rounded-2xl bg-surface p-7 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-4">
                    <h2 className="text-xl font-semibold tracking-[-0.02em]">
                        Automatic SSL certificates
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-soft hover:bg-paper hover:text-ink"
                    >
                        <X className="size-4" />
                    </button>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-soft">
                    Traefik on {server.name} proves domain ownership through
                    DNS-01 challenge instead of HTTP, so certificates keep
                    renewing even for wildcard domains or proxied traffic.
                </p>
                <Form action={tls(server.name)} className="mt-5 space-y-4">
                    {({ errors, processing }) => (
                        <>
                            {hasDnsGroups && (
                                <div className="space-y-2 rounded-xl bg-paper p-3.5">
                                    <span className="block text-xs font-semibold tracking-wider text-soft uppercase">
                                        Credentials Source
                                    </span>
                                    <label className="flex cursor-pointer items-start gap-2.5 text-xs text-ink">
                                        <input
                                            type="radio"
                                            name="reuse_option"
                                            checked={reuseStored}
                                            onChange={() =>
                                                setReuseStored(true)
                                            }
                                            className="mt-0.5 text-servers focus:ring-servers"
                                        />
                                        <div>
                                            <span className="font-medium">
                                                Reuse stored credentials from
                                                ExternalDNS
                                            </span>
                                            <p className="text-soft">
                                                Uses the{' '}
                                                {dnsProviderLabel(
                                                    firstGroup?.provider,
                                                )}{' '}
                                                credentials already stored on
                                                this cluster.
                                            </p>
                                        </div>
                                    </label>
                                    <label className="flex cursor-pointer items-start gap-2.5 text-xs text-ink">
                                        <input
                                            type="radio"
                                            name="reuse_option"
                                            checked={!reuseStored}
                                            onChange={() =>
                                                setReuseStored(false)
                                            }
                                            className="mt-0.5 text-servers focus:ring-servers"
                                        />
                                        <div>
                                            <span className="font-medium">
                                                Provide separate or new DNS
                                                credentials
                                            </span>
                                            <p className="text-soft">
                                                Configure a different provider
                                                or different API key for
                                                certificate issuance.
                                            </p>
                                        </div>
                                    </label>
                                </div>
                            )}

                            {reuseStored && hasDnsGroups ? (
                                <>
                                    <input
                                        type="hidden"
                                        name="reuse_stored"
                                        value="1"
                                    />
                                    <input
                                        type="hidden"
                                        name="dns_provider"
                                        value={
                                            firstGroup?.provider || 'cloudflare'
                                        }
                                    />
                                    {dnsGroups && dnsGroups.length > 1 && (
                                        <label className="block">
                                            <span className="mb-1.5 block text-xs font-medium text-soft">
                                                Select ExternalDNS Group
                                            </span>
                                            <SelectMenu
                                                value={selectedGroup}
                                                onChange={(val) =>
                                                    setSelectedGroup(val)
                                                }
                                                accent="servers"
                                                options={dnsGroups.map((g) => ({
                                                    value: g.group,
                                                    label: `${g.group} (${g.zones.join(', ')})`,
                                                }))}
                                            />
                                            <input
                                                type="hidden"
                                                name="group"
                                                value={selectedGroup}
                                            />
                                        </label>
                                    )}
                                    {dnsGroups && dnsGroups.length === 1 && (
                                        <input
                                            type="hidden"
                                            name="group"
                                            value={firstGroup?.group ?? ''}
                                        />
                                    )}
                                </>
                            ) : (
                                <>
                                    <input
                                        type="hidden"
                                        name="reuse_stored"
                                        value="0"
                                    />
                                    <input
                                        type="hidden"
                                        name="dns_provider"
                                        value={provider}
                                    />

                                    <label className="block">
                                        <span className="mb-1.5 block text-xs font-medium text-soft">
                                            DNS Provider
                                        </span>
                                        <SelectMenu
                                            value={provider}
                                            onChange={(val) =>
                                                setProvider(
                                                    val as
                                                        | 'cloudflare'
                                                        | 'route53'
                                                        | 'google',
                                                )
                                            }
                                            accent="servers"
                                            options={dnsProviderOptions}
                                        />
                                    </label>

                                    {provider === 'cloudflare' && (
                                        <div className="space-y-3">
                                            <p className="text-xs text-soft">
                                                Leave empty to reuse any
                                                existing token, or paste a token
                                                with the{' '}
                                                <strong>Edit zone DNS</strong>{' '}
                                                template.
                                            </p>
                                            <label className="block">
                                                <span className="mb-1.5 block text-xs font-medium text-soft">
                                                    Cloudflare API token
                                                    (optional)
                                                </span>
                                                <input
                                                    type="password"
                                                    name="cloudflare_token"
                                                    value={token}
                                                    onChange={(e) =>
                                                        setToken(e.target.value)
                                                    }
                                                    autoFocus
                                                    autoComplete="off"
                                                    placeholder="Paste token or leave empty to reuse"
                                                    className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                                />
                                                {errors.cloudflare_token && (
                                                    <span className="mt-1 block text-xs text-accent">
                                                        {
                                                            errors.cloudflare_token
                                                        }
                                                    </span>
                                                )}
                                            </label>
                                        </div>
                                    )}

                                    {provider === 'route53' && (
                                        <div className="space-y-3">
                                            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                                                <div className="flex items-center gap-1.5 font-semibold">
                                                    <FlaskConical className="size-3.5 shrink-0" />
                                                    <span>
                                                        Experimental Provider
                                                    </span>
                                                </div>
                                                <p className="mt-1 leading-relaxed text-soft">
                                                    Traefik requires AWS IAM
                                                    credentials with Route 53
                                                    permissions to create Let's
                                                    Encrypt DNS-01 verification
                                                    TXT records.
                                                </p>
                                            </div>
                                            <label className="block">
                                                <span className="mb-1.5 block text-xs font-medium text-soft">
                                                    AWS Access Key ID
                                                </span>
                                                <input
                                                    type="text"
                                                    name="aws_access_key_id"
                                                    value={awsKeyId}
                                                    onChange={(e) =>
                                                        setAwsKeyId(
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder="AKIAIOSFODNN7EXAMPLE"
                                                    className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                                />
                                                {errors.aws_access_key_id && (
                                                    <span className="mt-1 block text-xs text-accent">
                                                        {
                                                            errors.aws_access_key_id
                                                        }
                                                    </span>
                                                )}
                                            </label>
                                            <label className="block">
                                                <span className="mb-1.5 block text-xs font-medium text-soft">
                                                    AWS Secret Access Key
                                                </span>
                                                <input
                                                    type="password"
                                                    name="aws_secret_access_key"
                                                    value={awsSecretKey}
                                                    onChange={(e) =>
                                                        setAwsSecretKey(
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                                                    className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                                />
                                                {errors.aws_secret_access_key && (
                                                    <span className="mt-1 block text-xs text-accent">
                                                        {
                                                            errors.aws_secret_access_key
                                                        }
                                                    </span>
                                                )}
                                            </label>
                                            <label className="block">
                                                <span className="mb-1.5 block text-xs font-medium text-soft">
                                                    AWS Region
                                                </span>
                                                <input
                                                    type="text"
                                                    name="aws_region"
                                                    value={awsRegion}
                                                    onChange={(e) =>
                                                        setAwsRegion(
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder="us-east-1"
                                                    className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                                />
                                                {errors.aws_region && (
                                                    <span className="mt-1 block text-xs text-accent">
                                                        {errors.aws_region}
                                                    </span>
                                                )}
                                            </label>
                                        </div>
                                    )}

                                    {provider === 'google' && (
                                        <div className="space-y-3">
                                            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                                                <div className="flex items-center gap-1.5 font-semibold">
                                                    <FlaskConical className="size-3.5 shrink-0" />
                                                    <span>
                                                        Experimental Provider
                                                    </span>
                                                </div>
                                                <p className="mt-1 leading-relaxed text-soft">
                                                    Google Cloud DNS requires a
                                                    Service Account JSON with{' '}
                                                    <code className="text-foreground font-mono">
                                                        roles/dns.admin
                                                    </code>{' '}
                                                    permissions.
                                                </p>
                                            </div>
                                            <label className="block">
                                                <span className="mb-1.5 block text-xs font-medium text-soft">
                                                    Google Cloud Project ID
                                                </span>
                                                <input
                                                    type="text"
                                                    name="gcp_project_id"
                                                    value={gcpProjectId}
                                                    onChange={(e) =>
                                                        setGcpProjectId(
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder="my-gcp-project"
                                                    className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                                />
                                                {errors.gcp_project_id && (
                                                    <span className="mt-1 block text-xs text-accent">
                                                        {errors.gcp_project_id}
                                                    </span>
                                                )}
                                            </label>
                                            <div>
                                                <div className="mb-1.5 flex items-center justify-between">
                                                    <span className="text-xs font-medium text-soft">
                                                        Service Account
                                                        Credentials (JSON or
                                                        path)
                                                    </span>
                                                    <label
                                                        className={cn(
                                                            buttonClass(
                                                                'secondary',
                                                                'sm',
                                                            ),
                                                            'cursor-pointer text-xs',
                                                        )}
                                                    >
                                                        <Upload className="size-3" />
                                                        <span>
                                                            Browse JSON File…
                                                        </span>
                                                        <input
                                                            type="file"
                                                            accept=".json,application/json"
                                                            onChange={
                                                                handleGcpFileSelect
                                                            }
                                                            className="sr-only"
                                                        />
                                                    </label>
                                                </div>
                                                <textarea
                                                    name="gcp_credentials"
                                                    rows={3}
                                                    placeholder='{"type": "service_account", ...} or /path/to/key.json'
                                                    value={gcpCredentials}
                                                    onChange={(e) =>
                                                        setGcpCredentials(
                                                            e.target.value,
                                                        )
                                                    }
                                                    className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                                />
                                                {errors.gcp_credentials && (
                                                    <span className="mt-1 block text-xs text-accent">
                                                        {errors.gcp_credentials}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            <p className="rounded-lg bg-paper px-3 py-2 text-xs text-soft">
                                Credentials travel securely over the run
                                environment and are stored inside your cluster
                                as Kubernetes secrets. They are never saved in
                                this app.
                            </p>

                            <div className="flex justify-end gap-2.5 pt-2">
                                <Button variant="secondary" onClick={onClose}>
                                    <X className="size-3.5" />
                                    <span>Cancel</span>
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={processing || !isSubmittable}
                                >
                                    <ShieldCheck className="size-3.5" />
                                    <span>
                                        {processing ? 'Enabling…' : 'Enable'}
                                    </span>
                                </Button>
                            </div>
                        </>
                    )}
                </Form>
            </div>
        </div>
    );
}

function TeamAccessCard({
    users,
    disabled,
    onGrant,
    onRevoke,
}: {
    users?: ClusterUser[] | null;
    disabled?: boolean;
    onGrant: () => void;
    onRevoke: (user: ClusterUser) => void;
}) {
    if (users === undefined) {
        return (
            <Card label="Team Access & RBAC">
                <CheckingRow title="Checking team access…" />
            </Card>
        );
    }

    const userList = users ?? [];

    return (
        <Card
            label={`Team Access & RBAC${userList.length > 0 ? ` · ${userList.length}` : ''}`}
            action={
                <Button
                    variant="secondary"
                    size="sm"
                    disabled={disabled}
                    onClick={onGrant}
                    className="gap-1.5"
                >
                    <UserPlus className="size-3.5" />
                    <span>Grant Access</span>
                </Button>
            }
        >
            {userList.length === 0 ? (
                <div className="py-5 text-center">
                    <ShieldCheck className="mx-auto mb-2 size-7 text-faint" />
                    <p className="text-sm font-medium text-ink">
                        No collaborators granted access yet
                    </p>
                    <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-soft">
                        Generate scoped, secure kubeconfig files for your
                        teammates with edit, read, or admin permissions.
                    </p>
                    <div className="mt-3.5 flex justify-center">
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={disabled}
                            onClick={onGrant}
                            className="gap-1.5"
                        >
                            <UserPlus className="size-3.5" />
                            <span>Grant Teammate Access</span>
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="divide-y divide-line">
                    {userList.map((user) => {
                        const hasDistinctPerson = Boolean(
                            user.person &&
                            user.person.trim() !== '' &&
                            user.person !== user.name,
                        );
                        const roleLabel = user.isCluster
                            ? user.role || 'cluster-admin'
                            : user.role || 'edit';

                        return (
                            <div
                                key={`${user.namespace}-${user.name}`}
                                className="flex items-center justify-between gap-3 py-2.5 first:pt-1 last:pb-1"
                            >
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                                        <ShieldCheck className="size-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex min-w-0 items-center gap-1.5">
                                            <span className="truncate text-xs font-semibold text-ink">
                                                {hasDistinctPerson
                                                    ? user.person
                                                    : user.name}
                                            </span>
                                            {hasDistinctPerson && (
                                                <span className="shrink-0 rounded bg-paper px-1.5 py-0.5 font-mono text-[10px] text-soft">
                                                    @{user.name}
                                                </span>
                                            )}
                                            <span
                                                className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium whitespace-nowrap ${
                                                    user.isCluster
                                                        ? 'bg-brand/10 text-brand ring-1 ring-brand/20'
                                                        : 'bg-line/60 text-soft'
                                                }`}
                                            >
                                                {roleLabel}
                                            </span>
                                        </div>
                                        <p className="mt-0.5 truncate font-mono text-[11px] text-faint">
                                            {user.isCluster
                                                ? 'Cluster-wide (all namespaces)'
                                                : `namespaces: ${user.scope || (user.namespaces && user.namespaces.length ? user.namespaces.join(', ') : 'all')}`}
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => onRevoke(user)}
                                    className="shrink-0 gap-1"
                                    title="Revoke access"
                                >
                                    <Trash2 className="size-3" />
                                    <span>Revoke</span>
                                </Button>
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
}

function RevokeAccessDialog({
    server,
    user,
    onClose,
}: {
    server: Server;
    user: ClusterUser;
    onClose: () => void;
}) {
    const displayName =
        user.person && user.person !== user.name
            ? `${user.person} (${user.name})`
            : user.name;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-6 backdrop-blur-xs"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-[460px] rounded-2xl bg-surface p-7 shadow-2xl ring-1 ring-line"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent">
                        <Trash2 className="size-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">
                            Revoke access for {user.name}?
                        </h2>
                        <p className="text-xs text-soft">
                            Off-board teammate from {server.name}
                        </p>
                    </div>
                </div>

                <p className="mt-3.5 text-xs leading-relaxed text-soft">
                    This deletes the ServiceAccount and RoleBindings for{' '}
                    <span className="font-semibold text-ink">
                        {displayName}
                    </span>
                    , and invalidates their active kubeconfig credentials on{' '}
                    <span className="font-medium text-ink">{server.name}</span>.
                    They will immediately lose access to cluster resources.
                </p>

                <div className="mt-4 rounded-xl border border-line bg-paper/60 p-3 text-xs">
                    <div className="flex items-center justify-between">
                        <span className="font-medium text-ink">
                            {user.person || user.name}
                        </span>
                        <span
                            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                                user.isCluster
                                    ? 'bg-brand/10 text-brand ring-1 ring-brand/20'
                                    : 'bg-line/60 text-soft'
                            }`}
                        >
                            {user.isCluster
                                ? user.role || 'cluster-admin'
                                : user.role || 'edit'}
                        </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-faint">
                        {user.isCluster
                            ? 'Scope: Cluster-wide (all namespaces)'
                            : `Namespaces: ${user.scope || (user.namespaces && user.namespaces.length ? user.namespaces.join(', ') : 'all')}`}
                    </p>
                </div>

                <Form
                    action={`/servers/${server.name}/access/revoke`}
                    method="post"
                    className="mt-6 flex justify-end gap-2.5"
                >
                    {({ processing }) => (
                        <>
                            <input
                                type="hidden"
                                name="name"
                                value={user.name}
                            />
                            <Button
                                variant="secondary"
                                onClick={onClose}
                                disabled={processing}
                                className="gap-1.5"
                            >
                                <XCircle className="size-3.5" />
                                <span>Cancel</span>
                            </Button>
                            <Button
                                type="submit"
                                variant="dangerFill"
                                disabled={processing}
                                className="gap-1.5"
                            >
                                <Trash2 className="size-3.5" />
                                <span>
                                    {processing ? 'Revoking…' : 'Revoke access'}
                                </span>
                            </Button>
                        </>
                    )}
                </Form>
            </div>
        </div>
    );
}

function GrantAccessDialog({
    server,
    onClose,
}: {
    server: Server;
    onClose: () => void;
}) {
    const [name, setName] = useState('');
    const [role, setRole] = useState<'edit' | 'read' | 'admin'>('edit');
    const [scope, setScope] = useState('production');
    const [isCluster, setIsCluster] = useState(false);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl ring-1 ring-line">
                <h3 className="text-lg font-semibold text-ink">
                    Grant Teammate Access
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-soft">
                    Mints a scoped ServiceAccount, RoleBinding, and standalone
                    kubeconfig for a collaborator on{' '}
                    <span className="font-medium text-ink">{server.name}</span>.
                </p>

                <Form
                    action={`/servers/${server.name}/access/grant`}
                    method="post"
                    className="mt-5 space-y-4"
                >
                    {({ processing, errors }) => (
                        <>
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-medium text-soft">
                                    Teammate Identifier
                                </span>
                                <input
                                    name="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g. alice, bob-dev"
                                    autoFocus
                                    required
                                    className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-brand"
                                />
                                {errors.name && (
                                    <span className="mt-1 block text-xs text-accent">
                                        {errors.name}
                                    </span>
                                )}
                            </label>

                            <div>
                                <span className="mb-1.5 block text-xs font-medium text-soft">
                                    Permission Role
                                </span>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        [
                                            'edit',
                                            'Edit',
                                            'Deploy, restart, scale',
                                        ],
                                        ['read', 'Read', 'Logs & status only'],
                                        ['admin', 'Admin', 'Namespace admin'],
                                    ].map(([r, title, desc]) => (
                                        <button
                                            key={r}
                                            type="button"
                                            onClick={() => setRole(r as any)}
                                            className={`rounded-lg p-2.5 text-left ring-1 transition ${
                                                role === r
                                                    ? 'bg-tools-tint text-ink ring-tools'
                                                    : 'bg-paper text-soft ring-line hover:text-ink'
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="role"
                                                value={r}
                                                checked={role === r}
                                                onChange={() =>
                                                    setRole(r as any)
                                                }
                                                className="sr-only"
                                            />
                                            <p className="text-xs font-semibold">
                                                {title}
                                            </p>
                                            <p className="mt-0.5 text-[10px] leading-tight opacity-80">
                                                {desc}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="flex cursor-pointer items-center gap-2">
                                    <input
                                        type="checkbox"
                                        name="cluster"
                                        value="1"
                                        checked={isCluster}
                                        onChange={(e) =>
                                            setIsCluster(e.target.checked)
                                        }
                                        className="rounded border-line text-brand focus:ring-brand"
                                    />
                                    <span className="text-xs font-medium text-ink">
                                        Cluster-wide access (all namespaces)
                                    </span>
                                </label>
                            </div>

                            {!isCluster && (
                                <label className="block">
                                    <span className="mb-1.5 block text-xs font-medium text-soft">
                                        Scoped Namespaces (comma-separated)
                                    </span>
                                    <input
                                        name="scope"
                                        value={scope}
                                        onChange={(e) =>
                                            setScope(e.target.value)
                                        }
                                        placeholder="e.g. production, staging"
                                        className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-brand"
                                    />
                                </label>
                            )}

                            <div className="flex justify-end gap-2.5 pt-2">
                                <Button
                                    variant="secondary"
                                    onClick={onClose}
                                    className="gap-1.5"
                                >
                                    <XCircle className="size-3.5" />
                                    <span>Cancel</span>
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={processing || name.trim() === ''}
                                    className="gap-1.5"
                                >
                                    <UserPlus className="size-3.5" />
                                    <span>
                                        {processing
                                            ? 'Minting…'
                                            : 'Mint & Grant Access'}
                                    </span>
                                </Button>
                            </div>
                        </>
                    )}
                </Form>
            </div>
        </div>
    );
}
