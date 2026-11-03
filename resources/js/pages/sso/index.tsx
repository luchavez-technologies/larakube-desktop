import { Form, Head, usePoll } from '@inertiajs/react';
import { useState } from 'react';
import {
    Building2,
    KeyRound,
    Plug,
    RefreshCw,
    Trash2,
    Unlink,
    UserMinus,
    UserPlus,
} from 'lucide-react';
import AppLayout from '@/layouts/app-layout';
import Button, { buttonClass } from '@/components/button';
import Card from '@/components/card';
import ServerSwitcher from '@/components/server-switcher';
import ExperimentalBadge from '@/components/experimental-badge';
import ToolLogo from '@/components/tool-logo';
import SyncStatusBadge, {
    type SyncStatus,
} from '@/components/sync-status-badge';
import sso, { index as ssoIndex } from '@/routes/servers/sso';
import type { Server } from '@/types/larakube';

type WiredToolRow = {
    tool: string;
    slug: string;
    instance: string;
    host: string | null;
    wired: boolean;
};

type GrantRow = {
    email: string;
    tool: string;
    slug: string;
    role: string;
    project: string;
};

type OrgRow = {
    name: string;
    orgId: string;
    domainVerified: boolean;
};

type Status = {
    installed: boolean;
    org?: string | null;
    wiredTools?: WiredToolRow[];
    grants?: GrantRow[];
    orgs?: OrgRow[];
    orphanedProjects?: string[];
};

type Props = {
    server: Server;
    servers: Server[];
    isInstalled: boolean;
    status?: Status;
    ssoSync: {
        status: SyncStatus;
        lastSyncedAt: string | null;
        error: string | null;
    };
};

function Pulse({ className }: { className?: string }) {
    return <div className={`animate-pulse rounded-md bg-paper ${className}`} />;
}

