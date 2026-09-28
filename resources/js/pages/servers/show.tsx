import { Deferred, Form, Link, usePage } from '@inertiajs/react';
import { useState } from 'react';
import Button, { buttonClass } from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import { ListRow, TwoLine } from '@/components/list-row';
import PageHeader from '@/components/page-header';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { serverStatus } from '@/lib/servers';
import { destroy, dns, index, tls } from '@/routes/servers';
import { index as toolsIndex } from '@/routes/servers/tools';
import { providerLabels } from '@/types/larakube';
import type { Server } from '@/types/larakube';

type DnsGroup = { group: string; zones: string[]; ready: boolean };
type TlsReport = {
    challenge: 'dns' | 'http' | 'local';
    zones?: string[];
    cannotRenew?: string[];
};
type Dialog = 'destroy' | 'domain' | 'ssl' | null;

export default function ShowServer({
    server,
    dns: dnsGroups,
    tls: tlsReport,
}: {
    server: Server;
    dns?: DnsGroup[] | null;
    tls?: TlsReport | null;
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
                <Card label="Next steps">
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
                    <ListRow
                        action={
                            ready ? (
                                <Link
                                    href={toolsIndex(server.name).url}
                                    className={buttonClass('secondary', 'sm')}
                                >
                                    Browse tools
                                </Link>
                            ) : (
                                <Button variant="secondary" size="sm" disabled>
                                    Browse tools
                                </Button>
                            )
                        }
                    >
                        <TwoLine
                            title="Install Cluster Tools"
                            detail="SSO, mail, VPN, chat and more, one click each."
                        />
                    </ListRow>
                    <ListRow
                        action={
                            <Button variant="secondary" size="sm" disabled>
                                Coming soon
                            </Button>
                        }
                    >
                        <TwoLine
                            title="Deploy a Laravel app"
                            detail="Build with GitHub Actions and ship to this server."
                        />
                    </ListRow>
                </Card>

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
                            {ready ? 'Destroy server' : 'Destroy leftovers'}
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
                                    {processing
                                        ? 'Starting…'
                                        : server.status === 'ready'
                                          ? 'Destroy server'
                                          : 'Destroy leftovers'}
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
