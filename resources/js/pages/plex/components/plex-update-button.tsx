import { router } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { ArrowUpCircle } from 'lucide-react';
import Button from '@/components/button';
import ConfirmModal from '@/components/confirm-modal';
import { sendJson } from '@/lib/http';
import { outdated, update } from '@/routes/servers/plex';
import type { Server } from '@/types/larakube';

export type CommonsChange = {
    service: string;
    stateful: boolean;
    from: string | null;
    to: string | null;
    paused: boolean;
};

/**
 * What this CLI build would change on the server's Commons (`plex:outdated`),
 * asked once per page so the header and every engine card agree.
 */
export function usePlexOutdated(serverName: string): CommonsChange[] {
    const [changes, setChanges] = useState<CommonsChange[]>([]);

    useEffect(() => {
        sendJson<{ outdated: CommonsChange[] | null }>(
            outdated(serverName).url,
            'GET',
        )
            .then(({ ok, data }) => setChanges(ok ? (data.outdated ?? []) : []))
            .catch(() => setChanges([]));
    }, [serverName]);

    return changes;
}

/**
 * Update for the Commons, like an app's Update. With `service` it updates that
 * one engine (`plex:update --service`) and leaves the rest as they run;
 * without, every outdated one. Renders nothing when there is nothing to do.
 */
export default function PlexUpdateButton({
    server,
    changes,
    service,
    size = 'md',
}: {
    server: Server;
    changes: CommonsChange[];
    service?: string;
    size?: 'sm' | 'md';
}) {
    const [open, setOpen] = useState(false);
    const [processing, setProcessing] = useState(false);
    const shown =
        service !== undefined
            ? changes.filter((change) => change.service === service)
            : changes;

    if (shown.length === 0) {
        return null;
    }

    const restarting = shown.filter(
        (change) => change.stateful && !change.paused,
    );
    const subject = service ?? `the Commons on ${server.name}`;

    return (
        <>
            <Button
                variant="primary"
                size={size}
                onClick={() => setOpen(true)}
                title={
                    service !== undefined
                        ? `This CLI build would change ${service}`
                        : 'This CLI build would change running Commons services'
                }
            >
                <ArrowUpCircle className="size-3.5" />
                <span>Update</span>
                {service === undefined && (
                    <span className="rounded-full bg-surface/20 px-1.5 text-[11px] font-semibold">
                        {shown.length}
                    </span>
                )}
            </Button>

            <ConfirmModal
                isOpen={open}
                onClose={() => setOpen(false)}
                onConfirm={() => {
                    setProcessing(true);
                    router.post(
                        update(server.name).url,
                        service !== undefined ? { service } : {},
                        { onFinish: () => setProcessing(false) },
                    );
                }}
                processing={processing}
                tone="warn"
                title={`Update ${subject}?`}
                confirmLabel="Update now"
                confirmIcon={<ArrowUpCircle className="size-4" />}
                description={
                    <ul className="space-y-1.5">
                        {shown.map((change) => (
                            <li key={change.service} className="text-xs">
                                <span className="font-semibold text-ink">
                                    {change.service}
                                </span>
                                <span className="text-soft">: </span>
                                {change.from !== change.to ? (
                                    <span className="font-mono text-[11px] text-soft">
                                        {change.from ?? '—'} →{' '}
                                        {change.to ?? '—'}
                                    </span>
                                ) : (
                                    <span className="text-soft">
                                        same image, new settings (probes, limits
                                        or config)
                                    </span>
                                )}
                                {change.paused && (
                                    <span className="text-soft">
                                        {' '}
                                        · paused, applies when resumed
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                }
                notice={
                    restarting.length > 0
                        ? `${restarting.map((change) => change.service).join(', ')} restart${restarting.length === 1 ? 's' : ''}: every app and tool using ${restarting.length === 1 ? 'it' : 'them'} is unavailable for a few seconds.${restarting.some((change) => change.service === 'redis') ? ' Redis keeps data in memory only, so sessions, caches and queued jobs are lost.' : ''} Your services, sizes and settings are kept.`
                        : 'Nothing running restarts. Your services, sizes and settings are kept.'
                }
            />
        </>
    );
}
