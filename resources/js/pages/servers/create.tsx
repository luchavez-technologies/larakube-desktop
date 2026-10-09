import { Deferred, Link, useForm } from '@inertiajs/react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { ChevronDown, Key, Users, Plus } from 'lucide-react';
import AwsPolicyHelper from '@/components/aws-policy-helper';
import { buttonClass } from '@/components/button';
import Button from '@/components/button';
import CloudAccountsModal from '@/components/cloud-accounts-modal';
import GcpSignIn from '@/components/gcp-sign-in';
import PageHeader from '@/components/page-header';
import ProviderLogo from '@/components/provider-logo';
import SelectMenu from '@/components/select-menu';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import { open, readiness } from '@/routes';
import {
    index as devBoxesIndex,
    store as storeDevBox,
} from '@/routes/devboxes';
import { index, store } from '@/routes/servers';
import type { Provider } from '@/types/larakube';

const tokenProviders = ['do', 'hetzner'];

export default function CreateServer({
    providers,
    project,
    kind = 'server',
    defaultProvider,
}: {
    providers?: Provider[] | null;
    project: { id: number; name: string } | null;
    kind?: 'server' | 'dev-box';
    defaultProvider?: string;
}) {
    const devBox = kind === 'dev-box';

    return (
        <AppLayout title={devBox ? 'Create a dev box' : 'Create a server'}>
            <PageHeader
                title={devBox ? 'Create a dev box' : 'Create a server'}
                subtitle={
                    devBox
                        ? 'A server to work on, with Podman, a local cluster and the LaraKube CLI set up. Takes about 10 minutes and is billed by your provider.'
                        : 'A single-node Kubernetes server (k3s), hardened and ready for Cluster Tools. Takes about 5 minutes and is billed by your provider.'
                }
            />
            {project && (
                <p className="mb-5 max-w-3xl rounded-lg bg-busy-tint px-3 py-2 text-sm text-busy">
                    For project {project.name}: its production environment will
                    be linked to this new server.
                </p>
            )}
            <Deferred
                data="providers"
                fallback={
                    <div className="h-72 max-w-3xl animate-pulse rounded-2xl bg-surface ring-1 ring-line" />
                }
            >
                {providers ? (
                    <ServerForm
                        providers={providers}
                        projectId={project?.id ?? null}
                        devBox={devBox}
                        defaultProvider={defaultProvider}
                    />
                ) : (
                    <p className="text-sm text-soft">
                        The LaraKube CLI isn't ready yet. Finish Setup first.
                    </p>
                )}
            </Deferred>
        </AppLayout>
    );
}

