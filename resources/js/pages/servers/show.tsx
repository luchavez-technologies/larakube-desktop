import { Deferred, Form, Link, usePage } from '@inertiajs/react';
import { useState } from 'react';
import {
    ArrowRight,
    ExternalLink,
    FolderGit2,
    Plus,
    Trash2,
    Wrench,
    UserPlus,
    ShieldCheck,
    Database,
    Layers,
    Play,
    Pause,
} from 'lucide-react';
import Button, { buttonClass } from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import { ListRow, TwoLine } from '@/components/list-row';
import PageHeader from '@/components/page-header';
import StatusPill from '@/components/status-pill';
import ToolLogo from '@/components/tool-logo';
import AppLayout from '@/layouts/app-layout';
import { serverStatus } from '@/lib/servers';
import { open } from '@/routes';
import {
    create as projectsCreate,
    index as projectsIndex,
    show as showProject,
} from '@/routes/projects';
import { destroy, dns, index, tls } from '@/routes/servers';
import { index as toolsIndex, show as showTool } from '@/routes/servers/tools';
import { providerLabels, toolName, toolTagline } from '@/types/larakube';
import type {
    ClusterTool,
    Project,
    Server,
    PlexStatus,
    ClusterUser,
} from '@/types/larakube';

type DnsGroup = { group: string; zones: string[]; ready: boolean };
type TlsReport = {
    challenge: 'dns' | 'http' | 'local';
    zones?: string[];
    cannotRenew?: string[];
};
type Dialog = 'destroy' | 'domain' | 'ssl' | 'grantAccess' | null;

export default function ShowServer({
    server,
    projects,
    lastVerifiedTools,
    tools: verifiedTools,
    dns: dnsGroups,
    tls: tlsReport,
    plex,
    clusterUsers,
}: {
    server: Server;
    projects?: Project[];
    lastVerifiedTools?: ClusterTool[] | null;
    tools?: ClusterTool[] | null;
    dns?: DnsGroup[] | null;
    tls?: TlsReport | null;
    plex?: PlexStatus | null;
    clusterUsers?: ClusterUser[] | null;
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
    const [label, tone] = serverStatus[server.status];
    const ready = server.status === 'ready';

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
                    providerLabels[server.provider] ?? server.provider,
                    server.region,
                    server.ip,
                    server.kind === 'vps' ? 'single-node k3s' : server.kind,
                ]
                    .filter(Boolean)
                    .map((part) => (
                        <span key={part}>{part}</span>
                    ))}
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

            <div className="grid grid-cols-[1fr_360px] gap-4.5">
                <div className="flex flex-col gap-4.5">
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
                                                    <Link
                                                        href={open().url}
                                                        method="post"
                                                        data={{ url }}
                                                        as="button"
                                                        className={buttonClass(
                                                            'secondary',
                                                            'sm',
                                                        )}
                                                    >
                                                        <span>Open</span>
                                                        <ExternalLink className="size-3" />
                                                    </Link>
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
                            <CheckingRow title="Checking Plex Commons…" />
                        }
                    >
                        <PlexCommonsCard
                            server={server}
                            plex={plex}
                            disabled={!ready}
                        />
                    </Deferred>
                </div>

                <div className="flex flex-col gap-4.5">
                    {ready && (
                        <Card label="Connection">
                            {server.context && (
                                <ListRow
                                    action={
                                        <CopyButton value={server.context} />
                                    }
                                >
                                    <TwoLine
                                        title="kubectl context"
                                        detail={server.context}
                                        mono
                                    />
                                </ListRow>
                            )}
                            <ListRow
                                action={
                                    <CopyButton value={`ssh ${server.name}`} />
                                }
                            >
                                <TwoLine
                                    title="SSH"
                                    detail={`ssh ${server.name}`}
                                    mono
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
                        fallback={<CheckingRow title="Checking team access…" />}
                    >
                        <TeamAccessCard
                            server={server}
                            users={clusterUsers}
                            disabled={!ready}
                            onGrant={() => setDialog('grantAccess')}
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
                <DestroyDialog
                    server={server}
                    onClose={() => setDialog(null)}
                />
            )}
            {dialog === 'domain' && (
                <CloudflareDialog
                    title="Connect a domain"
                    intro={`LaraKube installs ExternalDNS on ${server.name}. From then on, every tool you install gets its DNS record in Cloudflare automatically.`}
                    tokenHint="Create a token with Zone → Zone → Read and Zone → DNS → Edit for the domains you want managed."
                    tokenRequired
                    action={dns(server.name)}
                    submitLabel="Connect"
                    onClose={() => setDialog(null)}
                />
            )}
            {dialog === 'ssl' && (
                <CloudflareDialog
                    title="Automatic SSL certificates"
                    intro={`Traefik on ${server.name} proves domain ownership through Cloudflare DNS instead of HTTP, so certificates keep renewing even when Cloudflare proxies your sites.`}
                    tokenHint="Leave empty to reuse the token from Connect a domain. Otherwise use a token with the Edit zone DNS template."
                    action={tls(server.name)}
                    submitLabel="Enable"
                    onClose={() => setDialog(null)}
                />
            )}
            {dialog === 'grantAccess' && (
                <GrantAccessDialog
                    server={server}
                    onClose={() => setDialog(null)}
                />
            )}
        </AppLayout>
    );
}

