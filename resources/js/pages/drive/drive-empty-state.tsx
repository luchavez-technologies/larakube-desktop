import { Form } from '@inertiajs/react';
import { useState } from 'react';
import {
    HardDrive,
    FileText,
    Globe,
    Layers,
    Server as ServerIcon,
    ArrowRight,
    Lock,
    Sparkles,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import type { Server } from '@/types/larakube';

type Props = {
    server: Server;
    otherServers?: Server[];
};

export default function DriveEmptyState({ server, otherServers = [] }: Props) {
    const [domain, setDomain] = useState('');
    const [adminEmail, setAdminEmail] = useState('');
    const [enableOffice, setEnableOffice] = useState(false);
    const [vpnOnly, setVpnOnly] = useState(false);
    const [selectedExtensions, setSelectedExtensions] = useState<string[]>([
        'drawio',
        'excalidraw',
    ]);

    const toggleExtension = (slug: string) => {
        setSelectedExtensions((prev) =>
            prev.includes(slug)
                ? prev.filter((id) => id !== slug)
                : [...prev, slug],
        );
    };

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-line bg-surface/60 p-8 backdrop-blur-xs">
                <div className="max-w-2xl">
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500 ring-1 ring-sky-500/20">
                        <HardDrive className="h-6 w-6" />
                    </div>
                    <h2 className="text-xl font-semibold tracking-tight text-ink">
                        Deploy ownCloud Infinite Scale (oCIS) on {server.name}
                    </h2>
                    <p className="mt-2 text-[14px] leading-relaxed text-soft">
                        Next-generation cloud storage, file synchronization, and
                        document collaboration platform written in Go. Powered
                        by Plex Commons S3 object storage with optional
                        in-browser Collabora Online editing and rich web
                        extensions.
                    </p>
                </div>

                <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-line bg-surface p-4">
                        <Globe className="mb-2 h-5 w-5 text-sky-500" />
                        <h3 className="text-xs font-semibold tracking-wider text-ink uppercase">
                            Fast Multi-Device Sync
                        </h3>
                        <p className="mt-1 text-xs text-soft">
                            Ultra-fast file sync for macOS, Windows, Linux, iOS,
                            and Android via WebDAV & native desktop clients.
                        </p>
                    </div>

                    <div className="rounded-xl border border-line bg-surface p-4">
                        <Layers className="mb-2 h-5 w-5 text-indigo-500" />
                        <h3 className="text-xs font-semibold tracking-wider text-ink uppercase">
                            Plex Commons S3 Storage
                        </h3>
                        <p className="mt-1 text-xs text-soft">
                            Seamlessly leases dedicated MinIO S3 object buckets
                            and Postgres instances with zero setup.
                        </p>
                    </div>

                    <div className="rounded-xl border border-line bg-surface p-4">
                        <FileText className="mb-2 h-5 w-5 text-emerald-500" />
                        <h3 className="text-xs font-semibold tracking-wider text-ink uppercase">
                            Collabora Online Suite
                        </h3>
                        <p className="mt-1 text-xs text-soft">
                            Optional in-browser collaborative editing for Word
                            (.docx), Excel (.xlsx), and PowerPoint (.pptx).
                        </p>
                    </div>

                    <div className="rounded-xl border border-line bg-surface p-4">
                        <Sparkles className="mb-2 h-5 w-5 text-violet-500" />
                        <h3 className="text-xs font-semibold tracking-wider text-ink uppercase">
                            Modular Extensions
                        </h3>
                        <p className="mt-1 text-xs text-soft">
                            Pre-integrated visual editors including Draw.io
                            diagrams, Excalidraw whiteboards, and PDF viewer.
                        </p>
                    </div>
                </div>

                <div className="mt-8 max-w-2xl rounded-xl border border-line bg-paper/50 p-6">
                    <h3 className="text-sm font-medium text-ink">
                        Deploy Drive Blueprint
                    </h3>
                    <p className="mt-1 text-xs text-soft">
                        Configure your ownCloud cluster deployment on{' '}
                        {server.name}.
                    </p>

                    <Form
                        action={`/servers/${server.name}/drive/deploy`}
                        method="post"
                        className="mt-5 space-y-5"
                    >
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="block text-xs font-medium text-soft">
                                    Primary Drive Domain
                                </label>
                                <input
                                    type="text"
                                    name="domain"
                                    value={domain}
                                    onChange={(e) => setDomain(e.target.value)}
                                    placeholder="e.g. drive.example.com"
                                    className="placeholder:text-muted mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                                />
                                <p className="text-muted mt-1 text-[11px]">
                                    Leave empty to use default domain
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-soft">
                                    Admin Email (Optional)
                                </label>
                                <input
                                    type="email"
                                    name="admin_email"
                                    value={adminEmail}
                                    onChange={(e) =>
                                        setAdminEmail(e.target.value)
                                    }
                                    placeholder="admin@example.com"
                                    className="placeholder:text-muted mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                                />
                            </div>
                        </div>

                        {/* Collabora Online Opt-in - unchecked by default */}
                        <div className="rounded-xl border border-line bg-surface p-4">
                            <label className="flex cursor-pointer items-start gap-3">
                                <input
                                    type="checkbox"
                                    name="enable_office"
                                    value="1"
                                    checked={enableOffice}
                                    onChange={(e) =>
                                        setEnableOffice(e.target.checked)
                                    }
                                    className="mt-1 h-4 w-4 rounded border-line text-brand focus:ring-brand"
                                />
                                <div>
                                    <div className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-emerald-500" />
                                        <span className="text-sm font-medium text-ink">
                                            Install Collabora Online (CODE)
                                        </span>
                                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 ring-1 ring-emerald-500/20">
                                            Optional
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs leading-relaxed text-soft">
                                        Adds the Collabora Online editing engine
                                        for real-time document collaboration in
                                        DOCX, XLSX, and PPTX. Note: Requires
                                        approximately ~1.5 GB memory. Leave
                                        unchecked if you only need storage and
                                        sync.
                                    </p>
                                </div>
                            </label>
                        </div>

                        {/* Pre-checked Curated Web Extensions */}
                        <div className="rounded-xl border border-line bg-surface p-4">
                            <div className="mb-2 flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-violet-500" />
                                <span className="text-sm font-medium text-ink">
                                    Curated Web Extensions
                                </span>
                            </div>
                            <p className="mb-3 text-xs text-soft">
                                Seamlessly integrated into ownCloud Web.
                                Selected extensions will be pre-installed:
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-paper/40 p-2.5 hover:bg-paper">
                                    <input
                                        type="checkbox"
                                        name="extensions[]"
                                        value="drawio"
                                        checked={selectedExtensions.includes(
                                            'drawio',
                                        )}
                                        onChange={() =>
                                            toggleExtension('drawio')
                                        }
                                        className="h-4 w-4 rounded border-line text-brand focus:ring-brand"
                                    />
                                    <div>
                                        <div className="text-xs font-medium text-ink">
                                            Draw.io Diagrams
                                        </div>
                                        <div className="text-[11px] text-soft">
                                            Flowcharts and architecture maps
                                        </div>
                                    </div>
                                </label>

                                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-paper/40 p-2.5 hover:bg-paper">
                                    <input
                                        type="checkbox"
                                        name="extensions[]"
                                        value="excalidraw"
                                        checked={selectedExtensions.includes(
                                            'excalidraw',
                                        )}
                                        onChange={() =>
                                            toggleExtension('excalidraw')
                                        }
                                        className="h-4 w-4 rounded border-line text-brand focus:ring-brand"
                                    />
                                    <div>
                                        <div className="text-xs font-medium text-ink">
                                            Excalidraw Whiteboard
                                        </div>
                                        <div className="text-[11px] text-soft">
                                            Sketching and visual brainstorms
                                        </div>
                                    </div>
                                </label>
                            </div>
                        </div>

                        {/* VPN Only Toggle */}
                        <div className="flex items-center justify-between rounded-xl border border-line bg-surface p-3.5">
                            <div className="flex items-center gap-2.5">
                                <Lock className="h-4 w-4 text-soft" />
                                <div>
                                    <div className="text-xs font-medium text-ink">
                                        Restrict to NetBird VPN
                                    </div>
                                    <div className="text-[11px] text-soft">
                                        Only allow connections through the
                                        cluster's VPN mesh
                                    </div>
                                </div>
                            </div>
                            <input
                                type="checkbox"
                                name="vpn_only"
                                value="1"
                                checked={vpnOnly}
                                onChange={(e) => setVpnOnly(e.target.checked)}
                                className="h-4 w-4 cursor-pointer rounded border-line text-brand focus:ring-brand"
                            />
                        </div>

                        <div className="pt-2">
                            <Button type="submit" variant="primary">
                                <HardDrive className="h-4 w-4" />
                                Deploy ownCloud Drive
                            </Button>
                        </div>
                    </Form>
                </div>
            </div>

            {otherServers.length > 0 && (
                <Card label="Active Drive Clusters on other nodes">
                    <div className="space-y-2 pt-2">
                        <p className="text-xs text-soft">
                            ownCloud Infinite Scale is already running on these
                            servers:
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {otherServers.map((other) => (
                                <a
                                    key={other.name}
                                    href={`/servers/${other.name}/drive`}
                                    className="flex items-center justify-between rounded-lg border border-line bg-surface p-3 text-xs font-medium text-ink transition hover:border-sky-500/50 hover:bg-paper"
                                >
                                    <div className="flex items-center gap-2">
                                        <ServerIcon className="h-4 w-4 text-sky-500" />
                                        <span>{other.name}</span>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-soft" />
                                </a>
                            ))}
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
}