function ServerForm({
    providers,
    projectId,
    devBox,
    defaultProvider,
}: {
    providers: Provider[];
    projectId: number | null;
    devBox: boolean;
    defaultProvider?: string;
}) {
    const startSize = (candidate: Provider, targetKind: 'vps' | 'managed') =>
        targetKind === 'managed'
            ? (candidate.defaultManagedSize ?? candidate.defaultVpsSize)
            : devBox
              ? (candidate.defaultDevBoxSize ?? candidate.defaultVpsSize)
              : candidate.defaultVpsSize;
    const initial =
        providers.find(
            (provider) =>
                provider.slug === defaultProvider && provider.credentials.ready,
        ) ??
        providers.find((provider) => provider.credentials.ready) ??
        providers[0];
    const form = useForm({
        provider: initial.slug,
        stack_name: '',
        region: initial.defaultRegion,
        size: startSize(initial, 'vps'),
        target_kind: 'vps' as 'vps' | 'managed',
        node_count: '2',
        ha: false,
        k8s_version_prefix: '',
        api_token: '',
        cloudflare_token: '',
        aws_access_key_id: '',
        aws_secret_access_key: '',
        project_id: projectId,
        account: initial.activeAccount ?? initial.accounts?.[0]?.id ?? '',
    });

    const [overrideAwsKeys, setOverrideAwsKeys] = useState(false);
    const [showAccountModal, setShowAccountModal] = useState(false);

    const provider =
        providers.find((candidate) => candidate.slug === form.data.provider) ??
        initial;

    const needsToken =
        tokenProviders.includes(provider.slug) && !provider.credentials.ready;
    const needsAwsKeys =
        provider.slug === 'aws' &&
        (!provider.credentials.ready || overrideAwsKeys);
    const needsGcpLogin =
        provider.slug === 'gcp' && !provider.credentials.ready;
    const cliMissing = /not installed/i.test(provider.credentials.hint ?? '');

    const canBeManaged = !devBox && (provider.managedSizes?.length ?? 0) > 0;
    const isManaged = form.data.target_kind === 'managed' && canBeManaged;
    const sizeOptions = isManaged ? provider.managedSizes! : provider.vpsSizes;
    const size = sizeOptions.find((option) => option.value === form.data.size);
    const price = size?.label.match(/\(([^)]*\/mo[^)]*)\)/)?.[1];
    const nodeCount = Math.max(1, parseInt(form.data.node_count, 10) || 1);
    const monthlyEstimate = isManaged
        ? estimateManagedCost(price, nodeCount, form.data.ha, provider.haCost)
        : undefined;

    function selectProvider(next: Provider) {
        setOverrideAwsKeys(false);
        const nextCanBeManaged =
            !devBox && (next.managedSizes?.length ?? 0) > 0;
        const nextTargetKind = nextCanBeManaged ? form.data.target_kind : 'vps';
        form.setData({
            ...form.data,
            provider: next.slug,
            region: next.defaultRegion,
            target_kind: nextTargetKind,
            size: startSize(next, nextTargetKind),
            ha: false,
            api_token: '',
            aws_access_key_id: '',
            aws_secret_access_key: '',
            account: next.activeAccount ?? next.accounts?.[0]?.id ?? '',
        });
    }

    function selectTargetKind(next: 'vps' | 'managed') {
        form.setData({
            ...form.data,
            target_kind: next,
            size: startSize(provider, next),
            ha: false,
        });
    }

    function submit(event: FormEvent) {
        event.preventDefault();
        form.post((devBox ? storeDevBox() : store()).url);
    }

    return (
        <>
            <form onSubmit={submit} className="max-w-3xl">
                <p className="mb-2.5 text-[13px] font-medium">Cloud provider</p>
                <div className="grid grid-cols-2 gap-3">
                    {providers.map((candidate) => (
                        <button
                            key={candidate.slug}
                            type="button"
                            onClick={() => selectProvider(candidate)}
                            className={cn(
                                'flex items-center justify-between rounded-xl bg-surface px-4 py-3.5 text-left transition',
                                candidate.slug === provider.slug
                                    ? 'ring-2 ring-servers'
                                    : 'ring-1 ring-line hover:ring-faint',
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <ProviderLogo
                                    provider={candidate.slug}
                                    size="sm"
                                />
                                <span className="text-sm font-medium">
                                    {candidate.label}
                                </span>
                            </div>
                            <StatusPill
                                tone={
                                    candidate.credentials.ready ? 'ok' : 'muted'
                                }
                            >
                                {candidate.credentials.ready
                                    ? 'Ready'
                                    : 'Not connected'}
                            </StatusPill>
                        </button>
                    ))}
                </div>

                {provider.accounts && provider.accounts.length > 0 && (
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3 ring-1 ring-line">
                        <div className="flex items-center gap-2.5">
                            <Users className="size-4 text-soft" />
                            <div>
                                <span className="text-foreground text-xs font-medium">
                                    Account / Profile:
                                </span>
                                <span className="ml-2 font-mono text-xs text-soft">
                                    {form.data.account ||
                                        provider.activeAccount ||
                                        'default'}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {provider.accounts.length > 1 && (
                                <SelectMenu
                                    value={form.data.account}
                                    accent="servers"
                                    triggerClassName="h-7 bg-background px-2.5 py-1 text-xs"
                                    onChange={(value) =>
                                        form.setData('account', value)
                                    }
                                    options={provider.accounts.map((acc) => ({
                                        value: acc.id,
                                        label: acc.isDefault
                                            ? `${acc.label} · (Default)`
                                            : acc.label,
                                    }))}
                                />
                            )}
                            <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => setShowAccountModal(true)}
                            >
                                <Plus className="size-3" />
                                <span>Manage Accounts</span>
                            </Button>
                        </div>
                    </div>
                )}

                {(needsGcpLogin || needsAwsKeys) && (
                    <div className="mt-3 flex items-center justify-between gap-4 rounded-lg bg-warn-tint px-4 py-3 text-sm text-warn">
                        {cliMissing ? (
                            <>
                                <span>
                                    {provider.credentials.hint} Install it from
                                    Setup first, then come back here.
                                </span>
                                <Link
                                    href={readiness().url}
                                    className={buttonClass(
                                        'secondary',
                                        'sm',
                                        'shrink-0',
                                    )}
                                >
                                    Open Setup
                                </Link>
                            </>
                        ) : needsGcpLogin ? (
                            <>
                                <span>
                                    {provider.credentials.hint} Authorize with
                                    Google to continue.
                                </span>
                                <GcpSignIn label="Sign in with Google" />
                            </>
                        ) : (
                            <span>
                                {provider.credentials.hint} Enter your AWS keys
                                below to continue.
                            </span>
                        )}
                    </div>
                )}

                <div className="mt-5 space-y-4 rounded-2xl bg-surface p-5.5 ring-1 ring-line ring-inset">
                    <Field
                        label={devBox ? 'Dev box name' : 'Server name'}
                        hint="Lowercase letters, numbers and dashes."
                        error={form.errors.stack_name}
                    >
                        <input
                            value={form.data.stack_name}
                            onChange={(event) =>
                                form.setData('stack_name', event.target.value)
                            }
                            placeholder="workshop-demo"
                            autoFocus
                            spellCheck={false}
                            className="w-full rounded-lg border-0 px-3 py-2 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-servers"
                        />
                    </Field>

                    {canBeManaged && (
                        <Field
                            label="Server type"
                            error={form.errors.target_kind}
                        >
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => selectTargetKind('vps')}
                                    className={cn(
                                        'rounded-lg px-3 py-2 text-left text-sm transition',
                                        !isManaged
                                            ? 'bg-servers/10 ring-2 ring-servers'
                                            : 'ring-1 ring-line hover:ring-faint',
                                    )}
                                >
                                    <span className="block font-medium">
                                        Single server (VPS)
                                    </span>
                                    <span className="block text-xs text-soft">
                                        k3s, single-node — cheapest, simplest
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => selectTargetKind('managed')}
                                    className={cn(
                                        'rounded-lg px-3 py-2 text-left text-sm transition',
                                        isManaged
                                            ? 'bg-servers/10 ring-2 ring-servers'
                                            : 'ring-1 ring-line hover:ring-faint',
                                    )}
                                >
                                    <span className="block font-medium">
                                        Managed Kubernetes
                                    </span>
                                    <span className="block text-xs text-soft">
                                        {provider.managedProvider?.toUpperCase()}{' '}
                                        — multi-node, scales with your traffic
                                    </span>
                                </button>
                            </div>
                        </Field>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Region" error={form.errors.region}>
                            <Select
                                value={form.data.region}
                                onChange={(value) =>
                                    form.setData('region', value)
                                }
                                options={provider.regions}
                            />
                        </Field>
                        <Field
                            label="Size"
                            error={form.errors.size}
                            hint={pricingNote(provider)}
                        >
                            <Select
                                value={form.data.size}
                                onChange={(value) =>
                                    form.setData('size', value)
                                }
                                options={sizeOptions}
                            />
                        </Field>
                    </div>

                    {isManaged && (
                        <div className="grid grid-cols-2 gap-4">
                            <Field
                                label="Node count"
                                error={form.errors.node_count}
                            >
                                <input
                                    type="number"
                                    min={1}
                                    max={20}
                                    value={form.data.node_count}
                                    onChange={(event) =>
                                        form.setData(
                                            'node_count',
                                            event.target.value,
                                        )
                                    }
                                    className="w-full rounded-lg border-0 px-3 py-2 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                />
                            </Field>
                            {provider.haOption === 'boolean' ? (
                                <Field label="Control plane">
                                    <label className="flex h-9 items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={form.data.ha}
                                            onChange={(event) =>
                                                form.setData(
                                                    'ha',
                                                    event.target.checked,
                                                )
                                            }
                                            className="size-4 rounded ring-1 ring-line"
                                        />
                                        <span>
                                            High availability
                                            {provider.haCost
                                                ? ` (${provider.haCost})`
                                                : ''}
                                        </span>
                                    </label>
                                </Field>
                            ) : (
                                provider.haOption === 'always' && (
                                    <Field label="Control plane">
                                        <p className="flex h-9 items-center text-sm text-soft">
                                            High availability included
                                        </p>
                                    </Field>
                                )
                            )}
                        </div>
                    )}

                    {needsToken && (
                        <Field
                            label={`${provider.label} API token`}
                            hint="Used for this run only. Never saved."
                            error={form.errors.api_token}
                        >
                            <input
                                type="password"
                                value={form.data.api_token}
                                onChange={(event) =>
                                    form.setData(
                                        'api_token',
                                        event.target.value,
                                    )
                                }
                                className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                            />
                        </Field>
                    )}

                    {provider.slug === 'aws' && provider.credentials.ready && (
                        <div className="flex items-center justify-between border-t border-line/60 pt-3 text-xs text-soft">
                            <span>
                                Using saved AWS credentials (~/.aws/credentials)
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    if (overrideAwsKeys) {
                                        form.setData('aws_access_key_id', '');
                                        form.setData(
                                            'aws_secret_access_key',
                                            '',
                                        );
                                    }
                                    setOverrideAwsKeys(!overrideAwsKeys);
                                }}
                                className="flex items-center gap-1 font-medium text-servers hover:underline"
                            >
                                <Key className="size-3" />
                                <span>
                                    {overrideAwsKeys
                                        ? 'Use saved credentials'
                                        : 'Use different AWS keys'}
                                </span>
                            </button>
                        </div>
                    )}

                    {needsAwsKeys && (
                        <div className="space-y-4 border-t border-line/60 pt-3">
                            <AwsPolicyHelper />
                            <Field
                                label="AWS Access Key ID"
                                error={form.errors.aws_access_key_id}
                            >
                                <input
                                    type="text"
                                    placeholder="AKIAIOSFODNN7EXAMPLE"
                                    value={form.data.aws_access_key_id}
                                    onChange={(event) =>
                                        form.setData(
                                            'aws_access_key_id',
                                            event.target.value,
                                        )
                                    }
                                    className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                />
                            </Field>
                            <Field
                                label="AWS Secret Access Key"
                                error={form.errors.aws_secret_access_key}
                            >
                                <input
                                    type="password"
                                    placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                                    value={form.data.aws_secret_access_key}
                                    onChange={(event) =>
                                        form.setData(
                                            'aws_secret_access_key',
                                            event.target.value,
                                        )
                                    }
                                    className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                />
                            </Field>
                        </div>
                    )}

                    {!devBox && !isManaged && (
                        <CloudflareOption
                            value={form.data.cloudflare_token}
                            error={form.errors.cloudflare_token}
                            onChange={(value) =>
                                form.setData('cloudflare_token', value)
                            }
                        />
                    )}
                </div>

                <div className="mt-5 flex items-center justify-between gap-4">
                    <p className="text-[13px] text-soft">
                        {isManaged && monthlyEstimate
                            ? `${monthlyEstimate.replace('~', '')}, billed by ${provider.label}. You can destroy it any time.`
                            : price
                              ? `${provider.pricing?.source === 'builtin' ? 'Roughly' : 'About'} ${price.replace(', Recommended', '').replace('~', '')}, billed by ${provider.label}. You can destroy it any time.`
                              : `Billed by ${provider.label}. You can destroy it any time.`}
                    </p>
                    <div className="flex items-center gap-2.5">
                        <Link
                            href={(devBox ? devBoxesIndex() : index()).url}
                            className={buttonClass('ghost')}
                        >
                            Cancel
                        </Link>
                        <Button
                            type="submit"
                            disabled={
                                form.processing ||
                                needsGcpLogin ||
                                form.data.stack_name.trim() === '' ||
                                (needsToken &&
                                    form.data.api_token.trim() === '') ||
                                (needsAwsKeys &&
                                    (form.data.aws_access_key_id.trim() ===
                                        '' ||
                                        form.data.aws_secret_access_key.trim() ===
                                            ''))
                            }
                        >
                            <Plus className="size-4" />
                            <span>
                                {form.processing
                                    ? 'Starting…'
                                    : devBox
                                      ? 'Create dev box'
                                      : 'Create server'}
                            </span>
                        </Button>
                    </div>
                </div>
            </form>
            {showAccountModal && (
                <CloudAccountsModal
                    provider={provider}
                    onClose={() => setShowAccountModal(false)}
                />
            )}
        </>
    );
}

