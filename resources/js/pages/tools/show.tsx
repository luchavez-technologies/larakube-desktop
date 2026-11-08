import { Form, Head, Link } from '@inertiajs/react';
import { useState } from 'react';
import Button, { buttonClass } from '@/components/button';
import BackingServicesCard from '@/components/backing-services-card';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import { ListRow, TwoLine } from '@/components/list-row';
import PageHeader from '@/components/page-header';
import StatusPill from '@/components/status-pill';
import type { Tone } from '@/components/status-pill';
import ToolLogo from '@/components/tool-logo';
import { ExternalLink, Plug, Unlink } from 'lucide-react';
import { ExternalLinkButton } from '@/lib/open-external';
import { destroy, index as toolsIndex } from '@/routes/servers/tools';
import {
    toolName,
    toolTagline,
    toolCategories,
    categoryLabel,
} from '@/types/larakube';
import type {
    BackingServices,
    ClusterTool,
    Server,
    Wiring,
} from '@/types/larakube';

const wiringLabels: Record<string, [string, Tone]> = {
    wired: ['Connected', 'ok'],
    unwired: ['Not connected', 'muted'],
    mesh: ['VPN only', 'ok'],
    public: ['Public', 'muted'],
    synced: ['Synced', 'ok'],
    unsynced: ['Not synced', 'muted'],
    OpenBao: ['Rotating', 'ok'],
};

function WiringPill({ value }: { value: Wiring }) {
    const [label, tone] = wiringLabels[value] ?? [value, 'muted'];
    return <StatusPill tone={tone}>{label}</StatusPill>;
}

