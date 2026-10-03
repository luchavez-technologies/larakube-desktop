import { Form } from '@inertiajs/react';
import { useState } from 'react';
import { RotateCw, Trash2, Unplug } from 'lucide-react';
import Button from '@/components/button';
import { remove as removeContext } from '@/routes/context';
import { destroy, restart } from '@/routes/servers';
import { providerLabels } from '@/types/larakube';
import type { Server } from '@/types/larakube';

export function DestroyServerDialog({
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

function Shell({
    onClose,
    children,
}: {
    onClose: () => void;
    children: React.ReactNode;
}) {
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
                {children}
            </div>
        </div>
    );
}

export function RestartServerDialog({
    server,
    onClose,
}: {
    server: Server;
    onClose: () => void;
}) {
    return (
        <Shell onClose={onClose}>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">
                Restart {server.name}?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-soft">
                LaraKube reboots the server over SSH and waits until it is
                serving again. Everything on it is unavailable for a minute or
                two, then comes back on its own.
            </p>
            <Form
                action={restart(server.name)}
                className="mt-5 flex justify-end gap-2.5"
            >
                {({ processing }) => (
                    <>
                        <Button variant="secondary" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={processing}>
                            <RotateCw className="size-4" />
                            <span>
                                {processing ? 'Starting…' : 'Restart server'}
                            </span>
                        </Button>
                    </>
                )}
            </Form>
        </Shell>
    );
}

export function RemoveContextDialog({
    server,
    onClose,
}: {
    server: Server;
    onClose: () => void;
}) {
    return (
        <Shell onClose={onClose}>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">
                Remove {server.name}?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-soft">
                This cluster does not answer any more. Removing it only deletes
                its entry (the context, cluster and user) from your{' '}
                <code className="font-mono text-ink">~/.kube/config</code>.
                Nothing is deleted on any server.
            </p>
            <Form
                action={removeContext()}
                className="mt-5 flex justify-end gap-2.5"
            >
                {({ processing }) => (
                    <>
                        <input
                            type="hidden"
                            name="context"
                            value={server.context ?? server.name}
                        />
                        <Button variant="secondary" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="dangerFill"
                            disabled={processing}
                        >
                            <Unplug className="size-4" />
                            <span>
                                {processing
                                    ? 'Starting…'
                                    : 'Remove from kubeconfig'}
                            </span>
                        </Button>
                    </>
                )}
            </Form>
        </Shell>
    );
}

/**
 * What can be done to a server from the list. Only a server LaraKube made
 * can be restarted or destroyed; a discovered one can only be forgotten, and
 * only once it no longer answers.
 */
export function ServerActions({
    server,
    reachable,
}: {
    server: Server;
    reachable?: boolean;
}) {
    const [dialog, setDialog] = useState<
        'restart' | 'destroy' | 'remove' | null
    >(null);
    const made = server.kind !== 'discovered';
    const canRestart =
        made && server.kind === 'vps' && server.status === 'ready';
    const stale = !made && reachable === false;

    if (!made && !stale) {
        return null;
    }

    const small =
        'inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium ring-1 ring-inset transition';

    return (
        <>
            <div
                className="flex items-center gap-1"
                role="group"
                aria-label={`Quick actions for ${server.name}`}
            >
                {canRestart && (
                    <button
                        type="button"
                        onClick={() => setDialog('restart')}
                        title="Restart: reboot the server"
                        className={`${small} text-soft ring-line hover:bg-paper hover:text-ink`}
                    >
                        <RotateCw className="size-3.5" />
                        <span>Restart</span>
                    </button>
                )}
                {made && (
                    <button
                        type="button"
                        onClick={() => setDialog('destroy')}
                        title={
                            server.status === 'ready'
                                ? 'Destroy: delete the server and everything on it'
                                : 'Destroy what was left over'
                        }
                        className={`${small} text-accent ring-accent-line hover:bg-accent-tint`}
                    >
                        <Trash2 className="size-3.5" />
                        <span>
                            {server.status === 'ready'
                                ? 'Destroy'
                                : 'Destroy leftovers'}
                        </span>
                    </button>
                )}
                {stale && (
                    <button
                        type="button"
                        onClick={() => setDialog('remove')}
                        title="Remove this unreachable cluster from your kubeconfig"
                        className={`${small} text-accent ring-accent-line hover:bg-accent-tint`}
                    >
                        <Unplug className="size-3.5" />
                        <span>Remove</span>
                    </button>
                )}
            </div>
            {dialog === 'restart' && (
                <RestartServerDialog
                    server={server}
                    onClose={() => setDialog(null)}
                />
            )}
            {dialog === 'destroy' && (
                <DestroyServerDialog
                    server={server}
                    onClose={() => setDialog(null)}
                />
            )}
            {dialog === 'remove' && (
                <RemoveContextDialog
                    server={server}
                    onClose={() => setDialog(null)}
                />
            )}
        </>
    );
}