/** A rough total monthly estimate: per-node price × node count, plus HA's own cost if enabled. */
function estimateManagedCost(
    priceLabel: string | undefined,
    nodeCount: number,
    ha: boolean,
    haCost?: string | null,
): string | undefined {
    const perNode = priceLabel?.match(/\$([\d.]+)/)?.[1];
    if (!perNode) return undefined;

    const total = parseFloat(perNode) * nodeCount;
    const base = `~$${Math.round(total)}/mo for ${nodeCount} node${nodeCount === 1 ? '' : 's'}`;

    return ha && haCost ? `${base}, plus ${haCost} for HA` : base;
}

/** The optional Cloudflare step: what it gives, how to get a token, and that it can wait. */
/** Says where the sizes and prices come from, so a stale one is never passed off as current. */
function pricingNote(provider: Provider): string | undefined {
    const pricing = provider.pricing;

    if (!pricing) return undefined;

    if (pricing.source === 'live') {
        return `Prices from ${provider.label}, fetched ${ago(pricing.asOf)}.`;
    }

    if (pricing.source === 'cached') {
        return `Couldn't reach ${provider.label} just now. These prices are from ${ago(pricing.asOf)} and may have changed.`;
    }

    return `Estimated prices, which may be out of date.${provider.credentials.ready ? '' : ` Connect ${provider.label} to see its current ones.`}`;
}

