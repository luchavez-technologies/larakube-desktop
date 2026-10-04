import { Deferred, Link } from '@inertiajs/react';
import { Plus } from 'lucide-react';
import { buttonClass } from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import { ListRow, TwoLine } from '@/components/list-row';
import PageHeader from '@/components/page-header';
import { ServerActions } from '@/components/server-dialogs';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { serverStatus } from '@/lib/servers';
import { create } from '@/routes/devboxes';
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
                        Open Settings
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
                    <Link
                        href={create().url}
                        className={buttonClass('primary')}
                    >
                        <Plus className="size-4" />
                        <span>Create a dev box</span>
                    </Link>
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
                    <div className="space-y-5">
                        {devBoxes.map((box) => (
                            <DevBoxCard key={box.name} box={box} />
                        ))}
                    </div>
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

function DevBoxCard({ box }: { box: Server }) {
    const [label, tone] = serverStatus[box.status];
    const ssh = `ssh ${box.name}`;
    const tunnel = `ssh -L 8443:127.0.0.1:443 ${box.name}`;

    return (
        <Card
            label={box.name}
            action={
                <div className="flex items-center gap-3">
                    <StatusPill tone={tone}>{label}</StatusPill>
                    <ServerActions server={box} />
                </div>
            }
        >
            <p className="mb-2 font-mono text-xs text-soft">
                {providerLabels[box.provider] ?? box.provider}
                {box.region ? ` · ${box.region}` : ''}
                {box.ip ? ` · ${box.ip}` : ''}
            </p>
            <ListRow action={<CopyButton value={ssh} />}>
                <TwoLine
                    title="Connect"
                    detail="Opens a shell on the box. Use it from your terminal, or point VS Code Remote-SSH or JetBrains Gateway at it."
                    mono
                />
            </ListRow>
            <ListRow action={<CopyButton value="larakube new my-app" />}>
                <TwoLine
                    title="Make an app"
                    detail="On the box: larakube new my-app, then larakube up in its folder."
                />
            </ListRow>
            <ListRow action={<CopyButton value={tunnel} />}>
                <TwoLine
                    title="See an app"
                    detail="Open a tunnel to the box's ingress, then browse to the app on port 8443 (add its *.kube name to your hosts file, and accept the certificate)."
                    mono
                />
            </ListRow>
        </Card>
    );
}