export default function ShowTool({
    server,
    tool,
    backing,
}: {
    server: Server;
    tool: ClusterTool;
    /** undefined while loading, null when the tool holds nothing on the Commons. */
    backing?: BackingServices | null;
}) {
    const [removing, setRemoving] = useState(false);
    const name = toolName(tool);
    const tagline = toolTagline(tool);
    const cats = toolCategories(tool);
    const url = tool.url?.split(' ')[0] ?? null;
    const integrations = [
        {
            key: 'sso',
            title: 'Single sign-on',
            detail: 'Sign in with your Zitadel SSO account.',
            value: tool.sso,
            wired: tool.sso === 'wired',
        },
        {
            key: 'mail',
            title: 'Email',
            detail: 'Sends mail through your Stalwart mail server.',
            value: tool.mail,
            wired: tool.mail === 'wired',
        },
        {
            key: 'vpn',
            title: 'VPN',
            detail: 'Reachable only over the NetBird team VPN.',
            value: tool.vpn,
            wired: tool.vpn === 'mesh',
        },
        {
            key: 'rotation',
            title: 'Secrets Rotation',
            detail: 'Database credentials rotated in OpenBao.',
            value: tool.rotation ?? tool.sync,
            wired: ['wired', 'OpenBao', 'synced'].includes(
                tool.rotation ?? tool.sync,
            ),
        },
        {
            key: 'meet',
            title: 'LiveKit Meet',
            detail: 'Team video conferencing rooms.',
            value: tool.meet,
            wired: tool.meet === 'wired',
        },
    ].filter(
        (
            item,
        ): item is {
            key: string;
            title: string;
            detail: string;
            value: Wiring;
            wired: boolean;
        } =>
            item.value !== undefined &&
            item.value !== 'N/A' &&
            item.value !== '—',
    );

    return (
        <>
            <Head title={name} />
            <Link
                href={toolsIndex(server.name).url}
                preserveScroll
                className="mb-3 inline-block text-xs text-soft hover:text-ink"
            >
                ← Apps on {server.name}
            </Link>
            <PageHeader
                title={
                    <span className="flex items-center gap-3">
                        <ToolLogo tool={tool} size="md" />
                        <span>{name}</span>
                    </span>
                }
                badge={
                    <StatusPill tone={tool.installed ? 'ok' : 'muted'}>
                        {tool.installed ? 'Installed' : 'Not installed'}
                    </StatusPill>
                }
                meta={[
                    tagline,
                    tool.host,
                    `on ${server.name}`,
                    ...cats.map((c) => categoryLabel(c)),
                ]
                    .filter(Boolean)
                    .map((part) => (
                        <span key={part}>{part}</span>
                    ))}
                actions={
                    tool.installed &&
                    url && (
                        <ExternalLinkButton
                            url={url}
                            className={buttonClass('dark', 'md', 'gap-1.5')}
                        >
                            <ExternalLink className="size-3.5" />
                            <span>Open {name}</span>
                        </ExternalLinkButton>
                    )
                }
            />

            {tool.installed ? (
                <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
                    <div className="space-y-5">
                        <Card label="Access">
                            {url && (
                                <ListRow action={<CopyButton value={url} />}>
                                    <TwoLine
                                        title="Address"
                                        detail={url}
                                        mono
                                    />
                                </ListRow>
                            )}
                            <ListRow>
                                <TwoLine
                                    title="Namespace"
                                    detail={tool.namespace}
                                    mono
                                />
                            </ListRow>
                            {tool.installedAt && (
                                <ListRow>
                                    <TwoLine
                                        title="Installed"
                                        detail={new Date(
                                            tool.installedAt,
                                        ).toLocaleString()}
                                    />
                                </ListRow>
                            )}
                        </Card>

                        {tool.components && tool.components.length > 1 && (
                            <Card
                                label={`Components & Workloads (${tool.components.length})`}
                            >
                                {tool.components.map((comp) => (
                                    <ListRow
                                        key={comp.key}
                                        action={
                                            <div className="flex items-center gap-2">
                                                <StatusPill
                                                    tone={
                                                        comp.role === 'primary'
                                                            ? 'ok'
                                                            : 'muted'
                                                    }
                                                >
                                                    {comp.role}
                                                </StatusPill>
                                                {comp.backup && (
                                                    <span className="rounded border border-brand/20 bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                                                        Backed up
                                                    </span>
                                                )}
                                            </div>
                                        }
                                    >
                                        <div className="py-0.5">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[13px] font-semibold text-ink">
                                                    {comp.label}
                                                </span>
                                                <span className="font-mono text-xs text-soft">
                                                    {comp.deployment}
                                                </span>
                                            </div>
                                            {comp.description && (
                                                <p className="mt-0.5 text-xs text-soft">
                                                    {comp.description}
                                                </p>
                                            )}
                                        </div>
                                    </ListRow>
                                ))}
                            </Card>
                        )}
                        {backing !== null && (
                            <BackingServicesCard
                                label="Backing Services"
                                services={backing}
                                hasCommons
                                footer={
                                    <p className="rounded-xl border border-line bg-paper p-3 text-[11px] leading-relaxed text-soft">
                                        {name} keeps its data on this
                                        server&apos;s shared Plex Commons
                                        instead of running its own copies, which
                                        saves CPU and memory. That is chosen
                                        when a tool is installed.
                                    </p>
                                }
                            />
                        )}
                    </div>

                    <div className="space-y-5">
                        {integrations.length > 0 && (
                            <Card label="Integrations">
                                {integrations.map((item) => (
                                    <ListRow
                                        key={item.key}
                                        action={
                                            <div className="flex items-center gap-2">
                                                <WiringPill
                                                    value={item.value}
                                                />
                                                {item.wired ? (
                                                    <Form
                                                        action={`/servers/${server.name}/apps/${tool.tool}/unwire`}
                                                        method="post"
                                                    >
                                                        <input
                                                            type="hidden"
                                                            name="capability"
                                                            value={item.key}
                                                        />
                                                        <input
                                                            type="hidden"
                                                            name="domain"
                                                            value={
                                                                tool.host ?? ''
                                                            }
                                                        />
                                                        <button
                                                            type="submit"
                                                            className={buttonClass(
                                                                'ghost',
                                                                'xs',
                                                            )}
                                                            title={`Disconnect ${item.title}`}
                                                        >
                                                            <Unlink className="size-3" />
                                                            <span>
                                                                Disconnect
                                                            </span>
                                                        </button>
                                                    </Form>
                                                ) : (
                                                    <Form
                                                        action={`/servers/${server.name}/apps/${tool.tool}/wire`}
                                                        method="post"
                                                    >
                                                        <input
                                                            type="hidden"
                                                            name="capability"
                                                            value={item.key}
                                                        />
                                                        <input
                                                            type="hidden"
                                                            name="domain"
                                                            value={
                                                                tool.host ?? ''
                                                            }
                                                        />
                                                        <button
                                                            type="submit"
                                                            className={buttonClass(
                                                                'secondary',
                                                                'xs',
                                                            )}
                                                            title={`Connect ${item.title}`}
                                                        >
                                                            <Plug className="size-3" />
                                                            <span>Connect</span>
                                                        </button>
                                                    </Form>
                                                )}
                                            </div>
                                        }
                                    >
                                        <TwoLine
                                            title={item.title}
                                            detail={item.detail}
                                        />
                                    </ListRow>
                                ))}
                            </Card>
                        )}
                        <Card label="Danger zone" tone="danger">
                            <p className="mt-1 mb-3 text-[13px] leading-relaxed text-soft">
                                Removes {name} and its data from {server.name}.
                                Anything signing in through it loses access.
                            </p>
                            <Button
                                variant="danger"
                                onClick={() => setRemoving(true)}
                            >
                                Remove {name}
                            </Button>
                        </Card>
                    </div>
                </div>
            ) : (
                <Card>
                    <p className="py-2 text-sm text-soft">
                        {name} isn't installed on {server.name}. Install it from
                        the{' '}
                        <Link
                            href={toolsIndex(server.name).url}
                            className="text-ink underline"
                        >
                            Apps list
                        </Link>
                        .
                    </p>
                </Card>
            )}

            {removing && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-6"
                    onClick={() => setRemoving(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        className="w-full max-w-[460px] rounded-2xl bg-surface p-7 shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <h2 className="text-xl font-semibold tracking-[-0.02em]">
                            Remove {name}?
                        </h2>
                        <p className="mt-2 text-sm leading-relaxed text-soft">
                            This deletes {name} and its data from {server.name}.
                            It can't be undone.
                        </p>
                        <RemoveForm
                            server={server}
                            tool={tool}
                            onCancel={() => setRemoving(false)}
                        />
                    </div>
                </div>
            )}
        </>
    );
}

function RemoveForm({
    server,
    tool,
    onCancel,
}: {
    server: Server;
    tool: ClusterTool;
    onCancel: () => void;
}) {
    const [typed, setTyped] = useState('');
    const [purge, setPurge] = useState(false);

    return (
        <Form
            action={destroy({ server: server.name, tool: tool.tool })}
            className="mt-4"
        >
            {({ errors, processing }) => (
                <>
                    {tool.host && (
                        <input type="hidden" name="domain" value={tool.host} />
                    )}
                    <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-soft">
                            Type {tool.tool} to confirm
                        </span>
                        <input
                            name="confirm"
                            value={typed}
                            onChange={(event) => setTyped(event.target.value)}
                            autoFocus
                            autoComplete="off"
                            spellCheck={false}
                            className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-tools"
                        />
                        {errors.confirm && (
                            <span className="mt-1 block text-xs text-accent">
                                {errors.confirm}
                            </span>
                        )}
                    </label>
                    <label className="mt-4 flex items-start gap-2.5 rounded-lg bg-accent-tint p-3">
                        <input
                            type="checkbox"
                            name="purge"
                            value="1"
                            checked={purge}
                            onChange={(event) => setPurge(event.target.checked)}
                            className="mt-0.5 accent-accent"
                        />
                        <span className="text-xs leading-relaxed text-ink">
                            <span className="font-medium">
                                Also destroy its data
                            </span>{' '}
                            — database and uploaded files are permanently
                            deleted, not just the tool itself. This cannot be
                            undone.
                        </span>
                    </label>
                    <div className="mt-5 flex justify-end gap-2.5">
                        <Button variant="secondary" onClick={onCancel}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="dangerFill"
                            disabled={typed !== tool.tool || processing}
                        >
                            {processing
                                ? 'Starting…'
                                : purge
                                  ? `Remove ${toolName(tool)} & Purge Data`
                                  : `Remove ${toolName(tool)}`}
                        </Button>
                    </div>
                </>
            )}
        </Form>
    );
}
