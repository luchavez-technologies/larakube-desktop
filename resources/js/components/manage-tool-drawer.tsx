import { useState, useEffect, useCallback } from 'react';
import { Form } from '@inertiajs/react';
import {
    X,
    ExternalLink,
    Trash2,
    XCircle,
    Plus,
    Globe,
    Layers,
    Database,
    Shield,
    Mail,
    Key,
    Server,
} from 'lucide-react';
import Button, { buttonClass } from '@/components/button';
import StatusPill from '@/components/status-pill';
import type { Tone } from '@/components/status-pill';
import ToolLogo from '@/components/tool-logo';
import CopyButton from '@/components/copy-button';
import QrCodePopover from '@/components/qr-code-popover';
import { ExternalLinkButton } from '@/lib/open-external';
import { useRightDrawerOpen } from '@/lib/right-drawer-open';
import { cn } from '@/lib/utils';
import { destroy } from '@/routes/servers/tools';
import {
    toolName,
    toolTagline,
    toolCategories,
    categoryLabel,
} from '@/types/larakube';
import type {
    ClusterTool,
    Server as StackServer,
    Wiring,
} from '@/types/larakube';

const WIRING_LABELS: Record<string, [string, Tone]> = {
    wired: ['Connected', 'ok'],
    unwired: ['Not connected', 'muted'],
    mesh: ['VPN only', 'ok'],
    public: ['Public', 'muted'],
    synced: ['Synced', 'ok'],
    unsynced: ['Not synced', 'muted'],
    OpenBao: ['Rotating', 'ok'],
};

function WiringPill({ value }: { value: Wiring }) {
    const [label, tone] = WIRING_LABELS[value] ?? [value, 'muted'];
    return <StatusPill tone={tone}>{label}</StatusPill>;
}

export type ManageToolDrawerProps = {
    server: StackServer;
    tool: ClusterTool;
    onClose: () => void;
    onDeployAnother?: (tool: ClusterTool) => void;
};

