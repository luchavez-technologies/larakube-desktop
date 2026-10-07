import { useState } from 'react';
import { router, useForm } from '@inertiajs/react';
import { Check, Plus, Trash2, X, Users } from 'lucide-react';
import Button from '@/components/button';
import ProviderLogo from '@/components/provider-logo';
import AwsPolicyHelper from '@/components/aws-policy-helper';
import GcpSignIn from '@/components/gcp-sign-in';
import StatusPill from '@/components/status-pill';
import type { Provider, ProviderAccount } from '@/types/larakube';

type Props = {
    provider: Provider;
    onClose: () => void;
};

export default function CloudAccountsModal({ provider, onClose }: Props) {
    const [showAddForm, setShowAddForm] = useState(false);

    // Form for DO and Hetzner
    const tokenForm = useForm({
        provider: provider.slug,
        name: '',
        token: '',
    });

    // Form for AWS
    const awsForm = useForm({
        profile: '',
        access_key_id: '',
        secret_access_key: '',
        region: provider.defaultRegion || 'us-east-1',
    });

    const accounts = provider.accounts ?? [];

    function handleSetDefault(accountId: string) {
        router.post(
            '/setup/cloud/accounts/default',
            {
                provider: provider.slug,
                account_id: accountId,
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    router.reload({ only: ['providers'] });
                },
            },
        );
    }

    function handleRemove(accountId: string) {
        if (
            !confirm(
                `Are you sure you want to remove this account (${accountId})?`,
            )
        ) {
            return;
        }

        router.delete('/setup/cloud/accounts', {
            data: {
                provider: provider.slug,
                account_id: accountId,
            },
            preserveScroll: true,
            onSuccess: () => {
                router.reload({ only: ['providers'] });
            },
        });
    }

    function submitToken(e: React.FormEvent) {
        e.preventDefault();
        tokenForm.post('/setup/cloud/accounts', {
            preserveScroll: true,
            onSuccess: () => {
                tokenForm.reset();
                setShowAddForm(false);
                router.reload({ only: ['providers'] });
            },
        });
    }

    function submitAws(e: React.FormEvent) {
        e.preventDefault();
        awsForm.post('/setup/cloud/aws', {
            preserveScroll: true,
            onSuccess: () => {
                awsForm.reset();
                setShowAddForm(false);
                router.reload({ only: ['providers'] });
            },
        });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-surface p-6 shadow-xl ring-1 ring-line">
                <div className="flex items-center justify-between border-b border-line pb-3.5">
                    <div className="flex items-center gap-2.5">
                        <ProviderLogo provider={provider.slug} size="sm" />
                        <div>
                            <h3 className="text-foreground text-base font-semibold">
                                {provider.label} Accounts & Profiles
                            </h3>
                            <p className="text-xs text-soft">
                                Manage multiple client, team, or staging
                                credentials.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="hover:text-foreground rounded-lg p-1.5 text-soft transition hover:bg-badge"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                <div className="mt-4 space-y-4">
                    {/* Existing Accounts List */}
                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-medium tracking-wider text-soft uppercase">
                                Registered Accounts ({accounts.length})
                            </span>
                            {!showAddForm && provider.slug !== 'gcp' && (
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => setShowAddForm(true)}
                                >
                                    <Plus className="size-3.5" />
                                    <span>Add Account</span>
                                </Button>
                            )}
                        </div>

                        {accounts.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-soft">
                                No accounts configured yet for {provider.label}.
                            </div>
                        ) : (
                            <div className="bg-background/50 divide-y divide-line rounded-xl border border-line">
                                {accounts.map((acc: ProviderAccount) => (
                                    <div
                                        key={acc.id}
                                        className="flex items-center justify-between p-3"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <Users className="size-4 text-soft" />
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-foreground text-sm font-medium">
                                                        {acc.label}
                                                    </span>
                                                    {acc.isDefault && (
                                                        <StatusPill tone="ok">
                                                            Active Default
                                                        </StatusPill>
                                                    )}
                                                </div>
                                                {acc.meta && (
                                                    <p className="text-[11px] text-soft">
                                                        {acc.meta}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {!acc.isDefault && (
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() =>
                                                        handleSetDefault(acc.id)
                                                    }
                                                >
                                                    <Check className="size-3" />
                                                    <span>Set Default</span>
                                                </Button>
                                            )}
                                            {accounts.length > 1 && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() =>
                                                        handleRemove(acc.id)
                                                    }
                                                    className="text-soft hover:text-accent"
                                                >
                                                    <Trash2 className="size-3.5" />
                                                    <span className="sr-only">
                                                        Remove
                                                    </span>
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* GCP Special Flow */}
                    {provider.slug === 'gcp' && (
                        <div className="rounded-xl border border-line p-4">
                            <p className="mb-3 text-xs text-soft">
                                Google Cloud CLI manages multiple identities
                                natively. Authenticate with an additional Google
                                Account below:
                            </p>
                            <GcpSignIn label="Sign in with another Google Account" />
                        </div>
                    )}

                    {/* Add Form (DO & Hetzner) */}
                    {showAddForm &&
                        (provider.slug === 'do' ||
                            provider.slug === 'hetzner') && (
                            <form
                                onSubmit={submitToken}
                                className="space-y-3.5 rounded-xl border border-line bg-surface p-4"
                            >
                                <div className="flex items-center justify-between">
                                    <h4 className="text-foreground text-xs font-semibold tracking-wider uppercase">
                                        Add New {provider.label} Account
                                    </h4>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setShowAddForm(false)}
                                    >
                                        <X className="size-3.5" />
                                        <span>Cancel</span>
                                    </Button>
                                </div>

                                <div>
                                    <label className="text-foreground mb-1 block text-xs font-medium">
                                        Account Label / Client Name
                                    </label>
                                    <input
                                        type="text"
                                        value={tokenForm.data.name}
                                        onChange={(e) =>
                                            tokenForm.setData(
                                                'name',
                                                e.target.value,
                                            )
                                        }
                                        placeholder="e.g. Acme Client, Staging Fleet"
                                        required
                                        className="bg-background w-full rounded-lg px-3 py-2 text-sm ring-1 ring-line focus:ring-2 focus:ring-servers"
                                    />
                                    {tokenForm.errors.name && (
                                        <p className="mt-1 text-xs text-accent">
                                            {tokenForm.errors.name}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="text-foreground mb-1 block text-xs font-medium">
                                        API Token
                                    </label>
                                    <input
                                        type="password"
                                        value={tokenForm.data.token}
                                        onChange={(e) =>
                                            tokenForm.setData(
                                                'token',
                                                e.target.value,
                                            )
                                        }
                                        placeholder={
                                            provider.slug === 'do'
                                                ? 'dop_v1_...'
                                                : 'Hetzner Cloud API Token'
                                        }
                                        required
                                        className="bg-background w-full rounded-lg px-3 py-2 text-sm ring-1 ring-line focus:ring-2 focus:ring-servers"
                                    />
                                    {tokenForm.errors.token && (
                                        <p className="mt-1 text-xs text-accent">
                                            {tokenForm.errors.token}
                                        </p>
                                    )}
                                </div>

                                <div className="flex justify-end gap-2 pt-2">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => setShowAddForm(false)}
                                    >
                                        <X className="size-3.5" />
                                        <span>Cancel</span>
                                    </Button>
                                    <Button
                                        type="submit"
                                        size="sm"
                                        disabled={tokenForm.processing}
                                    >
                                        <Plus className="size-3.5" />
                                        <span>Save Account</span>
                                    </Button>
                                </div>
                            </form>
                        )}

                    {/* Add Form (AWS) */}
                    {showAddForm && provider.slug === 'aws' && (
                        <form
                            onSubmit={submitAws}
                            className="space-y-3.5 rounded-xl border border-line bg-surface p-4"
                        >
                            <div className="flex items-center justify-between">
                                <h4 className="text-foreground text-xs font-semibold tracking-wider uppercase">
                                    Add Named AWS Profile
                                </h4>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setShowAddForm(false)}
                                >
                                    <X className="size-3.5" />
                                    <span>Cancel</span>
                                </Button>
                            </div>

                            <AwsPolicyHelper />

                            <div>
                                <label className="text-foreground mb-1 block text-xs font-medium">
                                    Profile Name
                                </label>
                                <input
                                    type="text"
                                    value={awsForm.data.profile}
                                    onChange={(e) =>
                                        awsForm.setData(
                                            'profile',
                                            e.target.value,
                                        )
                                    }
                                    placeholder="e.g. client-acme, production, work"
                                    required
                                    className="bg-background w-full rounded-lg px-3 py-2 text-sm ring-1 ring-line focus:ring-2 focus:ring-servers"
                                />
                                <p className="mt-0.5 text-[11px] text-soft">
                                    Stored in{' '}
                                    <code className="text-foreground">
                                        ~/.aws/credentials
                                    </code>{' '}
                                    as{' '}
                                    <code className="text-foreground">
                                        [
                                        {awsForm.data.profile || 'profile-name'}
                                        ]
                                    </code>
                                </p>
                            </div>

                            <div>
                                <label className="text-foreground mb-1 block text-xs font-medium">
                                    AWS Access Key ID
                                </label>
                                <input
                                    type="text"
                                    value={awsForm.data.access_key_id}
                                    onChange={(e) =>
                                        awsForm.setData(
                                            'access_key_id',
                                            e.target.value.trim(),
                                        )
                                    }
                                    placeholder="AKIAIOSFODNN7EXAMPLE"
                                    required
                                    className="bg-background w-full rounded-lg px-3 py-2 font-mono text-sm ring-1 ring-line focus:ring-2 focus:ring-servers"
                                />
                            </div>

                            <div>
                                <label className="text-foreground mb-1 block text-xs font-medium">
                                    AWS Secret Access Key
                                </label>
                                <input
                                    type="password"
                                    value={awsForm.data.secret_access_key}
                                    onChange={(e) =>
                                        awsForm.setData(
                                            'secret_access_key',
                                            e.target.value.trim(),
                                        )
                                    }
                                    placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                                    required
                                    className="bg-background w-full rounded-lg px-3 py-2 font-mono text-sm ring-1 ring-line focus:ring-2 focus:ring-servers"
                                />
                            </div>

                            <div>
                                <label className="text-foreground mb-1 block text-xs font-medium">
                                    Default Region
                                </label>
                                <select
                                    value={awsForm.data.region}
                                    onChange={(e) =>
                                        awsForm.setData(
                                            'region',
                                            e.target.value,
                                        )
                                    }
                                    className="bg-background w-full rounded-lg px-3 py-2 text-sm ring-1 ring-line focus:ring-2 focus:ring-servers"
                                >
                                    {provider.regions.map((r) => (
                                        <option key={r.value} value={r.value}>
                                            {r.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setShowAddForm(false)}
                                >
                                    <X className="size-3.5" />
                                    <span>Cancel</span>
                                </Button>
                                <Button
                                    type="submit"
                                    size="sm"
                                    disabled={awsForm.processing}
                                >
                                    <Plus className="size-3.5" />
                                    <span>Save Profile</span>
                                </Button>
                            </div>
                        </form>
                    )}
                </div>

                <div className="mt-5 flex justify-end border-t border-line pt-3">
                    <Button variant="secondary" onClick={onClose}>
                        <X className="size-4" />
                        <span>Close</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}
