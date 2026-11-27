import { Form } from '@inertiajs/react';
import { AlertTriangle, Globe, Plus, XCircle } from 'lucide-react';
import { useState } from 'react';
import Button from '@/components/button';
import HostPicker from '@/components/host-picker';
import { publicHost } from '@/routes/servers/plex/services';
import type {
    PlexServiceOptionDetail,
    Server as ServerRecord,
} from '@/types/larakube';

/** A subdomain unique to this server, so two servers' Commons never compete for one address. */
function suggestedSubdomain(server: ServerRecord): string {
    const slug = server.name
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return `s3-${slug}`;
}

/**
 * Shown on a Commons object storage engine with no public address: apps still store files, but the
 * links they hand to browsers only work inside the cluster. Adding one re-runs plex:init with
 * --s3-host, which leaves the running engine and its data alone.
 */
export default function PlexPublicAddress({
    server,
    option,
}: {
    server: ServerRecord;
    option: PlexServiceOptionDetail;
}) {
    const [open, setOpen] = useState(false);
    const [host, setHost] = useState('');

    return (
        <>
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-2.5 py-2 text-[11px] leading-snug text-amber-800 ring-1 ring-amber-500/25 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span className="flex-1">
                    No public address. Apps can store files, but links to them
                    won&apos;t open in a browser.
                </span>
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="inline-flex shrink-0 items-center gap-1 font-semibold underline-offset-2 hover:underline"
                >
                    <Plus className="size-3" />
                    Add public address
                </button>
            </div>

            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-6 backdrop-blur-xs"
                    onClick={() => setOpen(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="plex-public-address-title"
                        className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-2xl ring-1 ring-line"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start gap-3.5">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand ring-1 ring-brand/20">
                                <Globe className="size-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3
                                    id="plex-public-address-title"
                                    className="text-base font-semibold text-ink"
                                >
                                    Public address for {option.label}
                                </h3>
                                <p className="mt-1.5 text-xs leading-relaxed text-soft">
                                    Apps on this Commons will hand browsers file
                                    links on this address. The engine and its
                                    files stay as they are; this only adds the
                                    address and its HTTPS certificate.
                                </p>
                            </div>
                        </div>

                        <Form
                            action={
                                publicHost({
                                    server: server.name,
                                    service: option.driver,
                                }).url
                            }
                            method="post"
                            className="mt-5"
                            onSuccess={() => setOpen(false)}
                        >
                            {({ errors, processing }) => (
                                <>
                                    <HostPicker
                                        name="host"
                                        value={host}
                                        onChange={setHost}
                                        serverName={server.name}
                                        serverIp={server.ip}
                                        defaultSubdomain={suggestedSubdomain(
                                            server,
                                        )}
                                        hideLabel
                                        disabled={processing}
                                    />
                                    {errors.host && (
                                        <p className="mt-1.5 text-xs text-accent">
                                            {errors.host}
                                        </p>
                                    )}
                                    <p className="mt-2 text-[11px] text-soft">
                                        Apps that joined before this keep their
                                        old links until they join again.
                                    </p>
                                    <div className="mt-6 flex items-center justify-end gap-2.5">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            disabled={processing}
                                            onClick={() => setOpen(false)}
                                        >
                                            <XCircle className="size-3.5" />
                                            <span>Cancel</span>
                                        </Button>
                                        <Button
                                            type="submit"
                                            variant="primary"
                                            size="sm"
                                            disabled={processing || host === ''}
                                        >
                                            <Globe className="size-3.5" />
                                            <span>
                                                {processing
                                                    ? 'Adding…'
                                                    : 'Add public address'}
                                            </span>
                                        </Button>
                                    </div>
                                </>
                            )}
                        </Form>
                    </div>
                </div>
            )}
        </>
    );
}