export default function ManageToolDrawer({
    server,
    tool,
    onClose,
    onDeployAnother,
}: ManageToolDrawerProps) {
    useRightDrawerOpen(true);

    const [slidIn, setSlidIn] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);
    const [typedConfirm, setTypedConfirm] = useState('');
    const [purge, setPurge] = useState(false);

    useEffect(() => {
        const frame = requestAnimationFrame(() => setSlidIn(true));
        return () => cancelAnimationFrame(frame);
    }, []);

    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        },
        [onClose],
    );

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const name = toolName(tool);
    const tagline = toolTagline(tool);
    const cats = toolCategories(tool);
    const url =
        tool.url?.split(' ')[0] ?? (tool.host ? `https://${tool.host}` : null);
    const canMulti = tool.multiInstance === true;

    const integrations = (
        [
            [
                'Single sign-on',
                'Sign in with your SSO account.',
                tool.sso,
                Shield,
            ],
            ['Email', 'Sends mail through your Mail server.', tool.mail, Mail],
            ['VPN', 'Reachable only over the team VPN.', tool.vpn, Globe],
            [
                'Secrets',
                'Database password kept in the secrets vault.',
                tool.sync,
                Key,
            ],
        ] as const
    ).filter(([, , value]) => value !== 'N/A' && value !== '—');

    const hasCommons =
        tool.commons &&
        ((tool.commons.databases && tool.commons.databases.length > 0) ||
            (tool.commons.redis && tool.commons.redis.length > 0) ||
            (tool.commons.buckets && tool.commons.buckets.length > 0));

    return (
        <div
            className="fixed inset-0 z-50 flex justify-end bg-ink/45 backdrop-blur-xs"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={`Manage ${name}`}
                className={cn(
                    'flex h-full w-full max-w-[500px] flex-col overflow-hidden bg-surface shadow-2xl transition-transform duration-300 ease-out',
                    slidIn ? 'translate-x-0' : 'translate-x-full',
                )}
                onClick={(event) => event.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between border-b border-line/60 px-6 py-5">
                    <div className="flex min-w-0 items-start gap-3.5">
                        <ToolLogo tool={tool} size="lg" />
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="truncate text-base font-semibold text-ink">
                                    {name}
                                </h2>
                                <StatusPill
                                    tone={tool.installed ? 'ok' : 'muted'}
                                >
                                    {tool.installed
                                        ? 'Installed'
                                        : 'Not installed'}
                                </StatusPill>
                            </div>
                            {tagline && (
                                <p className="mt-0.5 line-clamp-1 text-xs text-soft">
                                    {tagline}
                                </p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded-md bg-badge px-2 py-0.5 text-[10px] font-medium text-soft">
                                    <Server className="size-2.5" />
                                    {server.name}
                                </span>
                                {cats.map((cat) => (
                                    <span
                                        key={cat}
                                        className="rounded-md bg-badge/80 px-1.5 py-0.5 text-[10px] font-medium text-soft capitalize ring-1 ring-line/40"
                                    >
                                        {categoryLabel(cat)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-soft transition hover:bg-paper hover:text-ink"
                        title="Close panel"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
                    {/* Primary Action Button */}
                    {tool.installed && url && (
                        <div className="flex items-center gap-2">
                            <ExternalLinkButton
                                url={url}
                                className={buttonClass(
                                    'dark',
                                    'md',
                                    'flex-1 justify-center gap-2',
                                )}
                            >
                                <ExternalLink className="size-4" />
                                <span>Open {name}</span>
                            </ExternalLinkButton>
                            <div className="shrink-0 rounded-xl bg-badge p-1 ring-1 ring-line/60">
                                <QrCodePopover
                                    url={url}
                                    title={name}
                                    description={`Scan to open ${name} on your phone`}
                                />
                            </div>
                        </div>
                    )}

                    {/* Access Card */}
                    <div className="rounded-2xl bg-surface p-4 ring-1 ring-line">
                        <div className="mb-3 flex items-center justify-between">
                            <span className="text-[11px] font-semibold tracking-wider text-faint uppercase">
                                Access
                            </span>
                            {tool.host && (
                                <span className="text-[10px] text-faint">
                                    Public Ingress
                                </span>
                            )}
                        </div>
                        <div className="space-y-3 text-xs">
                            {url ? (
                                <div className="flex items-center justify-between gap-2 rounded-xl bg-badge/60 p-2.5 ring-1 ring-line/50">
                                    <div className="min-w-0 flex-1">
                                        <span className="block text-[10px] font-medium text-faint uppercase">
                                            Address
                                        </span>
                                        <span className="block truncate font-mono text-xs text-ink select-all">
                                            {url}
                                        </span>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                        <CopyButton value={url} />
                                        <ExternalLinkButton
                                            url={url}
                                            className="rounded-md p-1.5 text-soft transition hover:bg-paper hover:text-ink"
                                            title="Open address"
                                        >
                                            <ExternalLink className="size-3.5" />
                                        </ExternalLinkButton>
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-xl bg-badge/40 p-2.5 text-soft">
                                    <span className="font-medium text-ink">
                                        Cluster Service
                                    </span>
                                    <p className="mt-0.5 text-[11px]">
                                        Runs internally without public ingress
                                        address.
                                    </p>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3 pt-1">
                                <div className="rounded-xl bg-paper p-2.5">
                                    <span className="block text-[10px] font-medium text-faint uppercase">
                                        Namespace
                                    </span>
                                    <span className="mt-0.5 block truncate font-mono text-xs text-ink select-all">
                                        {tool.namespace}
                                    </span>
                                </div>
                                <div className="rounded-xl bg-paper p-2.5">
                                    <span className="block text-[10px] font-medium text-faint uppercase">
                                        Installed
                                    </span>
                                    <span className="mt-0.5 block truncate text-xs text-ink">
                                        {tool.installedAt
                                            ? new Date(
                                                  tool.installedAt,
                                              ).toLocaleDateString(undefined, {
                                                  month: 'short',
                                                  day: 'numeric',
                                                  year: 'numeric',
                                              })
                                            : 'Active'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Integrations Card */}
                    {integrations.length > 0 && (
                        <div className="rounded-2xl bg-surface p-4 ring-1 ring-line">
                            <span className="mb-3 block text-[11px] font-semibold tracking-wider text-faint uppercase">
                                Integrations
                            </span>
                            <div className="divide-y divide-line/60">
                                {integrations.map(
                                    ([title, detail, value, Icon]) => (
                                        <div
                                            key={title}
                                            className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <div className="flex size-7 items-center justify-center rounded-lg bg-badge text-soft">
                                                    <Icon className="size-3.5" />
                                                </div>
                                                <div>
                                                    <span className="block text-xs font-medium text-ink">
                                                        {title}
                                                    </span>
                                                    <span className="block text-[10px] text-soft">
                                                        {detail}
                                                    </span>
                                                </div>
                                            </div>
                                            <WiringPill value={value} />
                                        </div>
                                    ),
                                )}
                            </div>
                        </div>
                    )}

                    {/* Components & Workloads Card (if multi-component) */}
                    {tool.components && tool.components.length > 1 && (
                        <div className="rounded-2xl bg-surface p-4 ring-1 ring-line">
                            <div className="mb-3 flex items-center justify-between">
                                <span className="text-[11px] font-semibold tracking-wider text-faint uppercase">
                                    Components ({tool.components.length})
                                </span>
                                <Layers className="size-3.5 text-faint" />
                            </div>
                            <div className="space-y-2">
                                {tool.components.map((comp) => (
                                    <div
                                        key={comp.key}
                                        className="flex items-center justify-between rounded-xl bg-paper px-3 py-2 text-xs"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="truncate font-medium text-ink">
                                                    {comp.label}
                                                </span>
                                                <span className="font-mono text-[11px] text-soft">
                                                    {comp.deployment}
                                                </span>
                                            </div>
                                            {comp.description && (
                                                <p className="mt-0.5 text-[10px] text-soft">
                                                    {comp.description}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1.5">
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
                                                    Backup
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Commons Backing Services */}
                    {hasCommons && (
                        <div className="rounded-2xl bg-surface p-4 ring-1 ring-line">
                            <div className="mb-2 flex items-center justify-between">
                                <span className="text-[11px] font-semibold tracking-wider text-faint uppercase">
                                    Plex Commons Backing
                                </span>
                                <Database className="size-3.5 text-faint" />
                            </div>
                            <p className="mb-3 text-[11px] text-soft">
                                Holds shared services on this server's Plex
                                Commons cluster.
                            </p>
                            <div className="space-y-2 text-xs">
                                {tool.commons?.databases &&
                                    tool.commons.databases.length > 0 && (
                                        <div className="flex items-center justify-between rounded-xl bg-paper px-3 py-2">
                                            <span className="text-soft">
                                                Database
                                            </span>
                                            <span className="font-mono font-medium text-ink">
                                                {tool.commons.databases.join(
                                                    ', ',
                                                )}
                                            </span>
                                        </div>
                                    )}
                                {tool.commons?.redis &&
                                    tool.commons.redis.length > 0 && (
                                        <div className="flex items-center justify-between rounded-xl bg-paper px-3 py-2">
                                            <span className="text-soft">
                                                Cache / Queues
                                            </span>
                                            <span className="font-mono font-medium text-ink">
                                                Redis (
                                                {tool.commons.redis.join(', ')})
                                            </span>
                                        </div>
                                    )}
                                {tool.commons?.buckets &&
                                    tool.commons.buckets.length > 0 && (
                                        <div className="flex items-center justify-between rounded-xl bg-paper px-3 py-2">
                                            <span className="text-soft">
                                                Object Storage
                                            </span>
                                            <span className="font-mono font-medium text-ink">
                                                {tool.commons.buckets.join(
                                                    ', ',
                                                )}
                                            </span>
                                        </div>
                                    )}
                            </div>
                        </div>
                    )}

                    {/* Deploy Another (Multi-instance) */}
                    {canMulti && onDeployAnother && (
                        <div className="rounded-2xl border border-line bg-paper/50 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h4 className="text-xs font-semibold text-ink">
                                        Multi-Instance Tool
                                    </h4>
                                    <p className="mt-0.5 text-[11px] text-soft">
                                        You can run multiple isolated instances
                                        of {name} on this server.
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                        onClose();
                                        onDeployAnother(tool);
                                    }}
                                >
                                    <Plus className="size-3.5" />
                                    <span>Deploy Another</span>
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Danger Zone / Remove */}
                    <div className="rounded-2xl border border-line bg-surface p-4">
                        {!isRemoving ? (
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h4 className="text-xs font-semibold text-ink">
                                        Remove {name}
                                    </h4>
                                    <p className="mt-0.5 text-[11px] text-soft">
                                        Removes {name} and its workloads from{' '}
                                        {server.name}.
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="danger"
                                    size="sm"
                                    onClick={() => setIsRemoving(true)}
                                >
                                    <Trash2 className="size-3.5" />
                                    <span>Remove…</span>
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-3 rounded-xl border border-accent/40 bg-accent-tint/30 p-3.5">
                                <div className="flex items-center gap-2 text-sm font-semibold text-accent">
                                    <Trash2 className="size-4" />
                                    <span>Confirm removal of {name}?</span>
                                </div>
                                <p className="text-xs leading-relaxed text-soft">
                                    This removes{' '}
                                    <strong className="text-ink">{name}</strong>{' '}
                                    from{' '}
                                    <strong className="text-ink">
                                        {server.name}
                                    </strong>
                                    . It cannot be undone.
                                </p>
                                <Form
                                    action={destroy({
                                        server: server.name,
                                        tool: tool.tool,
                                    })}
                                    className="space-y-3"
                                >
                                    {({ errors, processing }) => (
                                        <>
                                            {tool.host && (
                                                <input
                                                    type="hidden"
                                                    name="domain"
                                                    value={tool.host}
                                                />
                                            )}
                                            <label className="block">
                                                <span className="mb-1 block text-xs font-medium text-soft">
                                                    Type{' '}
                                                    <code className="font-mono text-accent">
                                                        {tool.tool}
                                                    </code>{' '}
                                                    to confirm:
                                                </span>
                                                <input
                                                    name="confirm"
                                                    value={typedConfirm}
                                                    onChange={(e) =>
                                                        setTypedConfirm(
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder={tool.tool}
                                                    autoFocus
                                                    autoComplete="off"
                                                    spellCheck={false}
                                                    className="w-full rounded-lg border-0 bg-surface px-3 py-2 font-mono text-xs ring-1 ring-line outline-none focus:ring-2 focus:ring-accent"
                                                />
                                                {errors.confirm && (
                                                    <span className="mt-1 block text-xs text-accent">
                                                        {errors.confirm}
                                                    </span>
                                                )}
                                            </label>
                                            <label className="flex items-start gap-2.5 rounded-lg bg-surface/80 p-2.5 ring-1 ring-line/50">
                                                <input
                                                    type="checkbox"
                                                    name="purge"
                                                    value="1"
                                                    checked={purge}
                                                    onChange={(e) =>
                                                        setPurge(
                                                            e.target.checked,
                                                        )
                                                    }
                                                    className="mt-0.5 accent-accent"
                                                />
                                                <span className="text-[11px] leading-relaxed text-ink">
                                                    <span className="font-medium">
                                                        Also destroy its data
                                                    </span>{' '}
                                                    — database and uploaded
                                                    files are permanently
                                                    deleted.
                                                </span>
                                            </label>
                                            <div className="flex items-center justify-end gap-2 pt-1">
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => {
                                                        setIsRemoving(false);
                                                        setTypedConfirm('');
                                                    }}
                                                >
                                                    <XCircle className="size-3.5" />
                                                    <span>Cancel</span>
                                                </Button>
                                                <Button
                                                    type="submit"
                                                    variant="dangerFill"
                                                    size="sm"
                                                    disabled={
                                                        typedConfirm !==
                                                            tool.tool ||
                                                        processing
                                                    }
                                                >
                                                    <Trash2 className="size-3.5" />
                                                    <span>
                                                        {processing
                                                            ? 'Starting…'
                                                            : purge
                                                              ? `Remove & Purge`
                                                              : `Remove ${name}`}
                                                    </span>
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </Form>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end border-t border-line px-6 py-3.5">
                    <Button variant="secondary" size="sm" onClick={onClose}>
                        <XCircle className="size-3.5" />
                        <span>Close</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}
