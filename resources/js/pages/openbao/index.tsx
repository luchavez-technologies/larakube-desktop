import { Form, Head } from '@inertiajs/react';
import { useState } from 'react';
import {
    Download,
    Lock,
    RotateCw,
    ShieldCheck,
    ShieldOff,
    Upload,
    UserMinus,
    UserPlus,
} from 'lucide-react';
import AppLayout from '@/layouts/app-layout';
import Button, { buttonClass } from '@/components/button';
import Card from '@/components/card';
import ServerSwitcher from '@/components/server-switcher';
import ExperimentalBadge from '@/components/experimental-badge';
import SyncStatusBadge, {
    type SyncStatus,
} from '@/components/sync-status-badge';
import openbao from '@/routes/servers/openbao';
import { index as openBaoIndex } from '@/routes/servers/openbao';
import type { Server } from '@/types/larakube';

type StaticRoleRow = {
    tool: string;
    instance: string;
    role: string;
    rotationPeriod: string | null;
    wired: boolean;
};

type CustomEnvRow = {
    tool: string;
    instance: string;
    plainCount: number;
    secretCount: number;
    vaulted: boolean;
};

type Status = {
    installed: boolean;
    bootstrapped?: boolean;
    sealed?: boolean | null;
    staticRoles?: StaticRoleRow[];
    customEnv?: CustomEnvRow[];
};

type Props = {
    server: Server;
    servers: Server[];
    isInstalled: boolean;
    status?: Status;
    openBaoSync: {
        status: SyncStatus;
        lastSyncedAt: string | null;
        error: string | null;
    };
};

function Pulse({ className }: { className?: string }) {
    return <div className={`animate-pulse rounded-md bg-paper ${className}`} />;
}