function ago(iso: string | null): string {
    const minutes = iso
        ? Math.round((Date.now() - new Date(iso).getTime()) / 60000)
        : 0;

    if (minutes < 2) return 'just now';
    if (minutes < 60) return `${minutes} minutes ago`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} hours ago`;

    return `${Math.round(minutes / 1440)} days ago`;
}

function CloudflareOption({
    value,
    error,
    onChange,
}: {
    value: string;
    error?: string;
    onChange: (value: string) => void;
}) {
    return (
        <details
            className="group rounded-xl bg-paper/60 ring-1 ring-line"
            open={value !== ''}
        >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                <span>
                    <span className="block text-[13px] font-medium text-ink">
                        Connect Cloudflare now (optional)
                    </span>
                    <span className="block text-xs text-soft">
                        Domains and HTTPS set up for you. You can skip this and
                        do it later.
                    </span>
                </span>
                <ChevronDown className="size-4 shrink-0 text-soft transition group-open:rotate-180" />
            </summary>
            <div className="space-y-3 border-t border-line/60 px-4 py-3 text-xs leading-relaxed text-soft">
                <p>
                    With a Cloudflare token, every tool you install gets its
                    address (DNS record) created automatically, and certificates
                    keep renewing even when Cloudflare proxies your site.
                    Without one, the server still works: you point your
                    domain&apos;s DNS at it yourself, and HTTPS uses Let&apos;s
                    Encrypt over plain HTTP.
                </p>
                <ol className="list-decimal space-y-1 pl-4">
                    <li>
                        Open{' '}
                        <Link
                            href={open().url}
                            method="post"
                            data={{
                                url: 'https://dash.cloudflare.com/profile/api-tokens',
                            }}
                            as="button"
                            className="font-medium text-servers hover:underline"
                        >
                            Cloudflare &rarr; My Profile &rarr; API Tokens
                        </Link>{' '}
                        and choose <strong>Create Token</strong>.
                    </li>
                    <li>
                        Use the <strong>Edit zone DNS</strong> template, and
                        under Zone Resources pick your domain (or all zones).
                    </li>
                    <li>Create it, copy the token, and paste it below.</li>
                </ol>
                <Field
                    label="Cloudflare API token"
                    hint="Used once and never saved in this app. If you don't have one yet, leave it empty: Connect a domain on the server's page does the same later."
                    error={error}
                >
                    <input
                        type="password"
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        autoComplete="off"
                        className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                    />
                </Field>
            </div>
        </details>
    );
}

function Field({
    label,
    hint,
    error,
    children,
}: {
    label: string;
    hint?: string;
    error?: string;
    children: ReactNode;
}) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-soft">
                {label}
            </span>
            {children}
            {error ? (
                <span className="text-bad mt-1 block text-xs">{error}</span>
            ) : (
                hint && (
                    <span className="mt-1 block text-xs text-soft">{hint}</span>
                )
            )}
        </label>
    );
}

function Select({
    value,
    onChange,
    options,
}: {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
}) {
    return (
        <SelectMenu
            value={value}
            onChange={onChange}
            accent="servers"
            options={options}
        />
    );
}
