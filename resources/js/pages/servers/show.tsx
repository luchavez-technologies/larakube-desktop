import { Form, Link } from '@inertiajs/react';
import { useState } from 'react';
import Button from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import { ListRow, TwoLine } from '@/components/list-row';
import PageHeader from '@/components/page-header';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { serverStatus } from '@/lib/servers';
import { destroy, index } from '@/routes/servers';
import { providerLabels } from '@/types/larakube';
import type { Server } from '@/types/larakube';

const nextSteps = [
    [
        'Connect a domain',
        'Point your domain at this server with Cloudflare DNS.',
    ],
    [
        'Automatic SSL certificates',
        'Renew certificates through Cloudflare, even behind its proxy.',
    ],
    ['Install Cluster Tools', 'SSO, mail, VPN, chat and more, one click each.'],
    [
        'Deploy a Laravel app',
        'Build with GitHub Actions and ship to this server.',
    ],
] as const;

export default function ShowServer({ server }: { server: Server }) {
    const [confirming, setConfirming] = useState(false);
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
                    {nextSteps.map(([title, detail]) => (
                        <ListRow
                            key={title}
                            action={
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled
                                    title="Coming soon"
                                >
                                    Coming soon
                                </Button>
                            }
                        >
                            <TwoLine title={title} detail={detail} />
                        </ListRow>
                    ))}
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
                            onClick={() => setConfirming(true)}
                        >
                            {ready ? 'Destroy server' : 'Destroy leftovers'}
                        </Button>
                    </Card>
                </div>
            </div>

            {confirming && (
                <DestroyDialog
                    server={server}
                    onClose={() => setConfirming(false)}
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