function OpenBaoSkeleton() {
    return (
        <div className="space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
                <div
                    key={i}
                    className="rounded-2xl bg-surface p-6 ring-1 ring-line"
                >
                    <Pulse className="mb-5 h-4 w-48" />
                    <div className="space-y-3">
                        {Array.from({ length: 3 }).map((_, j) => (
                            <Pulse key={j} className="h-3.5 w-full" />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

function OpenBaoEmptyState({ server }: { server: Server }) {
    return (
        <div className="rounded-2xl border border-line bg-surface/60 p-8 backdrop-blur-xs">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20">
                <ShieldCheck className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-ink">
                OpenBao is not deployed on {server.name}
            </h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-soft">
                OpenBao is LaraKube&rsquo;s secrets backend: automatic database
                credential rotation, a backup copy of every generated secret,
                and scoped access grants. Deploy it from the App Store (search
                &ldquo;OpenBao&rdquo;) to manage it here.
            </p>
        </div>
    );
}

export default function OpenBaoIndex({
    server,
    servers,
    isInstalled,
    status,
    openBaoSync,
}: Props) {
    const [importing, setImporting] = useState(false);
    const [importPath, setImportPath] = useState('');
    const [importConfirm, setImportConfirm] = useState('');
    const [granting, setGranting] = useState(false);

    const loading = isInstalled && status === undefined;
    const resolved: Status = status ?? { installed: isInstalled };
    const staticRoles = resolved.staticRoles ?? [];
    const customEnv = resolved.customEnv ?? [];
    const sealed = resolved.sealed ?? null;

    return (
        <AppLayout title={`OpenBao · ${server.name}`}>
            <Head title={`OpenBao · ${server.name}`} />

            <div className="mx-auto max-w-7xl space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold tracking-tight text-ink">
                                OpenBao
                            </h1>
                            <ExperimentalBadge side="bottom" />
                            {isInstalled && resolved.bootstrapped && (
                                <span
                                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${
                                        sealed
                                            ? 'bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400'
                                            : 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400'
                                    }`}
                                >
                                    {sealed ? (
                                        <ShieldOff className="size-3" />
                                    ) : (
                                        <ShieldCheck className="size-3" />
                                    )}
                                    {sealed ? 'Sealed' : 'Unsealed'}
                                </span>
                            )}
                            {isInstalled && (
                                <SyncStatusBadge
                                    status={openBaoSync.status}
                                    lastSyncedAt={openBaoSync.lastSyncedAt}
                                    error={openBaoSync.error}
                                    subject="OpenBao"
                                />
                            )}
                        </div>
                        <p className="mt-1 text-xs text-soft">
                            Secrets backend: database credential rotation,
                            backup copies, and scoped access grants.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <ServerSwitcher
                            servers={servers}
                            value={server.name}
                            buildHref={(name) => openBaoIndex(name).url}
                        />

                        {isInstalled && resolved.bootstrapped && (
                            <Form
                                action={
                                    sealed
                                        ? openbao.unseal(server.name).url
                                        : openbao.seal(server.name).url
                                }
                                method="post"
                            >
                                <button
                                    type="submit"
                                    className={buttonClass(
                                        sealed ? 'primary' : 'danger',
                                        'md',
                                    )}
                                    title={
                                        sealed
                                            ? 'Unseal OpenBao using its stored unseal key'
                                            : 'Seal OpenBao — blocks all secret access cluster-wide until unsealed'
                                    }
                                >
                                    {sealed ? (
                                        <Lock className="h-4 w-4" />
                                    ) : (
                                        <ShieldOff className="h-4 w-4" />
                                    )}
                                    <span>{sealed ? 'Unseal' : 'Seal'}</span>
                                </button>
                            </Form>
                        )}
                    </div>
                </div>

                {!isInstalled ? (
                    <OpenBaoEmptyState server={server} />
                ) : loading ? (
                    <OpenBaoSkeleton />
                ) : (
                    <div className="space-y-6">
                        <Card label="Credential Rotation">
                            {staticRoles.length === 0 ? (
                                <p className="text-xs text-soft">
                                    No tools are wired to OpenBao database
                                    rotation yet. Run{' '}
                                    <code className="rounded bg-paper px-1 py-0.5 text-[11px]">
                                        larakube secrets:wire
                                        --tool=&lt;tool&gt;
                                    </code>{' '}
                                    on a Commons-backed tool to wire one.
                                </p>
                            ) : (
                                <div className="overflow-hidden rounded-xl ring-1 ring-line">
                                    <table className="w-full text-xs">
                                        <thead className="bg-paper/50 text-left text-soft">
                                            <tr>
                                                <th className="px-4 py-2 font-medium">
                                                    Tool
                                                </th>
                                                <th className="px-4 py-2 font-medium">
                                                    Instance
                                                </th>
                                                <th className="px-4 py-2 font-medium">
                                                    Rotation Period
                                                </th>
                                                <th className="px-4 py-2 font-medium">
                                                    Wired
                                                </th>
                                                <th className="px-4 py-2" />
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-line">
                                            {staticRoles.map((row) => (
                                                <tr
                                                    key={`${row.tool}-${row.instance}`}
                                                >
                                                    <td className="px-4 py-2.5 font-medium text-ink">
                                                        {row.tool}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-soft">
                                                        {row.instance || '—'}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-soft">
                                                        {row.rotationPeriod ??
                                                            '—'}
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        {row.wired ? (
                                                            <span className="text-emerald-600 dark:text-emerald-400">
                                                                yes
                                                            </span>
                                                        ) : (
                                                            <span className="text-soft">
                                                                no
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right">
                                                        {row.wired &&
                                                            !sealed && (
                                                                <Form
                                                                    action={
                                                                        openbao.rotate(
                                                                            server.name,
                                                                        ).url
                                                                    }
                                                                    method="post"
                                                                >
                                                                    <input
                                                                        type="hidden"
                                                                        name="tool"
                                                                        value={
                                                                            row.tool
                                                                        }
                                                                    />
                                                                    <button
                                                                        type="submit"
                                                                        className={buttonClass(
                                                                            'ghost',
                                                                            'xs',
                                                                        )}
                                                                        title="Rotate now"
                                                                    >
                                                                        <RotateCw className="size-3.5" />
                                                                        <span>
                                                                            Rotate
                                                                        </span>
                                                                    </button>
                                                                </Form>
                                                            )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Card>

                        <Card
                            label="Access Grants"
                            action={
                                !sealed && (
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => setGranting(true)}
                                    >
                                        <UserPlus className="h-4 w-4" />
                                        Grant Access
                                    </Button>
                                )
                            }
                        >
                            <p className="text-xs text-soft">
                                Grants and revocations are app-scoped and
                                audited through Zitadel — there is no cheap
                                roster to list here yet; use the form to grant,
                                or run{' '}
                                <code className="rounded bg-paper px-1 py-0.5 text-[11px]">
                                    larakube secrets:revoke
                                </code>{' '}
                                to remove one.
                            </p>

                            {granting && (
                                <Form
                                    action={openbao.grant(server.name).url}
                                    method="post"
                                    onSuccess={() => setGranting(false)}
                                    className="mt-4 grid gap-3 sm:grid-cols-3"
                                >
                                    <input
                                        type="text"
                                        name="app"
                                        required
                                        placeholder="App name"
                                        className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                    />
                                    <input
                                        type="email"
                                        name="email"
                                        required
                                        placeholder="user@example.com"
                                        className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                    />
                                    <select
                                        name="role"
                                        defaultValue="developer"
                                        className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                    >
                                        <option value="developer">
                                            developer (read-write)
                                        </option>
                                        <option value="viewer">
                                            viewer (read-only)
                                        </option>
                                    </select>
                                    <div className="col-span-full flex justify-end gap-2">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => setGranting(false)}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="submit"
                                            variant="primary"
                                            size="sm"
                                        >
                                            <UserPlus className="h-4 w-4" />
                                            Grant
                                        </Button>
                                    </div>
                                </Form>
                            )}
                        </Card>

                        <Card label="Custom Environment Variables">
                            {customEnv.length === 0 ? (
                                <p className="text-xs text-soft">
                                    No registered tool instance has custom
                                    environment variables yet.
                                </p>
                            ) : (
                                <div className="overflow-hidden rounded-xl ring-1 ring-line">
                                    <table className="w-full text-xs">
                                        <thead className="bg-paper/50 text-left text-soft">
                                            <tr>
                                                <th className="px-4 py-2 font-medium">
                                                    Tool
                                                </th>
                                                <th className="px-4 py-2 font-medium">
                                                    Instance
                                                </th>
                                                <th className="px-4 py-2 font-medium">
                                                    Plain
                                                </th>
                                                <th className="px-4 py-2 font-medium">
                                                    Secret
                                                </th>
                                                <th className="px-4 py-2 font-medium">
                                                    Vaulted
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-line">
                                            {customEnv.map((row) => (
                                                <tr
                                                    key={`${row.tool}-${row.instance}`}
                                                >
                                                    <td className="px-4 py-2.5 font-medium text-ink">
                                                        {row.tool}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-soft">
                                                        {row.instance || '—'}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-soft">
                                                        {row.plainCount}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-soft">
                                                        {row.secretCount}
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        {row.vaulted ? (
                                                            <span className="text-emerald-600 dark:text-emerald-400">
                                                                yes
                                                            </span>
                                                        ) : (
                                                            <span className="text-soft">
                                                                no
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Card>

                        <Card label="Backup">
                            <div className="flex flex-wrap items-center gap-2.5">
                                <Form
                                    action={openbao.export(server.name).url}
                                    method="post"
                                >
                                    <button
                                        type="submit"
                                        className={buttonClass(
                                            'secondary',
                                            'md',
                                        )}
                                        title="Export every secret to a local JSON file"
                                    >
                                        <Download className="h-4 w-4" />
                                        <span>Export Secrets</span>
                                    </button>
                                </Form>

                                <Button
                                    variant="secondary"
                                    size="md"
                                    onClick={() => setImporting(true)}
                                >
                                    <Upload className="h-4 w-4" />
                                    Import Secrets
                                </Button>
                            </div>

                            {importing && (
                                <Form
                                    action={openbao.import(server.name).url}
                                    method="post"
                                    onSuccess={() => {
                                        setImporting(false);
                                        setImportPath('');
                                        setImportConfirm('');
                                    }}
                                    className="mt-4 space-y-3 rounded-xl bg-accent-tint p-4 ring-1 ring-accent-line"
                                >
                                    <p className="text-xs text-accent">
                                        This overwrites live secrets on{' '}
                                        {server.name} from the file below.
                                    </p>
                                    <input
                                        type="text"
                                        name="path"
                                        required
                                        value={importPath}
                                        onChange={(e) =>
                                            setImportPath(e.target.value)
                                        }
                                        placeholder="/path/to/secrets-export.json"
                                        className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                    />
                                    <div>
                                        <label className="block text-xs font-medium text-soft">
                                            Type{' '}
                                            <strong className="text-ink">
                                                {server.name}
                                            </strong>{' '}
                                            to confirm
                                        </label>
                                        <input
                                            type="text"
                                            name="confirm"
                                            required
                                            autoComplete="off"
                                            value={importConfirm}
                                            onChange={(e) =>
                                                setImportConfirm(e.target.value)
                                            }
                                            placeholder={server.name}
                                            className="mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                        />
                                    </div>
                                    <div className="flex items-center justify-end gap-2">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => setImporting(false)}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="submit"
                                            variant="dangerFill"
                                            size="sm"
                                            disabled={
                                                importConfirm !== server.name
                                            }
                                        >
                                            <UserMinus className="h-4 w-4" />
                                            Import & Overwrite
                                        </Button>
                                    </div>
                                </Form>
                            )}
                        </Card>
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