function DestroyDialog({
    server,
    onClose,
}: {
    server: Server;
    onClose: () => void;
}) {
    const [typed, setTyped] = useState('');
    const provider = providerLabels[server.provider] ?? server.provider;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-6"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-[460px] rounded-2xl bg-surface p-7 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <h2 className="text-xl font-semibold tracking-[-0.02em]">
                    Destroy {server.name}?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-soft">
                    This deletes the {provider} server
                    {server.ip ? ` ${server.ip}` : ''}, its firewall rules, and
                    every Cluster Tool and app running on it. It can't be
                    undone.
                </p>
                <Form action={destroy(server.name)} className="mt-4">
                    {({ errors, processing }) => (
                        <>
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-medium text-soft">
                                    Type {server.name} to confirm
                                </span>
                                <input
                                    name="confirm"
                                    value={typed}
                                    onChange={(event) =>
                                        setTyped(event.target.value)
                                    }
                                    autoFocus
                                    autoComplete="off"
                                    spellCheck={false}
                                    className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                />
                                {errors.confirm && (
                                    <span className="mt-1 block text-xs text-accent">
                                        {errors.confirm}
                                    </span>
                                )}
                            </label>
                            <div className="mt-5 flex justify-end gap-2.5">
                                <Button variant="secondary" onClick={onClose}>
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    variant="dangerFill"
                                    disabled={
                                        typed !== server.name || processing
                                    }
                                >
                                    <Trash2 className="size-4" />
                                    <span>
                                        {processing
                                            ? 'Starting…'
                                            : server.status === 'ready'
                                              ? 'Destroy server'
                                              : 'Destroy leftovers'}
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

function CheckingRow({ title }: { title: string }) {
    return (
        <ListRow action={<StatusPill tone="muted">Checking…</StatusPill>}>
            <TwoLine title={title} detail="Asking the server." />
        </ListRow>
    );
}

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
                            Set up
                        </Button>
                    </>
                }
            >
                <TwoLine
                    title="Connect a domain"
                    detail="Create DNS records for your tools automatically with Cloudflare."
                />
            </ListRow>
        );
    }

    const zoneCount = groups.reduce(
        (total, group) => total + group.zones.length,
        0,
    );

    return (
        <div className="border-t border-line py-2.5 first-of-type:border-t-0">
            <div className="flex items-center justify-between gap-4">
                <TwoLine
                    title="Connect a domain"
                    detail={
                        groups.length === 1
                            ? `Managing ${zoneCount} ${zoneCount === 1 ? 'domain' : 'domains'} through one Cloudflare account.`
                            : `Managing ${zoneCount} domains through ${groups.length} Cloudflare accounts, each with its own ExternalDNS.`
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
                        Add account
                    </Button>
                </div>
            </div>
            <ul className="mt-2.5 space-y-1.5">
                {groups.map((group) => (
                    <li
                        key={group.group}
                        className="flex items-baseline gap-3 rounded-lg bg-paper px-3 py-2"
                    >
                        <span className="w-28 shrink-0 truncate font-mono text-xs font-medium">
                            {group.group}
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

    return (
        <div className="border-t border-line py-2.5">
            <div className="flex items-center justify-between gap-4">
                <TwoLine
                    title="Automatic SSL certificates"
                    detail={
                        enabled
                            ? `Renewing through Cloudflare DNS for ${report?.zones?.join(', ') || 'no zones'}.`
                            : 'Renew certificates through Cloudflare, even behind its proxy.'
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
                                Change
                            </Button>
                        </>
                    ) : (
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={disabled}
                            onClick={onEnable}
                        >
                            Enable
                        </Button>
                    )}
                </div>
            </div>
            {blocked.length > 0 && (
                <p className="mt-2 rounded-lg bg-warn-tint px-3 py-2 text-xs text-warn">
                    These can't renew{' '}
                    {enabled
                        ? "because they're outside the token's domains"
                        : 'because Cloudflare proxies them'}
                    : {blocked.join(', ')}.
                </p>
            )}
        </div>
    );
}

function CloudflareDialog({
    title,
    intro,
    tokenHint,
    tokenRequired = false,
    action,
    submitLabel,
    onClose,
}: {
    title: string;
    intro: string;
    tokenHint: string;
    tokenRequired?: boolean;
    action: { url: string; method: 'post' };
    submitLabel: string;
    onClose: () => void;
}) {
    const [token, setToken] = useState('');

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-6"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-[500px] rounded-2xl bg-surface p-7 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <h2 className="text-xl font-semibold tracking-[-0.02em]">
                    {title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-soft">
                    {intro}
                </p>
                <Form action={action} className="mt-5 space-y-4">
                    {({ errors, processing }) => (
                        <>
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-medium text-soft">
                                    Cloudflare API token
                                    {tokenRequired ? '' : ' (optional)'}
                                </span>
                                <input
                                    type="password"
                                    name="cloudflare_token"
                                    value={token}
                                    onChange={(event) =>
                                        setToken(event.target.value)
                                    }
                                    autoFocus
                                    autoComplete="off"
                                    className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                />
                                <span
                                    className={
                                        errors.cloudflare_token
                                            ? 'mt-1 block text-xs text-accent'
                                            : 'mt-1 block text-xs text-soft'
                                    }
                                >
                                    {errors.cloudflare_token ?? tokenHint}
                                </span>
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-medium text-soft">
                                    Name (optional)
                                </span>
                                <input
                                    name="group"
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
                                        'Only needed when the token covers more than one domain. The run will tell you if it does.'}
                                </span>
                            </label>
                            <p className="rounded-lg bg-paper px-3 py-2 text-xs text-soft">
                                The token is handed to the LaraKube CLI for this
                                run and stored on the server as a Kubernetes
                                secret. It is never saved in this app.
                            </p>
                            <div className="flex justify-end gap-2.5">
                                <Button variant="secondary" onClick={onClose}>
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={
                                        processing ||
                                        (tokenRequired && token.trim() === '')
                                    }
                                >
                                    {processing ? 'Starting…' : submitLabel}
                                </Button>
                            </div>
                        </>
                    )}
                </Form>
            </div>
        </div>
    );
}

function PlexCommonsCard({
    server,
    plex,
    disabled,
}: {
    server: Server;
    plex?: PlexStatus | null;
    disabled?: boolean;
}) {
    if (plex === undefined) {
        return <CheckingRow title="Checking Plex Commons…" />;
    }

    const initialized = Boolean(plex?.initialized);
    const tenantCount = Object.keys(plex?.tenants ?? {}).length;

    return (
        <Card
            label="Plex Commons"
            action={
                <div className="flex items-center gap-2">
                    {initialized ? (
                        <StatusPill tone="ok">Active</StatusPill>
                    ) : (
                        <StatusPill tone="muted">Not initialized</StatusPill>
                    )}
                    {initialized && (
                        <>
                            <Link
                                href={`/servers/${server.name}/plex/stop`}
                                method="post"
                                as="button"
                                className={buttonClass(
                                    'ghost',
                                    'sm',
                                    'gap-1 text-soft',
                                )}
                                title="Pause Commons to stop background pods"
                            >
                                <Pause className="size-3" />
                                <span>Pause</span>
                            </Link>
                            <Link
                                href={`/servers/${server.name}/plex/start`}
                                method="post"
                                as="button"
                                className={buttonClass(
                                    'secondary',
                                    'sm',
                                    'gap-1',
                                )}
                                title="Resume Commons pods"
                            >
                                <Play className="size-3" />
                                <span>Resume</span>
                            </Link>
                        </>
                    )}
                </div>
            }
        >
            {!initialized ? (
                <div className="py-4 text-center">
                    <Layers className="mx-auto mb-2 size-7 text-faint" />
                    <p className="text-sm font-medium text-ink">
                        Shared Commons Infrastructure
                    </p>
                    <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-soft">
                        Shared PostgreSQL, Redis, and MinIO S3 storage for
                        tenant apps and static sites. Saves cluster memory and
                        avoids duplicate database pods.
                    </p>
                    <div className="mt-4 flex justify-center">
                        <Link
                            href={`/servers/${server.name}/plex/init`}
                            method="post"
                            as="button"
                            disabled={disabled}
                            className={buttonClass('tools', 'sm', 'gap-1.5')}
                        >
                            <Layers className="size-3.5" />
                            <span>Initialize Plex Commons</span>
                        </Link>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <div>
                        <p className="mb-2 text-xs font-medium text-soft">
                            Core Services
                        </p>
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                            <div className="rounded-lg bg-paper p-2.5 ring-1 ring-line">
                                <div className="flex items-center gap-2">
                                    <Database className="size-3.5 text-brand" />
                                    <span className="text-xs font-semibold text-ink">
                                        PostgreSQL
                                    </span>
                                </div>
                                <p className="mt-1 truncate font-mono text-[10px] text-soft">
                                    postgres.larakube-plex:5432
                                </p>
                            </div>
                            <div className="rounded-lg bg-paper p-2.5 ring-1 ring-line">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs">⚡</span>
                                    <span className="text-xs font-semibold text-ink">
                                        Redis
                                    </span>
                                </div>
                                <p className="mt-1 truncate font-mono text-[10px] text-soft">
                                    redis.larakube-plex:6379
                                </p>
                            </div>
                            <div className="rounded-lg bg-paper p-2.5 ring-1 ring-line">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs">☁️</span>
                                    <span className="text-xs font-semibold text-ink">
                                        MinIO S3
                                    </span>
                                </div>
                                <p className="mt-1 truncate font-mono text-[10px] text-soft">
                                    minio.larakube-plex:9000
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-line/60 pt-3">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-medium text-soft">
                                Connected Tenants ({tenantCount})
                            </span>
                        </div>
                        {tenantCount === 0 ? (
                            <p className="text-xs text-soft">
                                No apps have joined this server's Commons yet.
                                Projects can join from their project dashboard.
                            </p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {Object.entries(plex?.tenants ?? {}).map(
                                    ([tenantId, info]) => (
                                        <span
                                            key={tenantId}
                                            className="inline-flex items-center gap-1.5 rounded-md bg-paper px-2.5 py-1 text-xs font-medium ring-1 ring-line"
                                        >
                                            <span className="font-mono text-ink">
                                                {tenantId}
                                            </span>
                                            {info.redis_index !== undefined && (
                                                <span className="text-[10px] text-soft">
                                                    (DB {info.redis_index})
                                                </span>
                                            )}
                                        </span>
                                    ),
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Card>
    );
}

function TeamAccessCard({
    server,
    users,
    disabled,
    onGrant,
}: {
    server: Server;
    users?: ClusterUser[] | null;
    disabled?: boolean;
    onGrant: () => void;
}) {
    if (users === undefined) {
        return <CheckingRow title="Checking team access…" />;
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
                    {userList.map((user) => (
                        <div
                            key={`${user.namespace}-${user.name}`}
                            className="flex items-center justify-between py-2.5 first:pt-1 last:pb-1"
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex size-7 items-center justify-center rounded-full bg-brand/10 text-brand">
                                    <ShieldCheck className="size-4" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-semibold text-ink">
                                            {user.person || user.name}
                                        </span>
                                        <span className="rounded bg-paper px-1.5 py-0.5 font-mono text-[10px] text-soft">
                                            {user.name}
                                        </span>
                                    </div>
                                    <p className="font-mono text-[11px] text-faint">
                                        namespace: {user.namespace || 'all'}
                                    </p>
                                </div>
                            </div>
                            <Link
                                href={`/servers/${server.name}/access/revoke`}
                                method="post"
                                data={{ name: user.name }}
                                as="button"
                                className={buttonClass('danger', 'sm', 'gap-1')}
                                title="Revoke access"
                            >
                                <Trash2 className="size-3" />
                                <span>Revoke</span>
                            </Link>
                        </div>
                    ))}
                </div>
            )}
        </Card>
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
    const [scope, setScope] = useState('');
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
                                        Scoped Namespaces (optional,
                                        comma-separated)
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
                                <Button variant="secondary" onClick={onClose}>
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={processing || name.trim() === ''}
                                >
                                    {processing
                                        ? 'Minting…'
                                        : 'Mint & Grant Access'}
                                </Button>
                            </div>
                        </>
                    )}
                </Form>
            </div>
        </div>
    );
}