function SsoSkeleton() {
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

function SsoEmptyState({ server }: { server: Server }) {
    return (
        <div className="rounded-2xl border border-line bg-surface/60 p-8 backdrop-blur-xs">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 ring-1 ring-indigo-500/20">
                <KeyRound className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-ink">
                Zitadel SSO is not deployed on {server.name}
            </h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-soft">
                Zitadel SSO is LaraKube&rsquo;s identity provider — wire tools
                to it from this page once deployed via the App Store.
            </p>
        </div>
    );
}

export default function SsoIndex({
    server,
    servers,
    isInstalled,
    status,
    ssoSync,
}: Props) {
    const [wiring, setWiring] = useState(false);
    const [granting, setGranting] = useState(false);
    const [grantDomainInput, setGrantDomainInput] = useState('');
    const [addingOrg, setAddingOrg] = useState(false);
    const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

    const [unwiring, setUnwiring] = useState<{
        tool: string;
        domain: string;
    } | null>(null);
    const [revoking, setRevoking] = useState<GrantRow | null>(null);
    const [pruning, setPruning] = useState(false);

    usePoll(
        2000,
        { only: ['status', 'ssoSync'] },
        {
            autoStart:
                isInstalled &&
                (ssoSync.status === 'syncing' || ssoSync.status === 'stale'),
        },
    );

    const loading = isInstalled && status === undefined;
    const resolved: Status = status ?? { installed: isInstalled };
    const wiredTools = resolved.wiredTools ?? [];
    const grants = resolved.grants ?? [];
    const orgs = resolved.orgs ?? [];
    const orphanedProjects = resolved.orphanedProjects ?? [];

    return (
        <AppLayout title={`Zitadel SSO · ${server.name}`}>
            <Head title={`Zitadel SSO · ${server.name}`} />

            <div className="mx-auto max-w-7xl space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold tracking-tight text-ink">
                                Zitadel SSO
                            </h1>
                            <ExperimentalBadge side="bottom" />
                            {isInstalled && (
                                <SyncStatusBadge
                                    status={ssoSync.status}
                                    lastSyncedAt={ssoSync.lastSyncedAt}
                                    error={ssoSync.error}
                                    subject="Zitadel SSO"
                                />
                            )}
                        </div>
                        <p className="mt-1 text-xs text-soft">
                            Identity provider: user accounts, authentication
                            wiring, and scoped access grants.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <ServerSwitcher
                            servers={servers}
                            value={server.name}
                            buildHref={(name) => ssoIndex(name).url}
                        />

                        {isInstalled && (
                            <Form
                                action={sso.refresh(server.name).url}
                                method="post"
                            >
                                <button
                                    type="submit"
                                    className={buttonClass('secondary', 'md')}
                                    title="Force an immediate re-sync, bypassing the cached data's freshness window"
                                >
                                    <RefreshCw className="h-4 w-4" />
                                    <span>Resync</span>
                                </button>
                            </Form>
                        )}
                    </div>
                </div>

                {unwiring && (
                    <div className="space-y-3 rounded-xl bg-accent-tint p-4 ring-1 ring-accent-line">
                        <p className="text-xs text-accent">
                            Unwiring {unwiring.tool} from Zitadel SSO
                            immediately breaks login for every user of that tool
                            — they won&rsquo;t be able to sign in via SSO until
                            it&rsquo;s wired again. This does not delete any
                            accounts or data.
                        </p>
                        <div className="flex items-center justify-end gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setUnwiring(null)}
                            >
                                Cancel
                            </Button>
                            <Form
                                action={sso.unwire(server.name).url}
                                method="post"
                                onSuccess={() => setUnwiring(null)}
                            >
                                <input
                                    type="hidden"
                                    name="tool"
                                    value={unwiring.tool}
                                />
                                <input
                                    type="hidden"
                                    name="domain"
                                    value={unwiring.domain}
                                />
                                <button
                                    type="submit"
                                    className={buttonClass('dangerFill', 'sm')}
                                >
                                    <Unlink className="h-4 w-4" />
                                    <span>Unwire {unwiring.tool}</span>
                                </button>
                            </Form>
                        </div>
                    </div>
                )}

                {revoking && (
                    <div className="space-y-3 rounded-xl bg-accent-tint p-4 ring-1 ring-accent-line">
                        <p className="text-xs text-accent">
                            {revoking.email} will immediately lose{' '}
                            {revoking.role} access to {revoking.tool}.
                        </p>
                        <div className="flex items-center justify-end gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setRevoking(null)}
                            >
                                Cancel
                            </Button>
                            <Form
                                action={sso.revoke(server.name).url}
                                method="post"
                                onSuccess={() => setRevoking(null)}
                            >
                                <input
                                    type="hidden"
                                    name="email"
                                    value={revoking.email}
                                />
                                <input
                                    type="hidden"
                                    name="role"
                                    value={revoking.role}
                                />
                                {(() => {
                                    const match = wiredTools.find(
                                        (w) =>
                                            (w.slug &&
                                                w.slug === revoking.slug) ||
                                            (w.tool &&
                                                w.tool === revoking.tool),
                                    );
                                    return match?.host ? (
                                        <input
                                            type="hidden"
                                            name="domain"
                                            value={match.host}
                                        />
                                    ) : null;
                                })()}
                                <button
                                    type="submit"
                                    className={buttonClass('dangerFill', 'sm')}
                                >
                                    <UserMinus className="h-4 w-4" />
                                    <span>Revoke Access</span>
                                </button>
                            </Form>
                        </div>
                    </div>
                )}

                {pruning && (
                    <div className="space-y-3 rounded-xl bg-accent-tint p-4 ring-1 ring-accent-line">
                        <p className="text-xs text-accent">
                            This permanently deletes {selectedProjects.length}{' '}
                            Zitadel project(s) — their OIDC app configurations
                            and role definitions. This cannot be undone.
                        </p>
                        <div className="flex items-center justify-end gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setPruning(false)}
                            >
                                Cancel
                            </Button>
                            <Form
                                action={sso.prune(server.name).url}
                                method="post"
                                onSuccess={() => {
                                    setPruning(false);
                                    setSelectedProjects([]);
                                }}
                            >
                                {selectedProjects.map((p) => (
                                    <input
                                        key={p}
                                        type="hidden"
                                        name="project[]"
                                        value={p}
                                    />
                                ))}
                                <button
                                    type="submit"
                                    className={buttonClass('dangerFill', 'sm')}
                                >
                                    <Trash2 className="h-4 w-4" />
                                    <span>
                                        Delete {selectedProjects.length}{' '}
                                        Project(s)
                                    </span>
                                </button>
                            </Form>
                        </div>
                    </div>
                )}

                {!isInstalled ? (
                    <SsoEmptyState server={server} />
                ) : loading ? (
                    <SsoSkeleton />
                ) : (
                    <div className="space-y-6">
                        <Card
                            label="Wired Tools"
                            action={
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setWiring((v) => !v)}
                                >
                                    <Plug className="h-4 w-4" />
                                    <span>Wire a Tool</span>
                                </Button>
                            }
                        >
                            {wiring && (
                                <Form
                                    action={sso.wire(server.name).url}
                                    method="post"
                                    onSuccess={() => setWiring(false)}
                                    className="mb-4 grid gap-3 sm:grid-cols-3"
                                >
                                    <input
                                        type="text"
                                        name="tool"
                                        required
                                        placeholder="Tool name (e.g. forgejo)"
                                        className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                    />
                                    <input
                                        type="text"
                                        name="domain"
                                        required
                                        placeholder="Domain (e.g. git.example.com)"
                                        className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                    />
                                    <input
                                        type="email"
                                        name="admin_email"
                                        placeholder="Admin email (optional)"
                                        className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                    />
                                    <div className="col-span-full flex justify-end gap-2">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => setWiring(false)}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="submit"
                                            variant="primary"
                                            size="sm"
                                        >
                                            <Plug className="h-4 w-4" />
                                            <span>Wire Tool</span>
                                        </Button>
                                    </div>
                                </Form>
                            )}

                            {wiredTools.length === 0 ? (
                                <p className="text-xs text-soft">
                                    No tools are wired to Zitadel SSO yet.
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
                                                    Host
                                                </th>
                                                <th className="px-4 py-2 font-medium">
                                                    Wired
                                                </th>
                                                <th className="px-4 py-2" />
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-line">
                                            {wiredTools.map((row) => (
                                                <tr
                                                    key={`${row.tool}-${row.instance}`}
                                                >
                                                    <td className="px-4 py-2.5">
                                                        <div className="flex items-center gap-2.5">
                                                            <ToolLogo
                                                                slug={row.slug}
                                                                size="sm"
                                                            />
                                                            <span className="font-medium text-ink">
                                                                {row.tool}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-soft">
                                                        {row.instance || '—'}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-soft">
                                                        {row.host ?? '—'}
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
                                                        {row.wired && (
                                                            <button
                                                                type="button"
                                                                className={buttonClass(
                                                                    'ghost',
                                                                    'xs',
                                                                )}
                                                                onClick={() =>
                                                                    setUnwiring(
                                                                        {
                                                                            tool:
                                                                                row.slug ||
                                                                                row.tool,
                                                                            domain:
                                                                                row.host ??
                                                                                '',
                                                                        },
                                                                    )
                                                                }
                                                                title={`Unwire ${row.tool}`}
                                                            >
                                                                <Unlink className="size-3.5" />
                                                                <span>
                                                                    Unwire
                                                                </span>
                                                            </button>
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
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setGranting((v) => !v)}
                                >
                                    <UserPlus className="h-4 w-4" />
                                    <span>Grant Access</span>
                                </Button>
                            }
                        >
                            {granting && (
                                <Form
                                    action={sso.grant(server.name).url}
                                    method="post"
                                    onSuccess={() => {
                                        setGranting(false);
                                        setGrantDomainInput('');
                                    }}
                                    className="mb-4 grid gap-3 sm:grid-cols-4"
                                >
                                    <input
                                        type="email"
                                        name="email"
                                        required
                                        placeholder="user@example.com"
                                        className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                    />
                                    <select
                                        name="tool"
                                        required
                                        defaultValue=""
                                        onChange={(e) => {
                                            const match = wiredTools.find(
                                                (w) =>
                                                    (w.slug || w.tool) ===
                                                    e.target.value,
                                            );
                                            if (match?.host) {
                                                setGrantDomainInput(match.host);
                                            }
                                        }}
                                        className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                    >
                                        <option value="" disabled>
                                            Select tool
                                        </option>
                                        {wiredTools.map((w) => (
                                            <option
                                                key={`${w.slug}-${w.instance}`}
                                                value={w.slug || w.tool}
                                            >
                                                {w.tool}{' '}
                                                {w.instance
                                                    ? `(${w.instance})`
                                                    : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <input
                                        type="text"
                                        name="domain"
                                        required
                                        value={grantDomainInput}
                                        onChange={(e) =>
                                            setGrantDomainInput(e.target.value)
                                        }
                                        placeholder="Domain (e.g. git.example.com)"
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
                                            <span>Grant</span>
                                        </Button>
                                    </div>
                                </Form>
                            )}

                            {grants.length === 0 ? (
                                <p className="text-xs text-soft">
                                    No SSO access grants found.
                                </p>
                            ) : (
                                <div className="overflow-hidden rounded-xl ring-1 ring-line">
                                    <table className="w-full text-xs">
                                        <thead className="bg-paper/50 text-left text-soft">
                                            <tr>
                                                <th className="px-4 py-2 font-medium">
                                                    Email
                                                </th>
                                                <th className="px-4 py-2 font-medium">
                                                    Tool
                                                </th>
                                                <th className="px-4 py-2 font-medium">
                                                    Role
                                                </th>
                                                <th className="px-4 py-2 font-medium">
                                                    Project
                                                </th>
                                                <th className="px-4 py-2" />
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-line">
                                            {grants.map((row) => (
                                                <tr
                                                    key={`${row.email}-${row.tool}-${row.role}-${row.project}`}
                                                >
                                                    <td className="px-4 py-2.5 font-medium text-ink">
                                                        {row.email}
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <div className="flex items-center gap-2.5">
                                                            <ToolLogo
                                                                slug={row.slug}
                                                                size="sm"
                                                            />
                                                            <span className="text-soft">
                                                                {row.tool}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-soft">
                                                        {row.role}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-soft">
                                                        {row.project || '—'}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right">
                                                        <button
                                                            type="button"
                                                            className={buttonClass(
                                                                'ghost',
                                                                'xs',
                                                            )}
                                                            onClick={() =>
                                                                setRevoking(row)
                                                            }
                                                            title={`Revoke ${row.email}`}
                                                        >
                                                            <UserMinus className="size-3.5" />
                                                            <span>Revoke</span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Card>

                        <Card
                            label="Partner Orgs"
                            action={
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setAddingOrg((v) => !v)}
                                >
                                    <Building2 className="h-4 w-4" />
                                    <span>New Partner Org</span>
                                </Button>
                            }
                        >
                            {addingOrg && (
                                <Form
                                    action={sso.org(server.name).url}
                                    method="post"
                                    onSuccess={() => setAddingOrg(false)}
                                    className="mb-4 grid gap-3 sm:grid-cols-2"
                                >
                                    <input
                                        type="text"
                                        name="zone"
                                        required
                                        placeholder="Zone / Domain (e.g. example.com)"
                                        className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                    />
                                    <input
                                        type="text"
                                        name="cloudflare_token"
                                        placeholder="Cloudflare token (optional)"
                                        className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                    />
                                    <input
                                        type="text"
                                        name="org_name"
                                        placeholder="Organization name (optional)"
                                        className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                    />
                                    <input
                                        type="email"
                                        name="admin_email"
                                        placeholder="Admin email (optional)"
                                        className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                                    />
                                    <div className="col-span-full flex justify-end gap-2">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => setAddingOrg(false)}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="submit"
                                            variant="primary"
                                            size="sm"
                                        >
                                            <Building2 className="h-4 w-4" />
                                            <span>Configure Org</span>
                                        </Button>
                                    </div>
                                </Form>
                            )}

                            {orgs.length === 0 ? (
                                <p className="text-xs text-soft">
                                    No partner organizations configured.
                                </p>
                            ) : (
                                <div className="overflow-hidden rounded-xl ring-1 ring-line">
                                    <table className="w-full text-xs">
                                        <thead className="bg-paper/50 text-left text-soft">
                                            <tr>
                                                <th className="px-4 py-2 font-medium">
                                                    Organization
                                                </th>
                                                <th className="px-4 py-2 font-medium">
                                                    Org ID
                                                </th>
                                                <th className="px-4 py-2 font-medium">
                                                    Domain Verified
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-line">
                                            {orgs.map((row) => (
                                                <tr key={row.orgId || row.name}>
                                                    <td className="px-4 py-2.5 font-medium text-ink">
                                                        {row.name}
                                                    </td>
                                                    <td className="px-4 py-2.5 font-mono text-soft">
                                                        {row.orgId}
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        {row.domainVerified ? (
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

                        {orphanedProjects.length > 0 && (
                            <Card
                                label="Orphaned Projects"
                                action={
                                    <Button
                                        variant="danger"
                                        size="sm"
                                        disabled={selectedProjects.length === 0}
                                        onClick={() => setPruning(true)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        <span>Prune Selected</span>
                                    </Button>
                                }
                            >
                                <div className="space-y-2">
                                    {orphanedProjects.map((project) => {
                                        const checked =
                                            selectedProjects.includes(project);
                                        return (
                                            <label
                                                key={project}
                                                className="flex cursor-pointer items-center gap-2.5 text-xs text-ink"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => {
                                                        setSelectedProjects(
                                                            (prev) =>
                                                                checked
                                                                    ? prev.filter(
                                                                          (p) =>
                                                                              p !==
                                                                              project,
                                                                      )
                                                                    : [
                                                                          ...prev,
                                                                          project,
                                                                      ],
                                                        );
                                                    }}
                                                    className="rounded border-line bg-paper text-accent focus:ring-accent"
                                                />
                                                <span className="font-mono">
                                                    {project}
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </Card>
                        )}
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
