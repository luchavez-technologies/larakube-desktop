import { useEffect, useState } from 'react';
import { Deferred, Link } from '@inertiajs/react';
import { ChevronRight, Plus, Settings } from 'lucide-react';
import { buttonClass } from '@/components/button';
import PageHeader from '@/components/page-header';
import { ServerActions } from '@/components/server-dialogs';
import StatusPill from '@/components/status-pill';
import ViewToggle, { type ViewMode } from '@/components/view-toggle';
import AppLayout from '@/layouts/app-layout';
import { serverStatus } from '@/lib/servers';
import { create, show } from '@/routes/devboxes';
import { show as settingsShow } from '@/routes/settings';
import { index as workspacesIndex } from '@/routes/workspaces';
import { providerLabels } from '@/types/larakube';
import type { Server } from '@/types/larakube';

export default function DevBoxes({
    devBoxes,
    disabled = false,
}: {
    devBoxes?: Server[] | null;
    disabled?: boolean;
}) {
    const [viewMode, setViewMode] = useState<ViewMode>('table');

    useEffect(() => {
        const saved = localStorage.getItem('larakube_view_mode_devboxes');
        if (saved === 'cards' || saved === 'table') {
            setViewMode(saved);
        }
    }, []);

    const handleViewModeChange = (mode: ViewMode) => {
        setViewMode(mode);
        localStorage.setItem('larakube_view_mode_devboxes', mode);
    };

    if (disabled) {
        return (
            <AppLayout title="Dev Boxes">
                <PageHeader
                    title="Dev Boxes"
                    badge={<StatusPill tone="warn">Experimental</StatusPill>}
                />
                <div className="rounded-2xl bg-surface px-8 py-14 text-center ring-1 ring-line ring-inset">
                    <p className="text-lg font-semibold tracking-[-0.015em]">
                        Experimental features are off
                    </p>
                    <p className="mx-auto mt-1.5 max-w-md text-sm text-soft">
                        Dev boxes are still being tried out. Turn on &ldquo;Show
                        experimental features&rdquo; in Settings and save to use
                        them. Dev boxes you already made keep running either
                        way.
                    </p>
                    <Link
                        href={settingsShow().url}
                        className={buttonClass('primary', 'md', 'mt-5')}
                    >
                        <Settings className="size-4" />
                        <span>Open Settings</span>
                    </Link>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout title="Dev Boxes">
            <PageHeader
                title="Dev Boxes"
                badge={<StatusPill tone="warn">Experimental</StatusPill>}
                subtitle="A server you work on, like your own computer: Podman, a local cluster and the LaraKube CLI. Make an app there, run it, and deploy it from there. Billed by your provider."
                actions={
                    <div className="flex items-center gap-2.5">
                        <ViewToggle
                            mode={viewMode}
                            onChange={handleViewModeChange}
                        />
                        <Link
                            href={create().url}
                            className={buttonClass('primary')}
                        >
                            <Plus className="size-4" />
                            <span>Create a dev box</span>
                        </Link>
                    </div>
                }
            />

            <Deferred
                data="devBoxes"
                fallback={
                    <div className="h-40 animate-pulse rounded-2xl bg-surface ring-1 ring-line" />
                }
            >
                {devBoxes == null ? (
                    <p className="text-sm text-soft">
                        The LaraKube CLI isn't ready yet. Finish Setup first.
                    </p>
                ) : devBoxes.length === 0 ? (
                    <div className="rounded-2xl bg-surface px-8 py-14 text-center ring-1 ring-line ring-inset">
                        <p className="text-lg font-semibold tracking-[-0.015em]">
                            No dev boxes yet
                        </p>
                        <p className="mx-auto mt-1.5 max-w-md text-sm text-soft">
                            A dev box is a server with Podman, a local cluster
                            and the LaraKube CLI already set up. Create one,
                            connect with SSH, and run{' '}
                            <span className="font-mono">larakube new</span>.
                        </p>
                    </div>
                ) : (
                    <DevBoxList boxes={devBoxes} viewMode={viewMode} />
                )}
            </Deferred>

            <p className="mt-8 text-xs text-soft">
                Looking for browser editors on a deploy server?{' '}
                <Link
                    href={workspacesIndex().url}
                    className="text-ink underline"
                >
                    Browser workspaces
                </Link>{' '}
                (advanced).
            </p>
        </AppLayout>
    );
}

function DevBoxList({
    boxes,
    viewMode,
}: {
    boxes: Server[];
    viewMode: ViewMode;
}) {
    if (viewMode === 'cards') {
        return (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
                {boxes.map((box) => {
                    const [label, tone] = serverStatus[box.status];

                    return (
                        <div
                            key={box.name}
                            className="rounded-xl bg-surface p-4 ring-1 ring-line transition-all ring-inset hover:ring-faint"
                        >
                            <Link href={show(box.name).url} className="block">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="truncate text-sm font-semibold">
                                        {box.name}
                                    </span>
                                    <StatusPill tone={tone}>{label}</StatusPill>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-soft">
                                    <span>
                                        {providerLabels[box.provider] ??
                                            box.provider}
                                    </span>
                                    {box.region && <span>· {box.region}</span>}
                                </div>
                                <div className="mt-3 flex items-center justify-between">
                                    <span className="font-mono text-[11px] text-faint">
                                        {box.ip ?? 'Provisioning IP…'}
                                    </span>
                                    <span className="text-sm font-medium text-brand hover:underline">
                                        View →
                                    </span>
                                </div>
                            </Link>
                            <div className="mt-3 border-t border-line pt-3">
                                <ServerActions server={box} />
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    return (
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
                            'Quick actions',
                            '',
                        ].map((heading) => (
                            <th key={heading} className="py-3 font-medium">
                                {heading}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {boxes.map((box) => {
                        const [label, tone] = serverStatus[box.status];

                        return (
                            <tr key={box.name} className="border-t border-line">
                                <td className="py-3.5 font-medium">
                                    <Link
                                        href={show(box.name).url}
                                        className="font-semibold hover:underline"
                                    >
                                        {box.name}
                                    </Link>
                                </td>
                                <td className="text-soft">
                                    {providerLabels[box.provider] ??
                                        box.provider}
                                </td>
                                <td className="font-mono text-[13px] text-soft">
                                    {box.region ?? '—'}
                                </td>
                                <td className="font-mono text-[13px]">
                                    {box.ip ?? '—'}
                                </td>
                                <td>
                                    <StatusPill tone={tone}>{label}</StatusPill>
                                </td>
                                <td className="py-2">
                                    <ServerActions server={box} />
                                </td>
                                <td className="text-right">
                                    <Link
                                        href={show(box.name).url}
                                        className="inline-flex p-1 text-faint transition-colors hover:text-ink"
                                        aria-label={`Open ${box.name}`}
                                    >
                                        <ChevronRight className="size-4" />
                                    </Link>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
