import { Form } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import {
    Plus,
    KeyRound,
    Trash2,
    Search,
    Shield,
    ShieldCheck,
    RotateCw,
    User,
    Inbox,
    Copy,
    Check,
    XCircle,
    HardDrive,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import type { Server } from '@/types/larakube';

export type AccountRow = {
    email: string;
    name: string;
    role: string;
    quota: string;
    quotaBytes?: number | null;
    used: string;
    usedBytes?: number | null;
};

type Props = {
    server: Server;
    accounts?: AccountRow[];
    queue?: number;
    hasSso?: boolean;
};

function generatePassword(): string {
    const chars =
        'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*';
    let pass = '';
    for (let i = 0; i < 16; i++) {
        pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
}

export default function MailboxesTab({
    server,
    accounts = [],
    queue = 0,
    hasSso = false,
}: Props) {
    const [search, setSearch] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [resetTarget, setResetTarget] = useState<AccountRow | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AccountRow | null>(null);

    // Create modal state
    const [newEmail, setNewEmail] = useState('');
    const [newName, setNewName] = useState('');
    const [newPassword, setNewPassword] = useState(generatePassword());
    const [newQuota, setNewQuota] = useState('10');
    const [createSso, setCreateSso] = useState(hasSso);

    // Reset password state
    const [newResetPassword, setNewResetPassword] =
        useState(generatePassword());
    const [resetSso, setResetSso] = useState(hasSso);
    const [copiedReset, setCopiedReset] = useState(false);

    const filteredAccounts = useMemo(() => {
        if (!search.trim()) return accounts;
        const q = search.toLowerCase();
        return accounts.filter(
            (a) =>
                a.email.toLowerCase().includes(q) ||
                a.name.toLowerCase().includes(q),
        );
    }, [accounts, search]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="relative w-64">
                        <Search className="text-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search mailboxes..."
                            className="placeholder:text-muted w-full rounded-lg border border-line bg-surface py-1.5 pr-3 pl-9 text-xs text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                        />
                    </div>
                    {queue > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-500 ring-1 ring-amber-500/20">
                            <Inbox className="h-3.5 w-3.5" />
                            {queue} queued message{queue > 1 ? 's' : ''}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {hasSso && (
                        <Form
                            action={`/servers/${server.name}/mail/sync-sso`}
                            method="post"
                        >
                            <Button
                                type="submit"
                                variant="secondary"
                                size="sm"
                                title="Sync existing Stalwart mail accounts to Zitadel SSO"
                            >
                                <RotateCw className="h-4 w-4" />
                                Sync to SSO
                            </Button>
                        </Form>
                    )}
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                            setNewPassword(generatePassword());
                            setCreateSso(hasSso);
                            setIsCreateOpen(true);
                        }}
                    >
                        <Plus className="h-4 w-4" />
                        New Mailbox
                    </Button>
                </div>
            </div>

            <Card className="overflow-hidden p-0">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="border-b border-line bg-paper/50 text-soft">
                                <th className="px-5 py-3 font-medium">
                                    Mailbox
                                </th>
                                <th className="px-5 py-3 font-medium">
                                    Display Name
                                </th>
                                <th className="px-5 py-3 font-medium">Role</th>
                                <th className="px-5 py-3 font-medium">
                                    Storage Quota
                                </th>
                                <th className="px-5 py-3 font-medium">Used</th>
                                <th className="px-5 py-3 text-right font-medium">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line text-ink">
                            {filteredAccounts.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="px-5 py-8 text-center text-soft"
                                    >
                                        No mailboxes found.
                                    </td>
                                </tr>
                            ) : (
                                filteredAccounts.map((account) => (
                                    <tr
                                        key={account.email}
                                        className="transition hover:bg-paper/30"
                                    >
                                        <td className="px-5 py-3.5 font-medium">
                                            <div className="flex items-center gap-2">
                                                {account.role.toLowerCase() ===
                                                'admin' ? (
                                                    <Shield className="h-3.5 w-3.5 text-amber-500" />
                                                ) : (
                                                    <User className="h-3.5 w-3.5 text-soft" />
                                                )}
                                                <span>{account.email}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5 text-soft">
                                            {account.name || '—'}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-1.5">
                                                <span
                                                    className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${
                                                        account.role.toLowerCase() ===
                                                        'admin'
                                                            ? 'bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20'
                                                            : 'bg-zinc-500/10 text-zinc-400 ring-1 ring-zinc-500/20'
                                                    }`}
                                                >
                                                    {account.role}
                                                </span>
                                                {hasSso && (
                                                    <span
                                                        className="inline-flex items-center gap-1 rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand ring-1 ring-brand/20"
                                                        title="SSO Enabled via Zitadel"
                                                    >
                                                        <ShieldCheck className="h-3 w-3" />
                                                        SSO
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5 text-soft">
                                            <div className="flex items-center gap-1.5">
                                                <HardDrive className="text-muted h-3.5 w-3.5" />
                                                <span>{account.quota}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5 text-soft">
                                            {account.used}
                                        </td>
                                        <td className="px-5 py-3.5 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => {
                                                        setNewResetPassword(
                                                            generatePassword(),
                                                        );
                                                        setCopiedReset(false);
                                                        setResetSso(hasSso);
                                                        setResetTarget(account);
                                                    }}
                                                    title="Reset Password"
                                                >
                                                    <KeyRound className="h-3.5 w-3.5" />
                                                    Reset
                                                </Button>

                                                {account.email !== 'admin' && (
                                                    <Button
                                                        variant="danger"
                                                        size="sm"
                                                        onClick={() =>
                                                            setDeleteTarget(
                                                                account,
                                                            )
                                                        }
                                                        title="Delete Mailbox"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Create Mailbox Modal */}
            {isCreateOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
                    <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-base font-semibold text-ink">
                                Create Mailbox
                            </h3>
                            <button
                                onClick={() => setIsCreateOpen(false)}
                                className="text-soft transition hover:text-ink"
                            >
                                <XCircle className="h-5 w-5" />
                            </button>
                        </div>

                        <Form
                            action={`/servers/${server.name}/mail/accounts`}
                            method="post"
                            onSubmit={() => setIsCreateOpen(false)}
                            className="space-y-4"
                        >
                            <div>
                                <label className="block text-xs font-medium text-soft">
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    name="email"
                                    required
                                    value={newEmail}
                                    onChange={(e) =>
                                        setNewEmail(e.target.value)
                                    }
                                    placeholder="alice@example.com"
                                    className="placeholder:text-muted mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-soft">
                                    Display Name
                                </label>
                                <input
                                    type="text"
                                    name="name"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="Alice Smith"
                                    className="placeholder:text-muted mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-medium text-soft">
                                        Password
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setNewPassword(generatePassword())
                                        }
                                        className="text-[11px] text-brand transition hover:underline"
                                    >
                                        Regenerate
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    name="password"
                                    required
                                    value={newPassword}
                                    onChange={(e) =>
                                        setNewPassword(e.target.value)
                                    }
                                    className="mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-xs text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-soft">
                                    Disk Quota (GB)
                                </label>
                                <input
                                    type="number"
                                    name="quota"
                                    min="1"
                                    value={newQuota}
                                    onChange={(e) =>
                                        setNewQuota(e.target.value)
                                    }
                                    className="mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                                />
                            </div>

                            {hasSso && (
                                <div className="rounded-lg border border-line bg-paper/50 p-3">
                                    <input type="hidden" name="sso" value="0" />
                                    <label className="flex cursor-pointer items-start gap-2.5">
                                        <input
                                            type="checkbox"
                                            name="sso"
                                            value="1"
                                            checked={createSso}
                                            onChange={(e) =>
                                                setCreateSso(e.target.checked)
                                            }
                                            className="mt-0.5 rounded border-line text-brand focus:ring-brand"
                                        />
                                        <div>
                                            <span className="block text-xs font-medium text-ink">
                                                Create matching SSO identity
                                            </span>
                                            <span className="block text-[11px] text-soft">
                                                Provisions a Zitadel user
                                                account with matching email and
                                                password.
                                            </span>
                                        </div>
                                    </label>
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-4">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setIsCreateOpen(false)}
                                >
                                    <XCircle className="h-4 w-4" />
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    variant="primary"
                                    size="sm"
                                >
                                    <Plus className="h-4 w-4" />
                                    Create Mailbox
                                </Button>
                            </div>
                        </Form>
                    </div>
                </div>
            )}

            {/* Reset Password Modal */}
            {resetTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
                    <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-base font-semibold text-ink">
                                Reset Password
                            </h3>
                            <button
                                onClick={() => setResetTarget(null)}
                                className="text-soft transition hover:text-ink"
                            >
                                <XCircle className="h-5 w-5" />
                            </button>
                        </div>

                        <p className="mb-4 text-xs text-soft">
                            Resetting password for mailbox{' '}
                            <strong className="text-ink">
                                {resetTarget.email}
                            </strong>
                            .
                        </p>

                        <Form
                            action={`/servers/${server.name}/mail/accounts/password`}
                            method="post"
                            onSubmit={() => setResetTarget(null)}
                            className="space-y-4"
                        >
                            <input
                                type="hidden"
                                name="email"
                                value={resetTarget.email}
                            />

                            <div>
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-medium text-soft">
                                        New Password
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            void navigator.clipboard.writeText(
                                                newResetPassword,
                                            );
                                            setCopiedReset(true);
                                            setTimeout(
                                                () => setCopiedReset(false),
                                                2000,
                                            );
                                        }}
                                        className="inline-flex items-center gap-1 text-[11px] text-brand transition hover:underline"
                                    >
                                        {copiedReset ? (
                                            <>
                                                <Check className="h-3 w-3" />
                                                Copied
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="h-3 w-3" />
                                                Copy
                                            </>
                                        )}
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    name="password"
                                    required
                                    value={newResetPassword}
                                    onChange={(e) =>
                                        setNewResetPassword(e.target.value)
                                    }
                                    className="mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-xs text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                                />
                            </div>

                            {hasSso && (
                                <div className="rounded-lg border border-line bg-paper/50 p-3">
                                    <input type="hidden" name="sso" value="0" />
                                    <label className="flex cursor-pointer items-start gap-2.5">
                                        <input
                                            type="checkbox"
                                            name="sso"
                                            value="1"
                                            checked={resetSso}
                                            onChange={(e) =>
                                                setResetSso(e.target.checked)
                                            }
                                            className="mt-0.5 rounded border-line text-brand focus:ring-brand"
                                        />
                                        <div>
                                            <span className="block text-xs font-medium text-ink">
                                                Update matching SSO password
                                            </span>
                                            <span className="block text-[11px] text-soft">
                                                Updates this user's password in
                                                Zitadel if the identity exists.
                                            </span>
                                        </div>
                                    </label>
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-4">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setResetTarget(null)}
                                >
                                    <XCircle className="h-4 w-4" />
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    variant="primary"
                                    size="sm"
                                >
                                    <KeyRound className="h-4 w-4" />
                                    Update Password
                                </Button>
                            </div>
                        </Form>
                    </div>
                </div>
            )}

            {/* Delete Mailbox Modal */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
                    <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-base font-semibold text-accent">
                                Delete Mailbox
                            </h3>
                            <button
                                onClick={() => setDeleteTarget(null)}
                                className="text-soft transition hover:text-ink"
                            >
                                <XCircle className="h-5 w-5" />
                            </button>
                        </div>

                        <p className="text-xs text-soft">
                            Are you sure you want to delete mailbox{' '}
                            <strong className="text-ink">
                                {deleteTarget.email}
                            </strong>
                            ? All stored emails, folders, and messages will be
                            permanently removed.
                        </p>

                        <Form
                            action={`/servers/${server.name}/mail/accounts`}
                            method="delete"
                            onSubmit={() => setDeleteTarget(null)}
                            className="mt-6 flex items-center justify-end gap-2"
                        >
                            <input
                                type="hidden"
                                name="email"
                                value={deleteTarget.email}
                            />

                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setDeleteTarget(null)}
                            >
                                <XCircle className="h-4 w-4" />
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="dangerFill"
                                size="sm"
                            >
                                <Trash2 className="h-4 w-4" />
                                Delete Mailbox
                            </Button>
                        </Form>
                    </div>
                </div>
            )}
        </div>
    );
}
