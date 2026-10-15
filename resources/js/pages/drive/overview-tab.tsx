import { useState } from 'react';
import {
    HardDrive,
    ExternalLink,
    Copy,
    Check,
    Eye,
    EyeOff,
    FileText,
    Sparkles,
    Laptop,
    Smartphone,
    Layers,
    Server as ServerIcon,
} from 'lucide-react';
import Card from '@/components/card';
import { ExternalLinkButton } from '@/lib/open-external';
import { buttonClass } from '@/components/button';
import type { DriveServerInfo, Server as ServerType } from '@/types/larakube';

type Props = {
    server: ServerType;
    info?: DriveServerInfo | null;
    extensionsCount?: number;
};

export default function OverviewTab({
    server,
    info,
    extensionsCount = 0,
}: Props) {
    const [showPassword, setShowPassword] = useState(false);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const copyValue = (key: string, val: string) => {
        void navigator.clipboard.writeText(val);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const host = info?.host || server.ip || `${server.name}.test`;
    const driveUrl = info?.url || `https://${host}`;
    const officeUrl = info?.office?.url;
    const adminUser = info?.adminUsername || 'admin';
    const adminPassword = info?.adminPassword || '';
    const webdavUrl =
        info?.webdavUrl || `https://${host}/remote.php/dav/files/${adminUser}/`;
    const storageMode =
        info?.storageMode ||
        (info?.bucket ? 'Plex Commons (MinIO S3)' : 'Plex Commons S3');
    const isOfficeReady = Boolean(info?.office?.ready);
    const isOfficeInstalled = Boolean(info?.office?.installed);
    const components = info?.components ?? [];

    return (
        <div className="space-y-6">
            {/* Quick Launch & Status Hero */}
            <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-r from-sky-500/10 via-surface to-surface p-6 backdrop-blur-xs">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
                            <h2 className="text-lg font-semibold tracking-tight text-ink">
                                ownCloud Infinite Scale is Live
                            </h2>
                        </div>
                        <p className="text-xs text-soft">
                            Host:{' '}
                            <span className="font-mono font-medium text-ink">
                                {host}
                            </span>
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <ExternalLinkButton
                            url={driveUrl}
                            className={buttonClass('primary', 'sm')}
                        >
                            <ExternalLink className="h-4 w-4" />
                            Open Drive Web UI
                        </ExternalLinkButton>

                        {isOfficeReady && officeUrl && (
                            <ExternalLinkButton
                                url={officeUrl}
                                className={buttonClass('secondary', 'sm')}
                            >
                                <ExternalLink className="h-4 w-4" />
                                Open Collabora Office
                            </ExternalLinkButton>
                        )}
                    </div>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-soft">
                            Core Workload
                        </span>
                        <HardDrive className="h-4 w-4 text-sky-500" />
                    </div>
                    <div className="mt-2">
                        <div className="text-xl font-bold tracking-tight text-ink">
                            drive-ocis
                        </div>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Operational
                        </p>
                    </div>
                </Card>

                <Card>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-soft">
                            Storage Backend
                        </span>
                        <Layers className="h-4 w-4 text-indigo-500" />
                    </div>
                    <div className="mt-2">
                        <div
                            className="truncate text-sm font-bold tracking-tight text-ink"
                            title={storageMode}
                        >
                            {storageMode}
                        </div>
                        <p className="mt-1 truncate text-xs text-soft">
                            {info?.bucket
                                ? `Bucket: ${info.bucket}`
                                : 'Encrypted Object Vault'}
                        </p>
                    </div>
                </Card>

                <Card>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-soft">
                            Office Engine
                        </span>
                        <FileText className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="mt-2">
                        <div className="text-lg font-bold tracking-tight text-ink">
                            {isOfficeReady
                                ? 'Collabora Online'
                                : isOfficeInstalled
                                  ? 'Deploying...'
                                  : 'Not Installed'}
                        </div>
                        <p className="mt-1 text-xs text-soft">
                            {isOfficeReady
                                ? 'WOPI Bridge Connected'
                                : 'Word, Excel, PowerPoint'}
                        </p>
                    </div>
                </Card>

                <Card>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-soft">
                            Web Extensions
                        </span>
                        <Sparkles className="h-4 w-4 text-violet-500" />
                    </div>
                    <div className="mt-2">
                        <div className="text-xl font-bold tracking-tight text-ink">
                            {extensionsCount} Installed
                        </div>
                        <p className="mt-1 text-xs text-soft">
                            Draw.io, Excalidraw, Viewer
                        </p>
                    </div>
                </Card>
            </div>

            {/* Grid: Admin Credentials & Sync Setup */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Admin Credentials Card */}
                <Card label="Initial Administrator Credentials">
                    <div className="space-y-4 pt-2 text-xs">
                        <div className="flex items-center justify-between rounded-lg border border-line bg-paper/50 p-3">
                            <div>
                                <span className="font-semibold text-ink">
                                    Admin Username
                                </span>
                                <p className="mt-0.5 font-mono text-ink">
                                    {adminUser}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() =>
                                    copyValue('adminUser', adminUser)
                                }
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-soft transition hover:bg-paper hover:text-ink"
                            >
                                {copiedKey === 'adminUser' ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                                ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                )}
                                <span>
                                    {copiedKey === 'adminUser'
                                        ? 'Copied'
                                        : 'Copy'}
                                </span>
                            </button>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border border-line bg-paper/50 p-3">
                            <div className="space-y-0.5">
                                <span className="font-semibold text-ink">
                                    Admin Password
                                </span>
                                <p className="font-mono text-ink">
                                    {showPassword
                                        ? adminPassword ||
                                          '(configured in cluster)'
                                        : '••••••••••••••••'}
                                </p>
                            </div>
                            <div className="flex items-center gap-1">
                                {adminPassword && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setShowPassword(!showPassword)
                                        }
                                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-soft transition hover:bg-paper hover:text-ink"
                                    >
                                        {showPassword ? (
                                            <EyeOff className="h-3.5 w-3.5" />
                                        ) : (
                                            <Eye className="h-3.5 w-3.5" />
                                        )}
                                        <span>
                                            {showPassword ? 'Hide' : 'Show'}
                                        </span>
                                    </button>
                                )}
                                {adminPassword && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            copyValue(
                                                'adminPassword',
                                                adminPassword,
                                            )
                                        }
                                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-soft transition hover:bg-paper hover:text-ink"
                                    >
                                        {copiedKey === 'adminPassword' ? (
                                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                                        ) : (
                                            <Copy className="h-3.5 w-3.5" />
                                        )}
                                        <span>
                                            {copiedKey === 'adminPassword'
                                                ? 'Copied'
                                                : 'Copy'}
                                        </span>
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="rounded-lg border border-line bg-paper/30 p-3 text-soft">
                            <p className="leading-relaxed">
                                Use these credentials to sign in to the web
                                interface or configure the desktop and mobile
                                synchronization apps. You can create user Spaces
                                and invite teammates from the ownCloud
                                administration panel.
                            </p>
                        </div>
                    </div>
                </Card>

                {/* Client Sync Endpoints */}
                <Card label="Client Sync & WebDAV Endpoints">
                    <div className="space-y-3 pt-2 text-xs">
                        <div className="rounded-lg border border-line bg-paper/50 p-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Laptop className="h-4 w-4 text-sky-500" />
                                    <span className="font-semibold text-ink">
                                        Desktop Client (Win / Mac / Linux)
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() =>
                                        copyValue('desktopUrl', driveUrl)
                                    }
                                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-soft transition hover:bg-paper hover:text-ink"
                                >
                                    {copiedKey === 'desktopUrl' ? (
                                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                                    ) : (
                                        <Copy className="h-3.5 w-3.5" />
                                    )}
                                    <span>
                                        {copiedKey === 'desktopUrl'
                                            ? 'Copied'
                                            : 'Copy Server URL'}
                                    </span>
                                </button>
                            </div>
                            <p className="mt-1 font-mono text-[11px] text-soft">
                                {driveUrl}
                            </p>
                            <p className="text-muted mt-1 text-[11px]">
                                Enter this server address in the official
                                ownCloud desktop app.
                            </p>
                        </div>

                        <div className="rounded-lg border border-line bg-paper/50 p-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Smartphone className="h-4 w-4 text-emerald-500" />
                                    <span className="font-semibold text-ink">
                                        Mobile App (iOS / Android)
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() =>
                                        copyValue('mobileUrl', driveUrl)
                                    }
                                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-soft transition hover:bg-paper hover:text-ink"
                                >
                                    {copiedKey === 'mobileUrl' ? (
                                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                                    ) : (
                                        <Copy className="h-3.5 w-3.5" />
                                    )}
                                    <span>
                                        {copiedKey === 'mobileUrl'
                                            ? 'Copied'
                                            : 'Copy'}
                                    </span>
                                </button>
                            </div>
                            <p className="mt-1 font-mono text-[11px] text-soft">
                                {driveUrl}
                            </p>
                        </div>

                        <div className="rounded-lg border border-line bg-paper/50 p-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <HardDrive className="h-4 w-4 text-violet-500" />
                                    <span className="font-semibold text-ink">
                                        WebDAV Endpoint
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() =>
                                        copyValue('webdavUrl', webdavUrl)
                                    }
                                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-soft transition hover:bg-paper hover:text-ink"
                                >
                                    {copiedKey === 'webdavUrl' ? (
                                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                                    ) : (
                                        <Copy className="h-3.5 w-3.5" />
                                    )}
                                    <span>
                                        {copiedKey === 'webdavUrl'
                                            ? 'Copied'
                                            : 'Copy'}
                                    </span>
                                </button>
                            </div>
                            <p className="mt-1 font-mono text-[11px] break-all text-soft">
                                {webdavUrl}
                            </p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Active Pod Workloads */}
            {components.length > 0 && (
                <Card label="Active Workload Deployments">
                    <div className="mt-2 overflow-hidden rounded-xl border border-line bg-surface">
                        <table className="w-full text-left text-xs">
                            <thead className="border-b border-line bg-paper/50 text-soft">
                                <tr>
                                    <th className="px-4 py-2.5 font-medium">
                                        Component
                                    </th>
                                    <th className="px-4 py-2.5 font-medium">
                                        Status
                                    </th>
                                    <th className="px-4 py-2.5 font-medium">
                                        Replicas
                                    </th>
                                    <th className="px-4 py-2.5 text-right font-medium">
                                        Restarts
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-line">
                                {components.map((comp) => (
                                    <tr
                                        key={comp.name}
                                        className="transition hover:bg-paper/30"
                                    >
                                        <td className="flex items-center gap-2 px-4 py-3 font-mono font-medium text-ink">
                                            <ServerIcon className="h-3.5 w-3.5 text-soft" />
                                            {comp.name}
                                        </td>
                                        <td className="px-4 py-3">
                                            {comp.ready ? (
                                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 ring-1 ring-emerald-500/20">
                                                    <span className="h-1 w-1 rounded-full bg-emerald-500" />
                                                    Ready
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 ring-1 ring-amber-500/20">
                                                    <span className="h-1 w-1 rounded-full bg-amber-500" />
                                                    Pending
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-soft">
                                            {comp.replicas || '1/1'}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-soft">
                                            {comp.restartCount ?? 0}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
}
