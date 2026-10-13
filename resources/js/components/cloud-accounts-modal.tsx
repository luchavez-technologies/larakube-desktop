import { useState } from 'react';
import { router, useForm } from '@inertiajs/react';
import {
    Check,
    CheckCircle2,
    ExternalLink,
    Key,
    Plus,
    Trash2,
    Upload,
    Users,
    X,
    AlertCircle,
} from 'lucide-react';
import Button, { buttonClass } from '@/components/button';
import ProviderLogo from '@/components/provider-logo';
import Redactable from '@/components/redactable';
import AwsPolicyHelper from '@/components/aws-policy-helper';
import GcpPolicyHelper from '@/components/gcp-policy-helper';
import GcpSignIn from '@/components/gcp-sign-in';
import SelectMenu from '@/components/select-menu';
import StatusPill from '@/components/status-pill';
import { cn } from '@/lib/utils';
import type { Provider, ProviderAccount } from '@/types/larakube';

type Props = {
    provider: Provider;
    onClose: () => void;
};

export default function CloudAccountsModal({ provider, onClose }: Props) {
    const [activeTab, setActiveTab] = useState<'accounts' | 'add'>('accounts');
    const [gcpAuthMethod, setGcpAuthMethod] = useState<
        'service_account' | 'oauth'
    >('service_account');
    const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
        null,
    );
    const [isDeleting, setIsDeleting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

    // Form for GCP Service Account
    const gcpForm = useForm({
        credentials: '',
    });

    const parsedGcp = (() => {
        if (!gcpForm.data.credentials) return null;
        try {
            const parsed = JSON.parse(gcpForm.data.credentials.trim());
            if (
                parsed &&
                typeof parsed === 'object' &&
                parsed.type === 'service_account'
            ) {
                return {
                    projectId: parsed.project_id as string | undefined,
                    clientEmail: parsed.client_email as string | undefined,
                };
            }
        } catch {
            // not valid JSON yet
        }
        return null;
    })();

    const accounts = provider.accounts ?? [];

    function handleSetDefault(accountId: string) {
        setErrorMessage(null);
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
                onError: (errors) => {
                    setErrorMessage(
                        errors.account || 'Could not update default account.',
                    );
                },
            },
        );
    }

    function executeRemove(accountId: string) {
        setIsDeleting(true);
        setErrorMessage(null);

        router.delete('/setup/cloud/accounts', {
            data: {
                provider: provider.slug,
                account_id: accountId,
            },
            preserveScroll: true,
            onSuccess: () => {
                setConfirmingDeleteId(null);
                router.reload({ only: ['providers'] });
            },
            onError: (errors) => {
                setErrorMessage(errors.account || 'Could not remove account.');
            },
            onFinish: () => {
                setIsDeleting(false);
            },
        });
    }

    function submitToken(e: React.FormEvent) {
        e.preventDefault();
        setErrorMessage(null);
        tokenForm.post('/setup/cloud/accounts', {
            preserveScroll: true,
            onSuccess: () => {
                tokenForm.reset();
                setActiveTab('accounts');
                router.reload({ only: ['providers'] });
            },
            onError: (errors) => {
                setErrorMessage(errors.account || 'Could not add account.');
            },
        });
    }

    function submitAws(e: React.FormEvent) {
        e.preventDefault();
        setErrorMessage(null);
        awsForm.post('/setup/cloud/aws', {
            preserveScroll: true,
            onSuccess: () => {
                awsForm.reset();
                setActiveTab('accounts');
                router.reload({ only: ['providers'] });
            },
            onError: (errors) => {
                setErrorMessage(errors.aws || 'Could not save AWS profile.');
            },
        });
    }

    function submitGcp(e: React.FormEvent) {
        e.preventDefault();
        setErrorMessage(null);
        gcpForm.post('/setup/cloud/gcp/service-account', {
            preserveScroll: true,
            onSuccess: () => {
                gcpForm.reset();
                setActiveTab('accounts');
                router.reload({ only: ['providers'] });
            },
            onError: (errors) => {
                setErrorMessage(
                    errors.gcp ||
                        errors.credentials ||
                        'Could not save GCP Service Account.',
                );
            },
        });
    }

    async function handleGcpFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            gcpForm.setData('credentials', text.trim());
        } catch {
            setErrorMessage('Could not read the selected file.');
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl bg-surface shadow-2xl ring-1 ring-line">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-line px-6 py-4">
                    <div className="flex items-center gap-3">
                        <ProviderLogo provider={provider.slug} size="sm" />
                        <div>
                            <h3 className="text-foreground text-base font-semibold">
                                {provider.label} Accounts & Profiles
                            </h3>
                            <p className="text-xs text-soft">
                                Switch active client accounts or configure
                                multiple credentials.
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

                {/* Navigation Tabs */}
                <div className="flex border-b border-line px-6">
                    <button
                        type="button"
                        onClick={() => {
                            setActiveTab('accounts');
                            setConfirmingDeleteId(null);
                            setErrorMessage(null);
                        }}
                        className={cn(
                            'flex items-center gap-2 border-b-2 py-3 text-xs font-medium transition',
                            activeTab === 'accounts'
                                ? 'border-foreground text-foreground'
                                : 'hover:text-foreground border-transparent text-soft',
                        )}
                    >
                        <Users className="size-3.5" />
                        <span>Registered Accounts ({accounts.length})</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setActiveTab('add');
                            setConfirmingDeleteId(null);
                            setErrorMessage(null);
                        }}
                        className={cn(
                            'ml-6 flex items-center gap-2 border-b-2 py-3 text-xs font-medium transition',
                            activeTab === 'add'
                                ? 'border-foreground text-foreground'
                                : 'hover:text-foreground border-transparent text-soft',
                        )}
                    >
                        <Plus className="size-3.5" />
                        <span>
                            Add{' '}
                            {provider.slug === 'aws' ? 'Profile' : 'Account'}
                        </span>
                    </button>
                </div>

                {/* Content Area with Slim Scrollbar */}
                <div className="flex-1 [scrollbar-width:thin] [scrollbar-color:var(--color-line)_transparent] overflow-y-auto p-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line hover:[&::-webkit-scrollbar-thumb]:bg-soft [&::-webkit-scrollbar-track]:bg-transparent">
                    {/* Error Notice */}
                    {errorMessage && (
                        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-accent-line bg-accent-tint p-3 text-xs text-accent">
                            <AlertCircle className="size-4 shrink-0" />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {/* Tab: Accounts List */}
                    {activeTab === 'accounts' && (
                        <div className="space-y-4">
                            {accounts.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-line p-8 text-center">
                                    <Users className="mx-auto size-8 text-soft opacity-40" />
                                    <p className="text-foreground mt-2 text-sm font-medium">
                                        No accounts configured yet
                                    </p>
                                    <p className="mt-1 text-xs text-soft">
                                        Connect your first {provider.label}{' '}
                                        account to get started.
                                    </p>
                                    <div className="mt-4">
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => setActiveTab('add')}
                                        >
                                            <Plus className="size-3.5" />
                                            <span>Add Account</span>
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-background/50 divide-y divide-line rounded-xl border border-line">
                                    {accounts.map((acc: ProviderAccount) => {
                                        const isConfirming =
                                            confirmingDeleteId === acc.id;

                                        return (
                                            <div
                                                key={acc.id}
                                                className="flex items-center justify-between p-3.5"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <Users className="size-4 text-soft" />
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-foreground text-sm font-medium">
                                                                {acc.label}
                                                            </span>
                                                            {acc.isDefault && (
                                                                <StatusPill tone="ok">
                                                                    Active
                                                                    Default
                                                                </StatusPill>
                                                            )}
                                                        </div>
                                                        {acc.meta && (
                                                            <p className="font-mono text-[11px] text-soft">
                                                                <Redactable
                                                                    value={
                                                                        acc.meta
                                                                    }
                                                                    kind="account"
                                                                />
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Action Buttons or Inline Confirmation */}
                                                <div>
                                                    {isConfirming ? (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-medium text-accent">
                                                                Remove profile?
                                                            </span>
                                                            <Button
                                                                size="sm"
                                                                variant="dangerFill"
                                                                onClick={() =>
                                                                    executeRemove(
                                                                        acc.id,
                                                                    )
                                                                }
                                                                disabled={
                                                                    isDeleting
                                                                }
                                                            >
                                                                <Trash2 className="size-3" />
                                                                <span>
                                                                    {isDeleting
                                                                        ? 'Removing…'
                                                                        : 'Yes, remove'}
                                                                </span>
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="secondary"
                                                                onClick={() =>
                                                                    setConfirmingDeleteId(
                                                                        null,
                                                                    )
                                                                }
                                                                disabled={
                                                                    isDeleting
                                                                }
                                                            >
                                                                <X className="size-3" />
                                                                <span>
                                                                    Cancel
                                                                </span>
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            {!acc.isDefault && (
                                                                <Button
                                                                    size="sm"
                                                                    variant="secondary"
                                                                    onClick={() =>
                                                                        handleSetDefault(
                                                                            acc.id,
                                                                        )
                                                                    }
                                                                >
                                                                    <Check className="size-3" />
                                                                    <span>
                                                                        Set
                                                                        Default
                                                                    </span>
                                                                </Button>
                                                            )}
                                                            {accounts.length >
                                                                1 && (
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => {
                                                                        setConfirmingDeleteId(
                                                                            acc.id,
                                                                        );
                                                                        setErrorMessage(
                                                                            null,
                                                                        );
                                                                    }}
                                                                    className="text-soft hover:text-accent"
                                                                >
                                                                    <Trash2 className="size-3.5" />
                                                                    <span className="sr-only">
                                                                        Remove
                                                                    </span>
                                                                </Button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tab: Add Account (DO & Hetzner) */}
                    {activeTab === 'add' &&
                        (provider.slug === 'do' ||
                            provider.slug === 'hetzner') && (
                            <form onSubmit={submitToken} className="space-y-4">
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
                                        onClick={() => setActiveTab('accounts')}
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

                    {/* Tab: Add Profile (AWS) */}
                    {activeTab === 'add' && provider.slug === 'aws' && (
                        <form onSubmit={submitAws} className="space-y-4">
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
                                    Saved in{' '}
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
                                <SelectMenu
                                    value={awsForm.data.region}
                                    accent="servers"
                                    onChange={(value) =>
                                        awsForm.setData('region', value)
                                    }
                                    options={provider.regions.map((r) => ({
                                        value: r.value,
                                        label: r.label,
                                    }))}
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setActiveTab('accounts')}
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

                    {/* Tab: Add Account (GCP) */}
                    {activeTab === 'add' && provider.slug === 'gcp' && (
                        <div className="space-y-4">
                            {/* Method Switcher */}
                            <div className="flex rounded-lg bg-surface/80 p-1 ring-1 ring-line">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setGcpAuthMethod('service_account')
                                    }
                                    className={cn(
                                        'flex flex-1 items-center justify-center gap-2 rounded-md py-1.5 text-xs font-medium transition',
                                        gcpAuthMethod === 'service_account'
                                            ? 'bg-ink text-surface shadow-xs'
                                            : 'hover:text-foreground text-soft',
                                    )}
                                >
                                    <Key className="size-3.5" />
                                    <span>Service Account Key (JSON)</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setGcpAuthMethod('oauth')}
                                    className={cn(
                                        'flex flex-1 items-center justify-center gap-2 rounded-md py-1.5 text-xs font-medium transition',
                                        gcpAuthMethod === 'oauth'
                                            ? 'bg-ink text-surface shadow-xs'
                                            : 'hover:text-foreground text-soft',
                                    )}
                                >
                                    <ExternalLink className="size-3.5" />
                                    <span>Google Account (OAuth)</span>
                                </button>
                            </div>

                            {/* Service Account JSON Mode */}
                            {gcpAuthMethod === 'service_account' && (
                                <form
                                    onSubmit={submitGcp}
                                    className="space-y-4"
                                >
                                    <GcpPolicyHelper
                                        interactive={true}
                                        projectId={parsedGcp?.projectId}
                                        clientEmail={parsedGcp?.clientEmail}
                                    />

                                    <div>
                                        <div className="flex items-center justify-between">
                                            <label className="text-foreground block text-xs font-medium">
                                                Service Account Key JSON
                                            </label>
                                            <label
                                                className={cn(
                                                    buttonClass(
                                                        'secondary',
                                                        'sm',
                                                    ),
                                                    'cursor-pointer text-xs',
                                                )}
                                            >
                                                <Upload className="size-3.5" />
                                                <span>Browse JSON File…</span>
                                                <input
                                                    type="file"
                                                    accept=".json,application/json"
                                                    onChange={
                                                        handleGcpFileSelect
                                                    }
                                                    className="sr-only"
                                                />
                                            </label>
                                        </div>
                                        <p className="mt-1 text-[11px] text-soft">
                                            The standard credentials file
                                            downloaded from Google Cloud IAM or
                                            Firebase Console.
                                        </p>
                                    </div>

                                    <div>
                                        <textarea
                                            rows={5}
                                            value={gcpForm.data.credentials}
                                            onChange={(e) =>
                                                gcpForm.setData(
                                                    'credentials',
                                                    e.target.value,
                                                )
                                            }
                                            placeholder='{"type": "service_account", "project_id": "my-gcp-project", "client_email": "sa@...", ...}'
                                            required
                                            className="bg-background w-full rounded-lg p-3 font-mono text-xs ring-1 ring-line focus:ring-2 focus:ring-servers"
                                        />
                                        {gcpForm.errors.credentials && (
                                            <p className="mt-1 text-xs text-accent">
                                                {gcpForm.errors.credentials}
                                            </p>
                                        )}
                                    </div>

                                    {parsedGcp && (
                                        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-2.5 text-xs text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                                            <CheckCircle2 className="size-4 shrink-0" />
                                            <div>
                                                <span className="font-semibold">
                                                    Detected Service Account:
                                                </span>{' '}
                                                <span className="font-mono">
                                                    {parsedGcp.clientEmail}
                                                </span>
                                                {parsedGcp.projectId && (
                                                    <span className="text-soft">
                                                        {' '}
                                                        (Project:{' '}
                                                        <code className="text-foreground font-mono">
                                                            {
                                                                parsedGcp.projectId
                                                            }
                                                        </code>
                                                        )
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex justify-end gap-2 pt-2">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            onClick={() =>
                                                setActiveTab('accounts')
                                            }
                                        >
                                            <X className="size-3.5" />
                                            <span>Cancel</span>
                                        </Button>
                                        <Button
                                            type="submit"
                                            size="sm"
                                            disabled={
                                                gcpForm.processing ||
                                                !gcpForm.data.credentials
                                            }
                                        >
                                            <Plus className="size-3.5" />
                                            <span>Save Service Account</span>
                                        </Button>
                                    </div>
                                </form>
                            )}

                            {/* Google OAuth Mode */}
                            {gcpAuthMethod === 'oauth' && (
                                <div className="space-y-4">
                                    <div className="rounded-xl border border-line bg-surface/50 p-4">
                                        <p className="text-xs leading-relaxed text-soft">
                                            Authenticate directly with your
                                            human Google account via browser
                                            OAuth. Once approved, the Google
                                            Cloud CLI registers your account
                                            credentials locally.
                                        </p>
                                        <div className="mt-4">
                                            <GcpSignIn label="Sign in with Google Account" />
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-2 pt-2">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            onClick={() =>
                                                setActiveTab('accounts')
                                            }
                                        >
                                            <X className="size-3.5" />
                                            <span>Cancel</span>
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end border-t border-line px-6 py-3.5">
                    <Button variant="secondary" onClick={onClose}>
                        <X className="size-4" />
                        <span>Close</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}
