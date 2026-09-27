import { Deferred, Link } from '@inertiajs/react';
import { buttonClass } from '@/components/button';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { serverStatus } from '@/lib/servers';
import { create, show } from '@/routes/servers';
import { providerLabels } from '@/types/larakube';
import type { Server } from '@/types/larakube';

export default function ServersIndex({
    servers,
}: {
    servers?: Server[] | null;
}) {
    const leftovers =
        servers?.filter((server) => server.status !== 'ready') ?? [];

    return (
        <AppLayout title="Servers">
            <header className="mb-5 flex items-center justify-between gap-6">
                <div>
                    <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em]">
                        Servers
                    </h1>
                    <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-soft">
                        Kubernetes servers you created with LaraKube. Each one
                        runs k3s and can host Cluster Tools and your apps.
                    </p>
                </div>
                <Link href={create().url} className={buttonClass('primary')}>
                    Create server
                </Link>
            </header>

            <Deferred
                data="servers"
                fallback={
                    <div className="h-56 animate-pulse rounded-2xl bg-surface ring-1 ring-line" />
                }
            >
                {servers === null ? (
                    <p className="text-sm text-soft">
                        Couldn't read your servers from the LaraKube CLI. Finish
                        Setup, or update the CLI.
                    </p>
                ) : servers?.length === 0 ? (
                    <EmptyState />
                ) : (
                    <>
                        <div className="overflow-hidden rounded-2xl bg-surface px-5.5 ring-1 ring-line ring-inset">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="text-[11px] tracking-[0.06em] text-soft uppercase">
                                        {[
                                            'Name',
                                            'Provider',
                                            'Region',
                                            'IP address',
                                            'Status',
                                            '',
                                        ].map((heading) => (
                                            <th
                                                key={heading}
                                                className="py-3 font-medium"
                                            >
                                                {heading}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {servers?.map((server) => {
                                        const [label, tone] =
                                            serverStatus[server.status];

                                        return (
                                            <tr
                                                key={server.name}
                                                className="border-t border-line"
                                            >
                                                <td className="py-3.5 font-medium">
                                                    <Link
                                                        href={
                                                            show(server.name)
                                                                .url
                                                        }
                                                        className="hover:underline"
                                                    >
                                                        {server.name}
                                                    </Link>
                                                </td>
                                                <td className="text-soft">
                                                    {providerLabels[
                                                        server.provider
                                                    ] ?? server.provider}
                                                </td>
                                                <td className="font-mono text-[13px] text-soft">
                                                    {server.region ?? '—'}
                                                </td>
                                                <td className="font-mono text-[13px]">
                                                    {server.ip ?? '—'}
                                                </td>
                                                <td>
                                                    <StatusPill tone={tone}>
                                                        {label}
                                                    </StatusPill>
                                                </td>
                                                <td className="text-right">
                                                    <Link
                                                        href={
                                                            show(server.name)
                                                                .url
                                                        }
                                                        className="text-xl text-faint hover:text-ink"
                                                        aria-label={`Open ${server.name}`}
                                                    >
                                                        ›
                                                    </Link>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {leftovers.length > 0 && (
                            <p className="mt-3 rounded-[10px] bg-warn-tint px-3.5 py-2.5 text-[13px] text-warn">
                                {leftovers
                                    .map((server) => server.name)
                                    .join(', ')}{' '}
                                stopped partway through. Anything the provider
                                already created is still tracked, so open it to
                                destroy the leftovers.
                            </p>
                        )}
                    </>
                )}
            </Deferred>
        </AppLayout>
    );
}

function EmptyState() {
    return (
        <div className="rounded-2xl bg-surface px-8 py-14 text-center ring-1 ring-line ring-inset">
            <p className="text-lg font-semibold tracking-[-0.015em]">
                No servers yet
            </p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-soft">
                Create one to host Cluster Tools and your Laravel apps. It takes
                about 5 minutes.
            </p>
            <Link
                href={create().url}
                className={buttonClass('primary', 'md', 'mt-5')}
            >
                Create server
            </Link>
        </div>
    );
}
