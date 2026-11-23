import { router } from '@inertiajs/react';
import { useState } from 'react';
import { Pause, Play } from 'lucide-react';
import Button from '@/components/button';
import ConfirmModal from '@/components/confirm-modal';
import { start, stop } from '@/routes/servers/plex';
import type { Server } from '@/types/larakube';

/**
 * Pause or resume one Commons engine, like an app's Pause. Pausing scales it
 * to zero (its data stays on its volume) and breaks every tenant using it, so
 * it asks first; resuming does not.
 */
export default function PlexPauseButton({
    server,
    service,
    label,
    paused,
    tenantCount,
}: {
    server: Server;
    service: string;
    label: string;
    paused: boolean;
    tenantCount: number;
}) {
    const [open, setOpen] = useState(false);
    const [processing, setProcessing] = useState(false);

    const post = (url: string) => {
        setProcessing(true);
        router.post(url, { service }, { onFinish: () => setProcessing(false) });
    };

    if (paused) {
        return (
            <Button
                variant="secondary"
                size="sm"
                disabled={processing}
                onClick={() => post(start(server.name).url)}
                title={`Resume ${label} (plex:start --service=${service})`}
            >
                <Play className="size-3.5" />
                <span>{processing ? 'Resuming…' : 'Resume'}</span>
            </Button>
        );
    }

    return (
        <>
            <Button
                variant="secondary"
                size="sm"
                onClick={() => setOpen(true)}
                title={`Pause ${label}: scale it to zero, keeping its data`}
            >
                <Pause className="size-3.5" />
                <span>Pause</span>
            </Button>

            <ConfirmModal
                isOpen={open}
                onClose={() => setOpen(false)}
                onConfirm={() => post(stop(server.name).url)}
                processing={processing}
                tone="danger"
                title={`Pause ${label} on ${server.name}?`}
                confirmLabel="Pause"
                confirmIcon={<Pause className="size-4" />}
                description={
                    tenantCount > 0
                        ? `${tenantCount} tenant${tenantCount === 1 ? '' : 's'} use ${label}. Every app and tool among them loses it until you resume it.`
                        : `Nothing uses ${label} right now.`
                }
                notice="Its data stays on its volume. Resume brings it back as it was; updates while it is paused apply when it resumes."
            />
        </>
    );
}
