import { Form } from '@inertiajs/react';
import { useState } from 'react';
import {
    FileText,
    ExternalLink,
    CheckCircle2,
    Plus,
    Lock,
    Shield,
    Users,
    Cpu,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import { ExternalLinkButton } from '@/lib/open-external';
import { buttonClass } from '@/components/button';
import type { DriveOfficeInfo, Server as ServerType } from '@/types/larakube';

type Props = {
    server: ServerType;
    office?: DriveOfficeInfo | null;
    driveHost?: string | null;
};

export default function OfficeTab({ server, office, driveHost }: Props) {
    const isInstalled = Boolean(office?.installed);
    const isReady = Boolean(office?.ready);
    const officeUrl = office?.url;
    const [domain, setDomain] = useState('');
    const [vpnOnly, setVpnOnly] = useState(false);

    return (
        <div className="space-y-6">
            {isReady && officeUrl ? (
                <>
                    {/* Active Collabora Online Status Card */}
                    <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-r from-emerald-500/10 via-surface to-surface p-6 backdrop-blur-xs">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
                                    <h2 className="text-lg font-semibold tracking-tight text-ink">
                                        Collabora Online is Active
                                    </h2>
                                </div>
                                <p className="text-xs text-soft">
                                    Document Editor Host:{' '}
                                    <span className="font-mono font-medium text-ink">
                                        {office.host}
                                    </span>
                                </p>
                            </div>

                            <ExternalLinkButton
                                url={officeUrl}
                                className={buttonClass('primary', 'sm')}
                            >
                                <ExternalLink className="h-4 w-4" />
                                Test Collabora Office
                            </ExternalLinkButton>
                        </div>
                    </div>

                    {/* Features and Protocol Details */}
                    <div className="grid gap-6 lg:grid-cols-2">
                        <Card label="Supported Office Formats">
                            <div className="space-y-3 pt-2 text-xs">
                                <p className="leading-relaxed text-soft">
                                    Clicking any supported file in the ownCloud
                                    Web interface launches the Collabora Online
                                    full-screen editor automatically:
                                </p>

                                <div className="space-y-2">
                                    <div className="rounded-lg border border-line bg-paper/50 p-3">
                                        <div className="flex items-center gap-2 font-semibold text-ink">
                                            <FileText className="h-4 w-4 text-sky-500" />
                                            <span>Text Documents</span>
                                        </div>
                                        <p className="mt-1 font-mono text-[11px] text-soft">
                                            .docx, .doc, .odt, .rtf, .txt
                                        </p>
                                    </div>

                                    <div className="rounded-lg border border-line bg-paper/50 p-3">
                                        <div className="flex items-center gap-2 font-semibold text-ink">
                                            <FileText className="h-4 w-4 text-emerald-500" />
                                            <span>Spreadsheets</span>
                                        </div>
                                        <p className="mt-1 font-mono text-[11px] text-soft">
                                            .xlsx, .xls, .ods, .csv
                                        </p>
                                    </div>

                                    <div className="rounded-lg border border-line bg-paper/50 p-3">
                                        <div className="flex items-center gap-2 font-semibold text-ink">
                                            <FileText className="h-4 w-4 text-amber-500" />
                                            <span>Presentations</span>
                                        </div>
                                        <p className="mt-1 font-mono text-[11px] text-soft">
                                            .pptx, .ppt, .odp
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </Card>

                        <Card label="WOPI Bridge Integration">
                            <div className="space-y-3 pt-2 text-xs">
                                <div className="space-y-2 rounded-lg border border-line bg-paper/50 p-3.5">
                                    <div className="flex items-center gap-2 font-semibold text-ink">
                                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                        <span>WOPI Protocol Connected</span>
                                    </div>
                                    <p className="text-[11px] leading-relaxed text-soft">
                                        Collabora Online communicates with
                                        ownCloud Infinite Scale using the
                                        standardized Web Application Open
                                        Platform Interface (WOPI) protocol. All
                                        edits stream directly to the underlying
                                        S3 storage bucket.
                                    </p>
                                </div>

                                <div className="grid gap-2 sm:grid-cols-2">
                                    <div className="rounded-lg border border-line bg-paper/30 p-3">
                                        <Users className="mb-1 h-4 w-4 text-violet-500" />
                                        <div className="font-semibold text-ink">
                                            Real-Time Multi-User
                                        </div>
                                        <p className="mt-0.5 text-[11px] text-soft">
                                            Simultaneous live cursors & editing
                                        </p>
                                    </div>

                                    <div className="rounded-lg border border-line bg-paper/30 p-3">
                                        <Shield className="mb-1 h-4 w-4 text-sky-500" />
                                        <div className="font-semibold text-ink">
                                            100% Data Sovereignty
                                        </div>
                                        <p className="mt-0.5 text-[11px] text-soft">
                                            No Microsoft or Google telemetry
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </div>
                </>
            ) : isInstalled ? (
                /* Deployed but not ready yet */
                <Card label="Collabora Online Deployment Status">
                    <div className="space-y-3 p-4">
                        <div className="flex items-center gap-3">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                            <div className="text-sm font-medium text-ink">
                                Collabora Online container is initializing on{' '}
                                {server.name}...
                            </div>
                        </div>
                        <p className="text-xs text-soft">
                            The LibreOffice rendering engine is warming up. This
                            typically takes 30–60 seconds on a fresh rollout.
                        </p>
                    </div>
                </Card>
            ) : (
                /* Not Deployed Yet - Promotion & Install Form */
                <div className="space-y-6">
                    <div className="rounded-2xl border border-line bg-surface/60 p-8 backdrop-blur-xs">
                        <div className="max-w-2xl">
                            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20">
                                <FileText className="h-6 w-6" />
                            </div>
                            <h2 className="text-xl font-semibold tracking-tight text-ink">
                                Add Collabora Online (CODE) to your Drive
                            </h2>
                            <p className="mt-2 text-[14px] leading-relaxed text-soft">
                                Upgrade your cloud storage into a full-featured
                                online office suite. Enable real-time
                                collaborative editing for Microsoft Word, Excel,
                                and PowerPoint directly in your browser without
                                sending your data to third-party cloud
                                providers.
                            </p>
                        </div>

                        <div className="mt-8 grid gap-4 sm:grid-cols-3">
                            <div className="rounded-xl border border-line bg-surface p-4">
                                <Users className="mb-2 h-5 w-5 text-emerald-500" />
                                <h3 className="text-xs font-semibold tracking-wider text-ink uppercase">
                                    Simultaneous Co-authoring
                                </h3>
                                <p className="mt-1 text-xs text-soft">
                                    Multiple team members can edit documents,
                                    spreadsheets, and slides at the same time.
                                </p>
                            </div>

                            <div className="rounded-xl border border-line bg-surface p-4">
                                <Cpu className="mb-2 h-5 w-5 text-amber-500" />
                                <h3 className="text-xs font-semibold tracking-wider text-ink uppercase">
                                    Native LibreOffice Core
                                </h3>
                                <p className="mt-1 text-xs text-soft">
                                    Flawless document fidelity and formatting
                                    preservation across all modern and legacy
                                    formats.
                                </p>
                            </div>

                            <div className="rounded-xl border border-line bg-surface p-4">
                                <Shield className="mb-2 h-5 w-5 text-sky-500" />
                                <h3 className="text-xs font-semibold tracking-wider text-ink uppercase">
                                    Private & Secure
                                </h3>
                                <p className="mt-1 text-xs text-soft">
                                    Documents are rendered entirely on your own
                                    cluster. Zero telemetry or external SaaS
                                    dependencies.
                                </p>
                            </div>
                        </div>

                        {/* Deploy Form */}
                        <div className="mt-8 max-w-xl rounded-xl border border-line bg-paper/50 p-6">
                            <h3 className="text-sm font-medium text-ink">
                                Deploy Collabora Online Engine
                            </h3>
                            <p className="mt-1 text-xs text-soft">
                                Deploys Collabora Online and connects the WOPI
                                bridge to your live ownCloud instance.
                            </p>

                            <Form
                                action={`/servers/${server.name}/drive/office/deploy`}
                                method="post"
                                className="mt-5 space-y-4"
                            >
                                <div>
                                    <label className="block text-xs font-medium text-soft">
                                        Office Domain (Optional)
                                    </label>
                                    <input
                                        type="text"
                                        name="domain"
                                        value={domain}
                                        onChange={(e) =>
                                            setDomain(e.target.value)
                                        }
                                        placeholder={
                                            driveHost
                                                ? `office.${driveHost}`
                                                : 'office.drive.example.com'
                                        }
                                        className="placeholder:text-muted mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                                    />
                                    <p className="text-muted mt-1 text-[11px]">
                                        Defaults to office.
                                        {driveHost || 'drive.domain'}
                                    </p>
                                </div>

                                <div className="flex items-center justify-between rounded-xl border border-line bg-surface p-3.5">
                                    <div className="flex items-center gap-2.5">
                                        <Lock className="h-4 w-4 text-soft" />
                                        <div>
                                            <div className="text-xs font-medium text-ink">
                                                Restrict to NetBird VPN
                                            </div>
                                            <div className="text-[11px] text-soft">
                                                Only allow connections through
                                                the cluster's VPN mesh
                                            </div>
                                        </div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        name="vpn_only"
                                        value="1"
                                        checked={vpnOnly}
                                        onChange={(e) =>
                                            setVpnOnly(e.target.checked)
                                        }
                                        className="h-4 w-4 cursor-pointer rounded border-line text-brand focus:ring-brand"
                                    />
                                </div>

                                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-200">
                                    <span className="font-semibold">
                                        Memory Requirement:
                                    </span>{' '}
                                    Collabora Online allocates ~1.5 GB RAM for
                                    the document rendering sandbox.
                                </div>

                                <div className="pt-2">
                                    <Button type="submit" variant="primary">
                                        <Plus className="h-4 w-4" />
                                        Deploy Collabora Online
                                    </Button>
                                </div>
                            </Form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
